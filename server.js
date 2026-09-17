import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import pkg from 'tiktok-live-connector';
const { WebcastPushConnection } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

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
const io = new Server(server, { cors: { origin: true, credentials: true } });
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let live = null;
let connection = null;
let reconnectTimer = null;
let game = makeEmptyGame();
const sockets = new Map();

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
function clean(s = '') { return String(s).trim().replace(/^@+/, '').toLowerCase(); }
function norm(s = '') { return String(s).trim().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '').toLowerCase(); }
function shuffle(a) { const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; }
function publicPlayer(p) { return { id:p.id, nickname:p.nickname, uniqueId:p.uniqueId, profilePictureUrl:p.profilePictureUrl, chances:p.chances, revealed:p.revealed, respawnUsed:p.respawnUsed, active:p.chances>p.revealed }; }
function publicState() {
  return {
    tiktok: { username: live?.username || '', connected: !!live?.connected, roomId: live?.roomId || null },
    joined: [...game.players.values()].map(publicPlayer),
    started: game.started,
    multiplier: game.multiplier,
    cards: game.cards.map(c => ({ id:c.id, imgName:c.imgName, imgUrl:c.imgUrl, revealed:c.revealed })),
    currentTurn: game.currentTurn ? publicPlayer(game.players.get(game.currentTurn)) : null,
    previousTurn: game.previousTurn ? publicPlayer(game.players.get(game.previousTurn)) : null,
    modal: game.modal,
    winner: game.winner ? publicPlayer(game.players.get(game.winner)) : null,
    remaining: game.cards.filter(c=>!c.revealed).length,
    activeCount: [...game.players.values()].filter(p=>p.chances>p.revealed).length
  };
}
function broadcastState() { io.emit('game:state', publicState()); }
function sendChatLine(data) {
  io.emit('live:chat', {
    nickname: data?.nickname || data?.uniqueId || 'مستخدم',
    uniqueId: data?.uniqueId || '',
    profilePictureUrl: data?.profilePictureUrl || '',
    comment: data?.comment || ''
  });
}
function findPlayer(uniqueId) { return game.players.get(clean(uniqueId)); }
function chooseCards() {
  const total = game.players.size * game.multiplier;
  const selected = shuffle(GAME_IMAGES).slice(0,total);
  const assignments=[];
  for (const p of game.players.values()) for(let i=0;i<p.chances;i++) assignments.push(p.id);
  const ids=shuffle(assignments);
  return selected.map((img,i)=>({id:i,imgName:img.name,imgUrl:img.url,playerId:ids[i],revealed:false}));
}
function revealByComment(player, comment) {
  if (!game.started || !player) return false;
  if (game.modal) return false;
  if (game.currentTurn && game.currentTurn !== player.id) return false;
  const wanted = norm(comment);
  const card = game.cards.find(c=>!c.revealed && norm(c.imgName)===wanted);
  if (!card) return false;
  const actorId = game.currentTurn || player.id;
  game.previousTurn = actorId;
  card.revealed=true;
  const target=game.players.get(card.playerId);
  if (target) target.revealed++;
  const targetName=target?.nickname || 'لاعب';
  game.modal = { cardId:card.id, imageName:card.imgName, imageUrl:card.imgUrl, playerId:target?.id || null, playerNickname:targetName, openedAt:Date.now(), countdown:5 };
  if (target && target.chances <= target.revealed) {
    // The target is out, but may return later by the qualifying gift.
  }
  if ([...game.players.values()].filter(p=>p.chances>p.revealed).length === 1) {
    const only=[...game.players.values()].find(p=>p.chances>p.revealed);
    if (only) game.winner=only.id;
  }
  game.history.push({ by:player.id, cardId:card.id, at:Date.now() });
  broadcastState();
  setTimeout(() => finishModal(card.id), 5000);
  return true;
}
function finishModal(cardId) {
  if (!game.modal || game.modal.cardId !== cardId) return;
  const nextTurn = game.modal.playerId;
  game.modal = null;
  if (nextTurn && game.players.has(nextTurn)) game.currentTurn = nextTurn;
  if (game.winner && game.cards.every(c=>c.revealed)) {
    broadcastState();
    return;
  }
  broadcastState();
}
function forceCloseModal() {
  if(!game.modal) return;
  const nextTurn = game.modal.playerId;
  game.modal = null;
  if(nextTurn && game.players.has(nextTurn)) game.currentTurn = nextTurn;
  broadcastState();
}
function rebuildUnrevealedAssignments(newPlayerId=null, newCardId=null) {
  const unrevealed=game.cards.filter(c=>!c.revealed);
  const pool=[];
  for(const p of game.players.values()) for(let i=p.chances-p.revealed;i>0;i--) pool.push(p.id);
  if(pool.length !== unrevealed.length) return false;
  for(let tries=0;tries<100;tries++){
    const ids=shuffle(pool);
    if(newPlayerId && newCardId){
      const idx=unrevealed.findIndex(c=>c.id===newCardId);
      if(idx>=0 && ids[idx]===newPlayerId) continue;
    }
    unrevealed.forEach((c,i)=>c.playerId=ids[i]);
    const shuffled=shuffle(unrevealed);
    let k=0; game.cards=game.cards.map(c=>c.revealed?c:shuffled[k++]);
    return true;
  }
  return false;
}
function canRespawn(p) {
  return p && p.chances <= p.revealed && !p.respawnUsed && game.cards.filter(c=>!c.revealed).length > 2 && game.started;
}
function respawnPlayer(p) {
  if(!canRespawn(p)) return false;
  const activeNames=new Set(game.cards.filter(c=>!c.revealed).map(c=>c.imgName));
  const pool=GAME_IMAGES.filter(i=>!activeNames.has(i.name));
  if(!pool.length) return false;
  const img=pool[Math.floor(Math.random()*pool.length)];
  const card={id:Date.now()+Math.random(),imgName:img.name,imgUrl:img.url,playerId:p.id,revealed:false};
  game.cards.push(card);
  p.chances += 1;
  p.respawnUsed = true;
  game.winner=null;
  if(!rebuildUnrevealedAssignments(p.id, card.id)) return false;
  broadcastState();
  return true;
}
function isRoseGift(data) {
  const name = String(data.giftDetails?.giftName || data.giftName || data.extendedGiftInfo?.name || '').toLowerCase();
  const describe = String(data.giftDetails?.giftDescribe || data.describe || data.extendedGiftInfo?.describe || '').toLowerCase();
  return name === 'rose' || name.includes('rose') || name.includes('وردة') || describe.includes('rose') || describe.includes('وردة');
}
async function disconnectTikTok() {
  if(connection){ try{await connection.disconnect();}catch{} }
  connection=null;
  if(live) live.connected=false;
  broadcastState();
}
function connectTikTok(username) {
  const uniqueId=clean(username);
  if(!uniqueId) throw new Error('أدخل يوزر تيكتوك أولاً');

  // Legacy connector 1.2.3 supports HTTP polling and can be used without
  // the Euler Stream WebSocket signing service. This avoids the Business-plan
  // signature endpoint shown in the previous error.
  disconnectTikTok();

  connection = new WebcastPushConnection(uniqueId, {
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: false,
    requestPollingIntervalMs: 1500
  });

  live={username:uniqueId,connected:false,roomId:null};

  connection.on('chat', data => {
    sendChatLine(data);

    const uid=clean(data?.uniqueId);
    if(!uid) return;

    const p=findPlayer(uid);
    const comment=String(data?.comment || '').trim();

    if(!game.started){
      const pass=String(live?.password || 'تم');
      if(comment === pass && !p && game.players.size < 30){
        game.players.set(uid,{
          id:uid,
          uniqueId:uid,
          nickname:data?.nickname || uid,
          profilePictureUrl:data?.profilePictureUrl || '',
          chances:game.multiplier,
          revealed:0,
          respawnUsed:false
        });
        broadcastState();
      }
      return;
    }

    if(p) revealByComment(p, comment);
  });

  connection.on('gift', data => {
    const p=findPlayer(data?.uniqueId);
    const repeatEnd = data?.repeatEnd ?? data?.repeat_end ?? true;
    if(p && isRoseGift(data) && (repeatEnd === true || repeatEnd === 1 || repeatEnd === '1')) {
      respawnPlayer(p);
    }
  });

  connection.on('connected', state => {
    if(live){
      live.connected=true;
      live.roomId=state?.roomId || null;
    }
    broadcastState();
  });

  connection.on('disconnected', () => {
    if(live) live.connected=false;
    broadcastState();
  });

  connection.on('error', err => {
    console.error('[TikTok] error:', err);
    io.emit('live:error', `تعذر الاتصال بالبث: ${err?.message || String(err)}`);
    if(live) live.connected=false;
    broadcastState();
  });

  connection.connect()
    .then(state => {
      if(live){
        live.connected=true;
        live.roomId=state?.roomId || null;
      }
      broadcastState();
    })
    .catch(err => {
      console.error('[TikTok] connect failed:', err);
      io.emit('live:error', `تعذر الاتصال بالبث: ${err?.message || String(err)}`);
      if(live) live.connected=false;
      broadcastState();
    });
}

