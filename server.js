import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  SignConfig
} from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

// TikTok-Live-Connector 2.4.4 requires a signed WebSocket URL.
// Euler's endpoint is currently returning a Business-plan error for this project.
// Tik.Tools documents a compatible signing backend and can be selected through
// these environment variables. The public demo key is intentionally the default;
// for longer/heavier use, set TIKTOOLS_API_KEY in Render.
SignConfig.basePath = process.env.TIKTOOLS_SIGN_URL || 'https://api.tik.tools';
SignConfig.apiKey = process.env.TIKTOOLS_API_KEY || 'your_api_key';

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
app.get('/health', (_req, res) => res.json({
  ok: true,
  version: '1.0.1',
  connector: '2.4.4',
  signServer: SignConfig.basePath
}));
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let live = null;
let connection = null;
let game = makeEmptyGame();

function makeEmptyGame() {
  return { started:false, multiplier:1, players:new Map(), cards:[], currentTurn:null, previousTurn:null, modal:null, winner:null, history:[], hostSocketId:null };
}
function clean(s='') { return String(s).trim().replace(/^@+/,'').toLowerCase(); }
function norm(s='') { return String(s).trim().replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/ـ/g,'').toLowerCase(); }
function shuffle(a) { const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; }
function profileUrl(user={}) {
  return user.profilePictureUrl || user.profilePicture?.urlList?.[0] || user.profilePicture?.urls?.[0] || user.avatarLarger?.urlList?.[0] || '';
}
function publicPlayer(p) { return p ? {id:p.id,nickname:p.nickname,uniqueId:p.uniqueId,profilePictureUrl:p.profilePictureUrl,chances:p.chances,revealed:p.revealed,respawnUsed:p.respawnUsed,active:p.chances>p.revealed} : null; }
function publicState() {
  return {tiktok:{username:live?.username||'',connected:!!live?.connected,roomId:live?.roomId||null},joined:[...game.players.values()].map(publicPlayer),started:game.started,multiplier:game.multiplier,cards:game.cards.map(c=>({id:c.id,imgName:c.imgName,imgUrl:c.imgUrl,revealed:c.revealed})),currentTurn:publicPlayer(game.players.get(game.currentTurn)),previousTurn:publicPlayer(game.players.get(game.previousTurn)),modal:game.modal,winner:publicPlayer(game.players.get(game.winner)),remaining:game.cards.filter(c=>!c.revealed).length,activeCount:[...game.players.values()].filter(p=>p.chances>p.revealed).length};
}
function broadcastState(){io.emit('game:state',publicState());}
function sendChatLine(data){io.emit('live:chat',{nickname:data?.user?.nickname||data?.nickname||data?.user?.uniqueId||data?.uniqueId||'مستخدم',uniqueId:data?.user?.uniqueId||data?.uniqueId||'',profilePictureUrl:profileUrl(data?.user||data),comment:data?.comment||''});}
function userFromEvent(data){return data?.user||{};}
function playerFromEvent(data){const u=userFromEvent(data); const uid=clean(u.uniqueId||data?.uniqueId); return {uid,nickname:u.nickname||data?.nickname||uid,profilePictureUrl:profileUrl(u)||profileUrl(data)};}
function findPlayer(uniqueId){return game.players.get(clean(uniqueId));}
function chooseCards(){const total=game.players.size*game.multiplier;const selected=shuffle(GAME_IMAGES).slice(0,total);const assignments=[];for(const p of game.players.values())for(let i=0;i<p.chances;i++)assignments.push(p.id);const ids=shuffle(assignments);return selected.map((img,i)=>({id:i,imgName:img.name,imgUrl:img.url,playerId:ids[i],revealed:false}));}
function revealByComment(player,comment){if(!game.started||!player||game.modal)return false;if(game.currentTurn&&game.currentTurn!==player.id)return false;const card=game.cards.find(c=>!c.revealed&&norm(c.imgName)===norm(comment));if(!card)return false;const actorId=game.currentTurn||player.id;game.previousTurn=actorId;card.revealed=true;const target=game.players.get(card.playerId);if(target)target.revealed++;game.modal={cardId:card.id,imageName:card.imgName,imageUrl:card.imgUrl,playerId:target?.id||null,playerNickname:target?.nickname||'لاعب',openedAt:Date.now(),countdown:5};if([...game.players.values()].filter(p=>p.chances>p.revealed).length===1){const only=[...game.players.values()].find(p=>p.chances>p.revealed);if(only)game.winner=only.id;}game.history.push({by:player.id,cardId:card.id,at:Date.now()});broadcastState();setTimeout(()=>finishModal(card.id),5000);return true;}
function finishModal(cardId){if(!game.modal||game.modal.cardId!==cardId)return;const next=game.modal.playerId;game.modal=null;if(next&&game.players.has(next))game.currentTurn=next;broadcastState();}
function forceCloseModal(){if(!game.modal)return;const next=game.modal.playerId;game.modal=null;if(next&&game.players.has(next))game.currentTurn=next;broadcastState();}
function rebuildUnrevealedAssignments(newPlayerId=null,newCardId=null){const unrevealed=game.cards.filter(c=>!c.revealed);const pool=[];for(const p of game.players.values())for(let i=p.chances-p.revealed;i>0;i--)pool.push(p.id);if(pool.length!==unrevealed.length)return false;for(let tries=0;tries<100;tries++){const ids=shuffle(pool);if(newPlayerId&&newCardId){const idx=unrevealed.findIndex(c=>c.id===newCardId);if(idx>=0&&ids[idx]===newPlayerId)continue;}unrevealed.forEach((c,i)=>c.playerId=ids[i]);return true;}return false;}
function canRespawn(p){return p&&p.chances<=p.revealed&&!p.respawnUsed&&game.cards.filter(c=>!c.revealed).length>2&&game.started;}
function respawnPlayer(p){if(!canRespawn(p))return false;const activeNames=new Set(game.cards.filter(c=>!c.revealed).map(c=>c.imgName));const pool=GAME_IMAGES.filter(i=>!activeNames.has(i.name));if(!pool.length)return false;const img=pool[Math.floor(Math.random()*pool.length)];p.chances+=1;p.respawnUsed=true;game.winner=null;game.cards.push({id:Date.now()+Math.random(),imgName:img.name,imgUrl:img.url,playerId:p.id,revealed:false});if(!rebuildUnrevealedAssignments())return false;broadcastState();return true;}
function isRoseGift(data){const name=String(data?.giftDetails?.giftName||data?.extendedGiftInfo?.name||data?.giftName||'').toLowerCase();const describe=String(data?.giftDetails?.giftDescribe||data?.extendedGiftInfo?.describe||data?.describe||'').toLowerCase();return name.includes('rose')||name.includes('وردة')||describe.includes('rose')||describe.includes('وردة');}
async function disconnectTikTok(){if(connection){try{await connection.disconnect();}catch{}}connection=null;if(live)live.connected=false;broadcastState();}

