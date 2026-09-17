import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const GAME_IMAGES = [
  { name: 'البلوط', url: 'https://i.postimg.cc/jd4xxQN3/alblwt.webp' },
  { name: 'الترفاس', url: 'https://i.postimg.cc/wTQqqcJC/altrfas.webp' },
  { name: 'الزعرور', url: 'https://i.postimg.cc/287kkFvc/alzʿrwr.webp' },
  { name: 'السرو', url: 'https://i.postimg.cc/W1p2hFwc/alsrw.webp' },
  { name: 'السكوم', url: 'https://i.postimg.cc/ZKxbbFpm/alskwm.webp' },
  { name: 'الشيح', url: 'https://i.postimg.cc/K8cZRkrw/alshyh.webp' },
  { name: 'الصنوبر', url: 'https://i.postimg.cc/sD4jj97y/alsnwbr.webp' },
  { name: 'الضرو', url: 'https://i.postimg.cc/DyPvvdL7/aldrw.webp' },
  { name: 'العرعر', url: 'https://i.postimg.cc/5NS44qLc/alʿrʿr.webp' },
  { name: 'العسلوج', url: 'https://i.postimg.cc/TYJddqmC/alʿslwj.webp' },
  { name: 'الفطر', url: 'https://i.postimg.cc/YqzrrfYH/alftr.webp' },
  { name: 'القرنون', url: 'https://i.postimg.cc/vHtYYL9X/alqrnwn.webp' },
  { name: 'القرنينة', url: 'https://i.postimg.cc/QxJ88k5f/alqrnynt.webp' },
  { name: 'القسطل', url: 'https://i.postimg.cc/DyPvvdL3/alqstl.webp' },
  { name: 'اللنج', url: 'https://i.postimg.cc/tCNqqtPM/allnj.webp' },
  { name: 'النبق', url: 'https://i.postimg.cc/L6399BfW/alnbq.webp' },
  { name: 'الحريقة', url: 'https://i.postimg.cc/FsVrrg39/alhryqt.webp' },
  { name: 'بازلاء', url: 'https://i.postimg.cc/T32RpLJR/bazlaʾ.webp' },
  { name: 'البصل', url: 'https://i.postimg.cc/fRWwJtfN/bsl.jpg' },
  { name: 'البقدونس', url: 'https://i.postimg.cc/sgfVvQ9k/bqdwns.webp' },
  { name: 'توت بري', url: 'https://i.postimg.cc/4x4Jm7Q4/twt-bry.webp' },
  { name: 'تيزانة', url: 'https://i.postimg.cc/yYy11X9r/tyzant.webp' },
  { name: 'التين', url: 'https://i.postimg.cc/Z5YTCBxh/tyn.webp' },
  { name: 'التين الشوكي', url: 'https://i.postimg.cc/7YnHHM08/tyn-shwky.webp' },
  { name: 'الثوم', url: 'https://i.postimg.cc/7ZPxfGn8/thwm.webp' },
  { name: 'الزعيترة', url: 'https://i.postimg.cc/qvBkzhxf/zʿytrt.webp' },
  { name: 'السفرجل', url: 'https://i.postimg.cc/kgMnB6Fk/sfrjl-converti-depuis-jpg.webp' },
  { name: 'كرنب أحمر', url: 'https://i.postimg.cc/x1j0cJ39/krnb-ahmr.webp' },
  { name: 'الليمون', url: 'https://i.postimg.cc/P5ftPpQH/lymwn.webp' },
  { name: 'النعناع', url: 'https://i.postimg.cc/8zk1jJmD/nʿnaʿ.webp' }
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, connector: '2.4.4' }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let live = null;
let tiktokConnection = null;
let connectionGeneration = 0;
let game = makeEmptyGame();

function makeEmptyGame() {
  return {
    started: false,
    multiplier: 1,
    players: new Map(),
    cards: [],
    currentTurn: null,
    previousTurn: null,
    modal: null,
    winner: null,
    history: [],
    hostSocketId: null
  };
}

function clean(s = '') {
  return String(s).trim().replace(/^@+/, '').toLowerCase();
}