io.on('connection', socket => {
  sockets.set(socket.id,socket);
  socket.emit('game:state', publicState());
  socket.on('host:connect', ({username,password='تم'}={}) => {
    live={...(live||{}),password:String(password||'تم')};
    try{ connectTikTok(username); }catch(e){socket.emit('live:error',e.message);}
  });
  socket.on('host:setPassword', password => { if(live) live.password=String(password||'تم'); });
  socket.on('host:start', ({multiplier=1}={}) => {
    if(game.started) return;
    const m=Number(multiplier);
    if(![1,2,3].includes(m) || game.players.size<2) return socket.emit('game:error','يلزم لاعبان على الأقل.');
    if(m===2 && game.players.size>15) return socket.emit('game:error','×2 متاحة حتى 15 لاعباً.');
    if(m===3 && game.players.size>10) return socket.emit('game:error','×3 متاحة حتى 10 لاعبين.');
    game.multiplier=m; for(const p of game.players.values()){p.chances=m;p.revealed=0;p.respawnUsed=false;}
    game.cards=chooseCards(); game.started=true; game.winner=null; game.modal=null; game.history=[];
    game.currentTurn=null; game.previousTurn=null; game.hostSocketId=socket.id;
    broadcastState();
  });
  socket.on('host:previousTurn', () => {
    if(!game.started || game.modal || !game.previousTurn) return;
    game.currentTurn=game.previousTurn; game.previousTurn=null; broadcastState();
  });
  socket.on('host:closeModal', () => forceCloseModal());
  socket.on('host:reset', async()=>{ await disconnectTikTok(); game=makeEmptyGame(); broadcastState(); });
  socket.on('disconnect',()=>sockets.delete(socket.id));
});

server.listen(PORT,()=>console.log(`Server listening on ${PORT}`));
process.on('SIGTERM',async()=>{await disconnectTikTok();server.close(()=>process.exit(0));});
