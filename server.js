import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(express.static(process.cwd()));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'ekhtini-rani-khateek' }));

let connection = null;
let connectionGeneration = 0;
let liveUsername = '';
let liveCards = new Map();
let liveGameActive = false;

function cleanUser(value = '') {
    return String(value).trim().replace(/^@+/, '').toLowerCase();
}

function textOf(value = '') {
    return String(value ?? '').trim();
}

function getUniqueId(data) {
    return textOf(
        data?.uniqueId ??
        data?.unique_id ??
        data?.user?.uniqueId ??
        data?.user?.unique_id ??
        data?.userInfo?.user?.uniqueId ??
        data?.userInfo?.user?.unique_id
    );
}

function getNickname(data) {
    return textOf(
        data?.nickname ??
        data?.nickName ??
        data?.user?.nickname ??
        data?.user?.nickName ??
        data?.userInfo?.user?.nickname ??
        data?.userInfo?.user?.nickName ??
        getUniqueId(data)
    );
}

function getAvatar(data) {
    return textOf(
        data?.profilePictureUrl ??
        data?.profilePicture?.url ??
        data?.user?.profilePictureUrl ??
        data?.user?.avatarLarger ??
        data?.user?.avatarMedium ??
        data?.user?.avatarThumb ??
        data?.userInfo?.user?.avatarLarger ??
        data?.userInfo?.user?.avatarMedium ??
        data?.userInfo?.user?.avatarThumb ??
        ''
    );
}

function normalizeText(value = '') {
    return String(value)
        .normalize('NFKC')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[إأآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .trim()
        .toLocaleLowerCase('ar');
}

function publicCards() {
    return [...liveCards.values()].map(card => ({
        id: card.id,
        imgName: card.imgName,
        revealed: card.revealed
    }));
}

async function disconnectCurrent() {
    if (!connection) return;
    const old = connection;
    connection = null;
    try {
        await old.disconnect();
    } catch (error) {
        console.warn('TikTok disconnect warning:', error?.message || error);
    }
}

async function connectTikTok(uniqueId) {
    const username = cleanUser(uniqueId);
    if (!username) throw new Error('اسم حساب TikTok غير صالح');

    const myGeneration = ++connectionGeneration;
    await disconnectCurrent();

    liveUsername = username;
    liveCards.clear();
    liveGameActive = false;

    // هذه هي طريقة الاتصال المعتمدة التي تعمل مع tiktok-live-connector 2.4.4.
    const c = new TikTokLiveConnection(username, {
        processInitialData: false,
        fetchRoomInfoOnConnect: true,
        enableExtendedGiftInfo: false
    });

    connection = c;

    c.on(ControlEvent.ERROR, (error) => {
        if (myGeneration !== connectionGeneration) return;
        console.error('TikTok connector error:', error);
        io.emit('tiktok-error', error?.message || 'حدث خطأ أثناء الاتصال بالبث.');
    });

    c.on(ControlEvent.CONNECTED, (state) => {
        if (myGeneration !== connectionGeneration) return;
        console.log(`TikTok connected: @${liveUsername}`, state?.roomId || '');
        io.emit('tiktok-connected', {
            username: liveUsername,
            roomId: state?.roomId || null
        });
    });

    c.on(ControlEvent.WEBSOCKET_CONNECTED, () => {
        if (myGeneration !== connectionGeneration) return;
        console.log(`TikTok websocket connected: @${liveUsername}`);
    });

    c.on(ControlEvent.DISCONNECTED, () => {
        if (myGeneration !== connectionGeneration) return;
        console.log(`TikTok disconnected: @${liveUsername}`);
        liveGameActive = false;
        io.emit('tiktok-disconnected');
    });

    c.on(WebcastEvent.CHAT, (data) => {
        if (myGeneration !== connectionGeneration) return;

        const uniqueId = getUniqueId(data);
        const nickname = getNickname(data);
        const comment = textOf(data?.comment ?? data?.text ?? data?.message);
        const avatar = getAvatar(data);

        io.emit('chat-message', {
            uniqueId,
            nickname,
            comment,
            avatar
        });

        // أثناء اللعبة: ابحث عن أول صورة غير مكشوفة يطابق اسمها تعليق المشاهد.
        if (!liveGameActive || !uniqueId || !comment) return;

        const normalizedComment = normalizeText(comment);
        for (const card of liveCards.values()) {
            if (card.revealed) continue;
            if (normalizeText(card.imgName) !== normalizedComment) continue;

            // إرسال الحدث للواجهة المضيفة؛ الواجهة تتحقق من صاحب الدور.
            io.emit('live-card-click', {
                cardId: card.id,
                uniqueId,
                nickname,
                avatar,
                comment
            });
            break;
        }
    });

    await c.connect();
}

io.on('connection', (socket) => {
    socket.on('connect-tiktok', async (uniqueId) => {
        try {
            await connectTikTok(uniqueId);
        } catch (error) {
            console.error('TikTok connection failed:', error);
            socket.emit('tiktok-error', error?.message || 'فشل الاتصال بالبث.');
        }
    });

    // المتصفح هو مصدر حالة بطاقات اللعبة، والسيرفر يحتفظ بنسخة الأسماء فقط
    // حتى يستطيع مطابقة تعليقات TikTok بدون كشف الأسماء للمتابعين.
    socket.on('live-game-cards', (list) => {
        if (!Array.isArray(list)) return;

        const next = new Map();
        for (const item of list) {
            if (!item || item.id === undefined || item.id === null) continue;
            const imgName = textOf(item.imgName);
            if (!imgName) continue;
            next.set(String(item.id), {
                id: item.id,
                imgName,
                revealed: Boolean(item.revealed)
            });
        }

        liveCards = next;
        liveGameActive = next.size > 0;
    });

    socket.on('live-reset-game', () => {
        liveCards.clear();
        liveGameActive = false;
    });

    socket.on('disconnect', () => {
        // لا نقطع TikTok هنا؛ اتصال البث تابع للخادم وليس لتبويب واحد.
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