function norm(s = '') {
  return String(s).trim()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .toLowerCase();
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function profileUrl(data = {}) {
  const user = data?.user || {};
  const candidates = [
    data?.profilePictureUrl,
    data?.profilePicture?.url,
    ...(Array.isArray(data?.profilePicture?.urls) ? data.profilePicture.urls : []),
    user?.profilePictureUrl,
    user?.profilePicture?.url,
    ...(Array.isArray(user?.profilePicture?.urls) ? user.profilePicture.urls : []),
    user?.userDetails?.profilePictureUrl,
    ...(Array.isArray(user?.userDetails?.profilePictureUrls) ? user.userDetails.profilePictureUrls : []),
    data?.userDetails?.profilePictureUrl,
    ...(Array.isArray(data?.userDetails?.profilePictureUrls) ? data.userDetails.profilePictureUrls : []),
    user?.avatarLarge?.urlList?.[0],
    user?.avatarMedium?.urlList?.[0],
    user?.avatarThumb?.urlList?.[0],
    data?.avatarLarge?.urlList?.[0],
    data?.avatarMedium?.urlList?.[0],
    data?.avatarThumb?.urlList?.[0],
    user?.avatarLarger,
    user?.avatarMedium,
    user?.avatarThumb,
    data?.avatarLarger,
    data?.avatarMedium,
    data?.avatarThumb
  ];
  return candidates.find(v => typeof v === 'string' && /^https?:\/\//i.test(v.trim()))?.trim() || '';
}

function userFromEvent(data) {
  return data?.user || {};
}

function playerFromEvent(data) {
  const u = userFromEvent(data);
  const uid = clean(
    u.uniqueId ?? u.unique_id ?? u.uniqueID ?? u.userDetails?.uniqueId ??
    data?.uniqueId ?? data?.unique_id ?? data?.userDetails?.uniqueId ??
    data?.userId ?? data?.user_id ?? u.userId ?? u.user_id ?? u.id ?? ''
  );

  const nickname = String(
    u.nickname ?? u.displayName ?? u.userDetails?.nickname ??
    data?.nickname ?? data?.displayName ?? data?.userDetails?.nickname ??
    uid ?? 'مستخدم'
  ).trim();

  const userId = String(
    u.userId ?? u.user_id ?? u.id ?? data?.userId ?? data?.user_id ?? ''
  ).trim();

  return {
    uid,
    userId,
    nickname,
    profilePictureUrl: profileUrl(data)
  };
}

function publicPlayer(p) {
  return p ? {
    id: p.id,
    nickname: p.nickname,
    uniqueId: p.uniqueId,
    profilePictureUrl: p.profilePictureUrl,
    chances: p.chances,
    revealed: p.revealed,
    active: p.chances > p.revealed
  } : null;
}

function publicState() {
  return {
    tiktok: {
      username: live?.username || '',
      connected: !!live?.connected,
      roomId: live?.roomId || null
    },
    joined: [...game.players.values()].map(publicPlayer),
    started: game.started,
    multiplier: game.multiplier,
    cards: game.cards.map(c => ({
      id: c.id,
      imgName: c.imgName,
      imgUrl: c.imgUrl,
      revealed: c.revealed
    })),
    currentTurn: publicPlayer(game.players.get(game.currentTurn)),
    previousTurn: publicPlayer(game.players.get(game.previousTurn)),
    modal: game.modal,
    winner: publicPlayer(game.players.get(game.winner)),
    remaining: game.cards.filter(c => !c.revealed).length,
    activeCount: [...game.players.values()].filter(p => p.chances > p.revealed).length
  };
}

function broadcastState() {
  io.emit('game:state', publicState());
}

function sendChatLine(data) {
  const p = playerFromEvent(data);
  const comment = String(
    data?.comment ?? data?.content ?? data?.text ??
    data?.message?.content ?? data?.message?.text ?? ''
  ).trim();

  io.emit('live:chat', {
    nickname: p.nickname,
    uniqueId: p.uid,
    userId: p.userId,
    profilePictureUrl: p.profilePictureUrl,
    comment
  });
}

function findPlayer(uniqueId) {
  return game.players.get(clean(uniqueId));
}

function chooseCards() {
  const total = game.players.size * game.multiplier;
  const selected = shuffle(GAME_IMAGES).slice(0, total);
  const assignments = [];
  for (const p of game.players.values()) {
    for (let i = 0; i < p.chances; i++) assignments.push(p.id);
  }
  const ids = shuffle(assignments);
  return selected.map((img, i) => ({
    id: i,
    imgName: img.name,
    imgUrl: img.url,
    playerId: ids[i],
    revealed: false
  }));
}

function revealByComment(player, comment) {
  if (!game.started || !player || game.modal) return false;
  if (game.currentTurn && game.currentTurn !== player.id) return false;

  const card = game.cards.find(
    c => !c.revealed && norm(c.imgName) === norm(comment)
  );
  if (!card) return false;

  const actorId = game.currentTurn || player.id;
  game.previousTurn = actorId;
  card.revealed = true;

  const target = game.players.get(card.playerId);
  if (target) target.revealed++;

  game.modal = {
    cardId: card.id,
    imageName: card.imgName,
    imageUrl: card.imgUrl,
    playerId: target?.id || null,
    playerNickname: target?.nickname || 'لاعب',
    openedAt: Date.now(),
    countdown: 5
  };

  if ([...game.players.values()].filter(p => p.chances > p.revealed).length === 1) {
    const only = [...game.players.values()].find(p => p.chances > p.revealed);
    if (only) game.winner = only.id;
  }

  game.history.push({ by: player.id, cardId: card.id, at: Date.now() });
  broadcastState();
  setTimeout(() => finishModal(card.id), 5000);
  return true;
}

function finishModal(cardId) {
  if (!game.modal || game.modal.cardId !== cardId) return;
  const next = game.modal.playerId;
  game.modal = null;
  if (next && game.players.has(next)) game.currentTurn = next;
  broadcastState();
}

function forceCloseModal() {
  if (!game.modal) return;
  const next = game.modal.playerId;
  game.modal = null;
  if (next && game.players.has(next)) game.currentTurn = next;
  broadcastState();
}

function rebuildUnrevealedAssignments() {
  const unrevealed = game.cards.filter(c => !c.revealed);
  const pool = [];
  for (const p of game.players.values()) {
    for (let i = p.chances - p.revealed; i > 0; i--) pool.push(p.id);
  }
  if (pool.length !== unrevealed.length) return false;
  const ids = shuffle(pool);
  unrevealed.forEach((c, i) => c.playerId = ids[i]);
  return true;
}

async function safelyDisconnectTikTok() {
  const connection = tiktokConnection;
  tiktokConnection = null;
  if (live) live.connected = false;

  if (!connection) {
    broadcastState();
    return;
  }

  try {
    await connection.disconnect();
  } catch (err) {
    console.warn('خطأ أثناء فصل اتصال TikTok السابق:', err?.message || err);
  }
  broadcastState();
}

function errorToMessage(err) {
  if (!err) return 'خطأ غير معروف من TikTok';
  const name = err.name || '';
  const message = err.message || String(err);
  const full = `${name} ${message}`;

  if (/offline|not live|useroffline/i.test(full)) {
    return 'الحساب ليس في بث مباشر الآن أو أن البث غير متاح للاتصال.';
  }
  if (/room.?id|roomid/i.test(full)) {
    return 'تعذر الحصول على رقم غرفة البث (room ID) من TikTok.';
  }
  if (/websocket|upgrade|socket/i.test(full)) {
    return 'TikTok رفض اتصال WebSocket أو لم يسمح بترقية الاتصال.';
  }
  if (/timeout|timed out|ETIMEDOUT/i.test(full)) {
    return 'انتهت مهلة الاتصال بخوادم TikTok.';
  }
  if (/sign|signature|signing/i.test(full)) {
    return 'فشل توقيع اتصال TikTok WebSocket.';
  }
  return `${name ? name + ': ' : ''}${message}`;
}

async function connectTikTok(username) {
  const uniqueId = clean(username);
  if (!uniqueId) throw new Error('أدخل يوزر تيكتوك أولاً');

  const generation = ++connectionGeneration;
  await safelyDisconnectTikTok();

  console.log(`[TikTok] محاولة الاتصال بالحساب: @${uniqueId}`);
  if (live) {
    live.username = uniqueId;
    live.connected = false;
    live.roomId = null;
  } else {
    live = { username: uniqueId, connected: false, roomId: null, password: 'تم' };
  }
  broadcastState();

  const connection = new TikTokLiveConnection(uniqueId, {
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false
  });

  tiktokConnection = connection;

  connection.on(ControlEvent.ERROR, ({ info, exception } = {}) => {
    const err = exception || info || new Error('خطأ غير معروف');
    console.error('[TikTok] ERROR:', err);
    if (generation !== connectionGeneration) return;
    io.emit('live:error', `تعذر الاتصال بالبث: ${errorToMessage(err)}`);
    if (live) live.connected = false;
    broadcastState();
  });

  connection.on(ControlEvent.CONNECTED, (state) => {
    if (generation !== connectionGeneration) return;
    if (live) {
      live.connected = true;
      live.roomId = state?.roomId || connection.roomId || null;
    }
    console.log(`[TikTok] Connected: @${uniqueId} roomId=${live?.roomId || 'unknown'}`);
    broadcastState();
  });

  connection.on(ControlEvent.WEBSOCKET_CONNECTED, () => {
    if (generation !== connectionGeneration) return;
    console.log(`[TikTok] WebSocket connected: @${uniqueId}`);
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    if (generation !== connectionGeneration) return;
    console.log(`[TikTok] Disconnected: @${uniqueId}`);
    if (live) live.connected = false;
    broadcastState();
  });

  connection.on(WebcastEvent.CHAT, (data) => {
    if (generation !== connectionGeneration) return;

    const p = playerFromEvent(data);
    const comment = String(
      data?.comment ?? data?.content ?? data?.text ??
      data?.message?.content ?? data?.message?.text ?? ''
    ).trim();

    console.log(`[TikTok CHAT] @${p.uid} (${p.nickname}): ${comment}`);

    sendChatLine(data);

    if (!p.uid) return;
    const existing = findPlayer(p.uid);

    if (!game.started) {
      const pass = String(live?.password || 'تم').trim();
      if (comment === pass && !existing && game.players.size < 30) {
        game.players.set(p.uid, {
          id: p.uid,
          uniqueId: p.uid,
          nickname: p.nickname || p.uid,
          profilePictureUrl: p.profilePictureUrl,
          chances: game.multiplier,
          revealed: 0
        });
        console.log(`[GAME] لاعب انضم: @${p.uid} (${p.nickname})`);
        broadcastState();
      }
      return;
    }

    if (existing) revealByComment(existing, comment);
  });

  try {
    const state = await connection.connect();

    if (generation !== connectionGeneration || tiktokConnection !== connection) {
      try { await connection.disconnect(); } catch {}
      return;
    }

    if (live) {
      live.connected = true;
      live.roomId = state?.roomId || connection.roomId || null;
    }

    console.log(`[TikTok] SUCCESS @${uniqueId} roomId=${live?.roomId || 'unknown'}`);
    broadcastState();
    return state;
  } catch (err) {
    console.error('[TikTok] فشل الاتصال:', err);
    console.error('[TikTok] التفاصيل:', err?.stack || err);

    if (generation === connectionGeneration) {
      tiktokConnection = null;
      if (live) live.connected = false;
      broadcastState();
    }
    throw err;
  }
}

io.on('connection', socket => {
  console.log('عميل جديد متصل عبر Socket.IO:', socket.id);
  socket.emit('game:state', publicState());

  socket.on('host:connect', async ({ username, password = 'تم' } = {}) => {
    try {
      live = live || {};
      live.password = String(password).trim() || 'تم';
      await connectTikTok(username);
      socket.emit('live:status', { ok: true, message: 'تم الاتصال بالبث' });
    } catch (err) {
      socket.emit('live:status', {
        ok: false,
        message: `فشل الاتصال: ${errorToMessage(err)}`
      });
    }
  });

  socket.on('host:setPassword', ({ password } = {}) => {
    live = live || {};
    live.password = String(password ?? 'تم');
  });

  socket.on('host:setMultiplier', ({ multiplier } = {}) => {
    const m = Number(multiplier);
    if (![1, 2, 3].includes(m) || game.started) return;
    if (m === 2 && game.players.size > 15) return;
    if (m === 3 && game.players.size > 10) return;

    game.multiplier = m;
    for (const p of game.players.values()) {
      p.chances = m;
      p.revealed = 0;
    }
    broadcastState();
  });

  socket.on('host:start', () => {
    if (game.started) return;
    if (game.players.size < 2) {
      socket.emit('live:status', { ok: false, message: 'يجب أن ينضم لاعبان على الأقل' });
      return;
    }
    if (game.multiplier === 2 && game.players.size > 15) {
      socket.emit('live:status', { ok: false, message: '×2 يسمح بحد أقصى 15 لاعباً' });
      return;
    }
    if (game.multiplier === 3 && game.players.size > 10) {
      socket.emit('live:status', { ok: false, message: '×3 يسمح بحد أقصى 10 لاعبين' });
      return;
    }

    game.started = true;
    game.cards = chooseCards();
    game.currentTurn = null;
    game.previousTurn = null;
    game.winner = null;
    broadcastState();
  });

  socket.on('host:previousTurn', () => {
    if (game.started && game.previousTurn && game.players.has(game.previousTurn) && !game.modal) {
      game.currentTurn = game.previousTurn;
      game.previousTurn = null;
      broadcastState();
    }
  });

  socket.on('host:closeModal', forceCloseModal);

  socket.on('host:reset', () => {
    game = makeEmptyGame();
    broadcastState();
  });

  socket.on('host:disconnectTikTok', async () => {
    ++connectionGeneration;
    await safelyDisconnectTikTok();
    socket.emit('live:status', { ok: false, message: 'تم فصل اتصال TikTok.' });
  });

  socket.on('disconnect', () => {
    console.log('قطع اتصال عميل Socket.IO:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
  console.log(`NODE_ENV=${process.env.NODE_ENV || 'development'}`);
  console.log('TikTok connector: 2.4.4');
});

process.on('SIGTERM', async () => {
  ++connectionGeneration;
  await safelyDisconnectTikTok();
  server.close(() => process.exit(0));
});
