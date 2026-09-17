import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const PORT = Number(process.env.PORT) || 3000;

app.use(express.static(process.cwd()));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'ekhtini-rani-khateek', connector: '2.4.4' }));

let connection = null;
let connectionGeneration = 0;
let liveUsername = '';
let liveRoomId = null;
let liveConnected = false;
let liveCards = new Map();
let liveGameActive = false;

function cleanUser(value = '') {
  return String(value ?? '').trim().replace(/^@+/, '').replace(/^https?:\/\/www\.tiktok\.com\/@?/i, '').replace(/\/.*$/, '').toLowerCase();
}

function textOf(value = '') { return String(value ?? '').trim(); }

function errorText(error) {
  if (!error) return 'خطأ غير معروف من TikTok.';
  const parts = [];
  if (typeof error === 'string') parts.push(error);
  if (error.message) parts.push(error.message);
  if (error.info) parts.push(typeof error.info === 'string' ? error.info : JSON.stringify(error.info));
  if (error.exception?.message) parts.push(error.exception.message);
  if (error.reason) parts.push(error.reason);
  if (error.code !== undefined) parts.push(`code=${error.code}`);
  const unique = [...new Set(parts.filter(Boolean).map(String))];
  return unique.join(' | ') || 'تعذر الاتصال بحساب TikTok.';
}

function emitStatus(socket, status, extra = {}) {
  const payload = { status, username: liveUsername, roomId: liveRoomId, connected: liveConnected, ...extra };
  if (socket) socket.emit('tiktok-status', payload);
  io.emit('tiktok-status', payload);
}

function getUniqueId(data) {
  return textOf(data?.user?.uniqueId ?? data?.uniqueId ?? data?.userInfo?.user?.uniqueId ?? data?.user?.unique_id ?? data?.unique_id);
}
function getNickname(data) {
  return textOf(data?.user?.nickname ?? data?.nickname ?? data?.userInfo?.user?.nickname ?? getUniqueId(data));
}
function getAvatar(data) {
  return textOf(
    data?.user?.avatarLarger?.urlList?.[0] ??
    data?.user?.avatarMedium?.urlList?.[0] ??
    data?.user?.avatarThumb?.urlList?.[0] ??
    data?.user?.avatarLarger ??
    data?.user?.avatarMedium ??
    data?.user?.avatarThumb ??
    data?.profilePictureUrl ??
    data?.profilePicture?.url ?? ''
  );
}

function normalizeText(value = '') {
  return String(value).normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .trim().toLocaleLowerCase('ar');
}

async function disconnectCurrent() {
  const old = connection;
  connection = null;
  connectionGeneration++;
  liveConnected = false;
  liveRoomId = null;
  if (!old) return;
  try { await old.disconnect(); } catch (e) { console.warn('TikTok disconnect:', errorText(e)); }
}

