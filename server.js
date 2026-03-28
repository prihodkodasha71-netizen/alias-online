const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

const words = {
    uk: ['кіт','собака','сонце','місяць','дерево','квітка','будинок','машина','літак','книга','телефон','комп\'ютер','музика','танець','школа','вчитель','лікар','піца','морозиво','шоколад','футбол','гітара','камера','робот','дракон','замок','пірат','космос','планета','ракета','океан','гора','річка','ліс','птах','метелик','павук','слон','жираф','мавпа','ведмідь','лев','тигр','вовк','заєць','черепаха','дельфін','акула','краб','зірка','хмара','дощ','сніг','вітер','блискавка','веселка','вулкан','землетрус','водоспад','печера','острів','пустеля','джунглі','айсберг','магніт','батарейка','парашут','підводний човен','телескоп','мікроскоп','годинник','календар','компас','карта','прапор','корона','меч','щит','лук','стріла','скарб','ключ','замок','міст','вежа','фонтан','статуя','маска','барабан','скрипка','флейта','арфа','пензлик','палітра','мольберт','пазл','шахи'],
    en: ['cat','dog','sun','moon','tree','flower','house','car','airplane','book','phone','computer','music','dance','school','teacher','doctor','pizza','ice cream','chocolate','football','guitar','camera','robot','dragon','castle','pirate','space','planet','rocket','ocean','mountain','river','forest','bird','butterfly','spider','elephant','giraffe','monkey','bear','lion','tiger','wolf','rabbit','turtle','dolphin','shark','crab','star','cloud','rain','snow','wind','lightning','rainbow','volcano','earthquake','waterfall','cave','island','desert','jungle','iceberg','magnet','battery','parachute','submarine','telescope','microscope','clock','calendar','compass','map','flag','crown','sword','shield','bow','arrow','treasure','key','lock','bridge','tower','fountain','statue','mask','drum','violin','flute','harp','paintbrush','palette','easel','puzzle','chess'],
    ru: ['кот','собака','солнце','луна','дерево','цветок','дом','машина','самолёт','книга','телефон','компьютер','музыка','танец','школа','учитель','врач','пицца','мороженое','шоколад','футбол','гитара','камера','робот','дракон','замок','пират','космос','планета','ракета','океан','гора','река','лес','птица','бабочка','паук','слон','жираф','обезьяна','медведь','лев','тигр','волк','заяц','черепаха','дельфин','акула','краб','звезда','облако','дождь','снег','ветер','молния','радуга','вулкан','землетрясение','водопад','пещера','остров','пустыня','джунгли','айсберг','магнит','батарейка','парашют','подводная лодка','телескоп','микроскоп','часы','календарь','компас','карта','флаг','корона','меч','щит','лук','стрела','сокровище','ключ','замок','мост','башня','фонтан','статуя','маска','барабан','скрипка','флейта','арфа','кисточка','палитра','мольберт','пазл','шахматы']
};

function generateRoomId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var result = '';
    for (var i = 0; i < 5; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function getRandomWord(room) {
    var lang = room.language || 'uk';
    var list = words[lang] || words['uk'];
    return list[Math.floor(Math.random() * list.length)];
}

io.on('connection', function(socket) {

    socket.on('createRoom', function(data) {
        var roomId = generateRoomId();
        rooms[roomId] = {
            players: [{ id: socket.id, name: data.name, score: 0 }],
            language: data.language || 'uk',
            roundTime: data.roundTime || 60,
            currentRound: 0,
            totalRounds: 0,
            explainerIndex: 0,
            started: false,
            timer: null
        };
        socket.join(roomId);
        socket.roomId = roomId;
        socket.emit('roomCreated', { roomId: roomId, players: rooms[roomId].players });
    });

    socket.on('joinRoom', function(data) {
        var room = rooms[data.roomId];
        if (!room) return socket.emit('error', { message: 'Room not found!' });
        if (room.started) return socket.emit('error', { message: 'Game already started!' });
        room.players.push({ id: socket.id, name: data.name, score: 0 });
        socket.join(data.roomId);
        socket.roomId = data.roomId;
        io.to(data.roomId).emit('playerJoined', { players: room.players });
    });

    socket.on('startGame', function() {
        var room = rooms[socket.roomId];
        if (!room || room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players!' });
        room.started = true;
        room.currentRound = 0;
        room.explainerIndex = 0;
        room.totalRounds = room.players.length * 2;
        startRound(socket.roomId);
    });

    socket.on('wordGuessed', function() {
        var room = rooms[socket.roomId];
        if (!room || !room.started) return;
        var explainer = room.players[room.explainerIndex];
        if (socket.id !== explainer.id) return;
        explainer.score += 1;
        io.to(socket.roomId).emit('scoreUpdate', { players: room.players });
        var w = getRandomWord(room);
        room.currentWord = w;
        socket.emit('newWord', { word: w });
    });

    socket.on('skipWord', function() {
        var room = rooms[socket.roomId];
        if (!room || !room.started) return;
        var explainer = room.players[room.explainerIndex];
        if (socket.id !== explainer.id) return;
        explainer.score -= 1;
        io.to(socket.roomId).emit('scoreUpdate', { players: room.players });
        var w = getRandomWord(room);
        room.currentWord = w;
        socket.emit('newWord', { word: w });
    });

    socket.on('disconnect', function() {
        var roomId = socket.roomId;
        if (!roomId || !rooms[roomId]) return;
        var room = rooms[roomId];
        room.players = room.players.filter(function(p) { return p.id !== socket.id; });
        if (room.players.length === 0) {
            if (room.timer) clearTimeout(room.timer);
            delete rooms[roomId];
        } else {
            io.to(roomId).emit('playerLeft', { players: room.players });
        }
    });
});

function startRound(roomId) {
    var room = rooms[roomId];
    if (!room) return;
    room.currentRound++;
    if (room.currentRound > room.totalRounds) {
        if (room.timer) clearTimeout(room.timer);
        io.to(roomId).emit('gameOver', { players: room.players });
        room.started = false;
        return;
    }
    room.explainerIndex = (room.currentRound - 1) % room.players.length;
    var explainer = room.players[room.explainerIndex];
    var w = getRandomWord(room);
    room.currentWord = w;

    io.to(roomId).emit('roundStart', {
        explainer: explainer.id,
        round: room.currentRound,
        totalRounds: room.totalRounds,
        roundTime: room.roundTime,
        players: room.players
    });

    io.to(explainer.id).emit('newWord', { word: w });

    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(function() {
        room.currentWord = null;
        startRound(roomId);
    }, room.roundTime * 1000);
}

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
    console.log('Server running on port ' + PORT);
});