async function connectTikTok(username){
  const uniqueId=clean(username); if(!uniqueId)throw new Error('أدخل يوزر تيكتوك أولاً');
  await disconnectTikTok();

  connection=new TikTokLiveConnection(uniqueId,{processInitialData:false,fetchRoomInfoOnConnect:true,enableExtendedGiftInfo:true,disableEulerFallbacks:true});
  live={username:uniqueId,connected:false,roomId:null};

  connection.on(WebcastEvent.CHAT,data=>{
    sendChatLine(data);
    const {uid,nickname,profilePictureUrl}=playerFromEvent(data); if(!uid)return;
    const comment=String(data?.comment||'').trim();
    const p=findPlayer(uid);
    if(!game.started){
      const pass=String(live?.password||'تم');
      if(comment===pass&&!p&&game.players.size<30){
        game.players.set(uid,{id:uid,uniqueId:uid,nickname,profilePictureUrl,chances:game.multiplier,revealed:0,respawnUsed:false});
        broadcastState();
      }
      return;
    }
    if(p)revealByComment(p,comment);
  });

  connection.on(WebcastEvent.GIFT,data=>{
    const {uid}=playerFromEvent(data); const p=findPlayer(uid);
    const repeatEnd=data?.repeatEnd??data?.repeat_end??true;
    if(p&&isRoseGift(data)&&(repeatEnd===true||repeatEnd===1||repeatEnd==='1'))respawnPlayer(p);
  });

  connection.on(ControlEvent.CONNECTED,state=>{
    if(live){live.connected=true;live.roomId=state?.roomId||connection?.roomId||null;}
    broadcastState();
  });
  connection.on(ControlEvent.DISCONNECTED,()=>{if(live)live.connected=false;broadcastState();});
  connection.on(ControlEvent.ERROR,({info,exception}={})=>{
    const err=exception||info||new Error('خطأ غير معروف');
    console.error('[TikTok]',err);
    io.emit('live:error',`تعذر الاتصال بالبث: ${err?.message||String(err)}`);
    if(live)live.connected=false;broadcastState();
  });

  try{
    const state=await connection.connect();
    if(live){live.connected=true;live.roomId=state?.roomId||connection.roomId||null;}
    broadcastState();
  }catch(err){
    if(live)live.connected=false;
    broadcastState();
    throw err;
  }
}

io.on('connection',socket=>{
  socket.emit('game:state',publicState());
  socket.on('host:connect',async({username,password='تم'}={})=>{
    try{live=live||{};live.password=String(password);await connectTikTok(username);socket.emit('live:status',{ok:true,message:'تم الاتصال بالبث'});}catch(err){socket.emit('live:status',{ok:false,message:err?.message||String(err)});}
  });
  socket.on('host:setPassword',({password}={})=>{live=live||{};live.password=String(password??'تم');});
  socket.on('host:setMultiplier',({multiplier}={})=>{const m=Number(multiplier);if(![1,2,3].includes(m)||game.started)return;if(m===2&&game.players.size>15)return;if(m===3&&game.players.size>10)return;game.multiplier=m;for(const p of game.players.values()){p.chances=m;p.revealed=0;p.respawnUsed=false;}broadcastState();});
  socket.on('host:start',()=>{if(game.started)return;if(game.players.size<2){socket.emit('live:status',{ok:false,message:'يجب أن ينضم لاعبان على الأقل'});return;}if(game.multiplier===2&&game.players.size>15){socket.emit('live:status',{ok:false,message:'×2 يسمح بحد أقصى 15 لاعباً'});return;}if(game.multiplier===3&&game.players.size>10){socket.emit('live:status',{ok:false,message:'×3 يسمح بحد أقصى 10 لاعبين'});return;}game.started=true;game.cards=chooseCards();game.currentTurn=null;game.previousTurn=null;game.winner=null;broadcastState();});
  socket.on('host:previousTurn',()=>{if(game.started&&game.previousTurn&&game.players.has(game.previousTurn)&&!game.modal){game.currentTurn=game.previousTurn;game.previousTurn=null;broadcastState();}});
  socket.on('host:closeModal',forceCloseModal);
  socket.on('host:reset',()=>{game=makeEmptyGame();broadcastState();});
  socket.on('host:disconnectTikTok',async()=>{await disconnectTikTok();});
});

server.listen(PORT,()=>console.log(`Server listening on ${PORT} | connector 2.4.4 | signer ${SignConfig.basePath}`));
process.on('SIGTERM',async()=>{await disconnectTikTok();server.close(()=>process.exit(0));});
