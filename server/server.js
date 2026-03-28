const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

const rooms = {};

const words = {
  uk: ["кіт","собака","будинок","сонце","море","гора","дерево","книга","машина","квітка","літак","потяг","зірка","місяць","вогонь","вода","хліб","молоко","школа","лікар","музика","танець","пісня","фільм","театр","м'яч","ракета","острів","замок","дракон","пірат","скарб","робот","привид","ніндзя","чарівник","єдиноріг","русалка","лицар","принцеса"],
  en: ["cat","dog","house","sun","sea","mountain","tree","book","car","flower","airplane","train","star","moon","fire","water","bread","milk","school","doctor","music","dance","song","movie","theater","ball","rocket","island","castle","dragon","pirate","treasure","robot","ghost","ninja","wizard","unicorn","mermaid","knight","princess"],
  ru: ["кот","собака","дом","солнце","море","гора","дерево","книга","машина","цветок","самолёт","поезд","звезда","луна","огонь","вода","хлеб","молоко","школа","врач","музыка","танец","песня","фильм","театр","мяч","ракета","остров","замок","дракон","пират","сокровище","робот","призрак","ниндзя","волшебник","единорог","русалка","рыцарь","принцесса"]
};

function getRandomWord(lang) {
  const list = words[lang] || words['uk'];
  return list[Math.floor(Math.random() * list.length)];
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (data) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomId] = {
      host: socket.id,
      players: [{ id: socket.id, name: data.name, score: 0 }],
      language: data.language || 'uk',
      roundTime: data.roundTime || 60,
      currentWord: null,
      currentExplainer: null,
      round: 0,
      started: false
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
  });

  socket.on('joinRoom', (data) => {
    const room = rooms[data.roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.started) return socket.emit('error', { message: 'Game already started' });
    room.players.push({ id: socket.id, name: data.name, score: 0 });
    socket.join(data.roomId);
    socket.roomId = data.roomId;
    io.to(data.roomId).emit('playerJoined', { players: room.players });
  });

  socket.on('startGame', () => {
    const room = rooms[socket.roomId];
    if (!room || socket.id !== room.host) return;
    room.started = true;
    room.round = 0;
    nextRound(socket.roomId);
  });

  socket.on('wordGuessed', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const explainer = room.players.find(p => p.id === room.currentExplainer);
    if (explainer) explainer.score += 1;
    const newWord = getRandomWord(room.language);
    room.currentWord = newWord;
    io.to(room.currentExplainer).emit('newWord', { word: newWord });
    io.to(socket.roomId).emit('scoreUpdate', { players: room.players });
  });

  socket.on('skipWord', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const newWord = getRandomWord(room.language);
    room.currentWord = newWord;
    io.to(room.currentExplainer).emit('newWord', { word: newWord });
  });

  socket.on('roundEnd', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    nextRound(socket.roomId);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
    if (rooms[roomId].players.length === 0) {
      delete rooms[roomId];
    } else {
      if (rooms[roomId].host === socket.id) {
        rooms[roomId].host = rooms[roomId].players[0].id;
      }
      io.to(roomId).emit('playerLeft', { players: rooms[roomId].players });
    }
  });
});

function nextRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.round >= room.players.length) {
    io.to(roomId).emit('gameOver', { players: room.players });
    room.started = false;
    return;
  }
  room.currentExplainer = room.players[room.round].id;
  room.currentWord = getRandomWord(room.language);
  room.round++;
  io.to(roomId).emit('roundStart', {
    explainer: room.currentExplainer,
    roundTime: room.roundTime,
    round: room.round,
    totalRounds: room.players.length
  });
  io.to(room.currentExplainer).emit('newWord', { word: room.currentWord });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