function attachConnectionEvents(c, generation, username) {
  c.on(ControlEvent.WEBSOCKET_CONNECTED, () => {
    if (generation !== connectionGeneration) return;
    console.log(`[TikTok] websocket connected @${username}`);
    emitStatus(null, 'websocket_connected');
  });

  c.on(ControlEvent.CONNECTED, (state) => {
    if (generation !== connectionGeneration) return;
    liveConnected = true;
    liveRoomId = state?.roomId ?? null;
    console.log(`[TikTok] CONNECTED @${username} room=${liveRoomId ?? 'unknown'}`);
    io.emit('tiktok-connected', { username, roomId: liveRoomId });
    emitStatus(null, 'connected');
  });

  c.on(ControlEvent.ERROR, (error) => {
    if (generation !== connectionGeneration) return;
    const msg = errorText(error);
    console.error(`[TikTok] ERROR @${username}:`, msg, error);
    io.emit('tiktok-error', msg);
    emitStatus(null, 'error', { message: msg });
  });

  c.on(ControlEvent.DISCONNECTED, (info) => {
    if (generation !== connectionGeneration) return;
    liveConnected = false;
    console.warn(`[TikTok] DISCONNECTED @${username}:`, errorText(info));
    io.emit('tiktok-disconnected', info || null);
    emitStatus(null, 'disconnected', { message: errorText(info) });
  });

  c.on(WebcastEvent.CHAT, (data) => {
    if (generation !== connectionGeneration) return;
    const uniqueId = getUniqueId(data);
    const nickname = getNickname(data);
    const comment = textOf(data?.comment ?? data?.text ?? data?.message);
    const avatar = getAvatar(data);

    io.emit('chat-message', { uniqueId, nickname, comment, avatar, profilePictureUrl: avatar });

    if (!liveGameActive || !comment) return;
    const wanted = normalizeText(comment);
    for (const card of liveCards.values()) {
      if (card.revealed) continue;
      if (normalizeText(card.imgName) === wanted) {
        io.emit('live-card-click', { cardId: card.id, uniqueId, nickname, avatar, profilePictureUrl: avatar, comment });
        break;
      }
    }
  });
}

async function connectTikTok(rawUsername, requesterSocket) {
  const username = cleanUser(rawUsername);
  if (!username) throw new Error('يرجى إدخال اسم حساب TikTok صحيح بدون @ أو رابط كامل.');

  await disconnectCurrent();
  liveUsername = username;
  liveCards.clear();
  liveGameActive = false;
  emitStatus(requesterSocket, 'connecting');

  const generation = ++connectionGeneration;
  const c = new TikTokLiveConnection(username, {
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false
  });
  connection = c;
  attachConnectionEvents(c, generation, username);

  console.log(`[TikTok] connecting to @${username} ...`);

  // connect() normally resolves after the WebSocket/room is ready. A timeout
  // prevents the UI from staying indefinitely on "جاري الاتصال".
  let timer;
  try {
    await Promise.race([
      c.connect(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('انتهت مهلة الاتصال بـ TikTok بعد 35 ثانية. تحقق من أن الحساب في بث مباشر وحاول مرة أخرى.')), 35000);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (generation !== connectionGeneration) throw new Error('تم استبدال اتصال TikTok باتصال أحدث.');
  if (!liveConnected) {
    liveConnected = true;
    liveRoomId = c.roomId ?? null;
    io.emit('tiktok-connected', { username, roomId: liveRoomId });
  }
}

io.on('connection', (socket) => {
  socket.emit('tiktok-status', { status: liveConnected ? 'connected' : 'idle', username: liveUsername, roomId: liveRoomId, connected: liveConnected });

  socket.on('connect-tiktok', async (uniqueId) => {
    try {
      await connectTikTok(uniqueId, socket);
    } catch (error) {
      const msg = errorText(error);
      console.error('[TikTok] connect failed:', msg, error);
      if (connection) {
        try { await connection.disconnect(); } catch {}
        connection = null;
      }
      liveConnected = false;
      liveRoomId = null;
      socket.emit('tiktok-error', msg);
      socket.emit('tiktok-status', { status: 'error', username: cleanUser(uniqueId), connected: false, message: msg });
    }
  });

  socket.on('disconnect-tiktok', async () => {
    await disconnectCurrent();
    liveUsername = '';
    liveCards.clear();
    liveGameActive = false;
    io.emit('tiktok-disconnected');
  });

  socket.on('live-game-cards', (list) => {
    if (!Array.isArray(list)) return;
    const next = new Map();
    for (const item of list) {
      if (!item || item.id === undefined || item.id === null) continue;
      const imgName = textOf(item.imgName);
      if (!imgName) continue;
      next.set(String(item.id), { id: item.id, imgName, revealed: Boolean(item.revealed) });
    }
    liveCards = next;
    liveGameActive = next.size > 0;
  });

  socket.on('live-reset-game', () => {
    liveCards.clear();
    liveGameActive = false;
  });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
