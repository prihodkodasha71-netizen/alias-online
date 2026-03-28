const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const WORDS_UA = [
  "Сонце","Кіт","Дерево","Музика","Літак","Книга","Океан","Гора",
  "Вчитель","Піца","Футбол","Лікар","Зірка","Робот","Квітка",
  "Велосипед","Хмара","Шоколад","Дракон","Пляж","Ракета","Парасолька",
  "Метелик","Піаніно","Замок","Вулкан","Айсберг","Джунглі","Скрипка",
  "Блискавка","Маяк","Корабель","Водоспад","Компас","Телескоп",
  "Балерина","Фонтан","Лабіринт","Привид","Скарб","Магніт",
  "Календар","Акула","Печера","Веселка","Годинник","Павук",
  "Фотоапарат","Ковзани","Серфінг","Пінгвін","Гамак","Бібліотека",
  "Карнавал","Жонглер","Детектив","Космонавт","Диригент","Фараон",
  "Пірат","Ніндзя","Чаклун","Архітектор","Марафон","Сафарі",
  "Акробат","Художник","Диско","Карате","Серенада","Карусель",
  "Батут","Доміно","Калейдоскоп","Орігамі","Пантоміма","Бумеранг",
  "Ковбой","Фламінго","Динозавр","Шпигун","Сніговик","Самурай",
  "Барабан","Жираф","Русалка","Торнадо","Єдиноріг","Гладіатор",
  "Супергерой","Пілот","Танцюрист","Фокусник","Ескімо","Парашут",
  "Кенгуру","Хамелеон","Папуга","Піраміда","Лицар","Чемпіон",
  "Сноуборд","Серце","Планета","Галактика","Магія","Фестиваль",
  "Каскадер","Принцеса","Трактор","Підводний човен","Вертоліт",
  "Олімпіада","Спагеті","Джокер","Комп'ютер","Телефон","Інтернет",
  "Пазл","Шахи","Клоун","Цирк","Мікрофон","Навушники","Окуляри",
  "Рюкзак","Ковдра","Холодильник","Пральна машина","Ліхтар",
  "Банан","Полуниця","Ананас","Кавун","Виноград","Авокадо",
  "Крокодил","Слон","Дельфін","Орел","Черепаха","Їжак",
  "Ковзанка","Гойдалка","Батько","Бабуся","Сусід","Листоноша"
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const rooms = new Map();

function createRoom(hostId, hostName) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));
  const room = {
    code, hostId,
    players: new Map(),
    teams: { "Команда 1": [], "Команда 2": [] },
    scores: { "Команда 1": 0, "Команда 2": 0 },
    state: "lobby",
    currentTeamIndex: 0,
    currentPlayerIndices: { "Команда 1": 0, "Команда 2": 0 },
    wordPool: [], wordIndex: 0, currentWord: "",
    roundWords: [], roundScore: 0,
    timeLeft: 60, timerInterval: null,
    settings: { roundTime: 60, winningScore: 30 },
    createdAt: Date.now(),
  };
  room.players.set(hostId, { name: hostName, team: null });
  rooms.set(code, room);
  return room;
}

function getRoomState(room) {
  const players = [];
  room.players.forEach((val, key) => {
    players.push({ id: key, name: val.name, team: val.team });
  });
  const teamNames = Object.keys(room.teams);
  const currentTeam = teamNames[room.currentTeamIndex];
  const currentExplainerIndex = room.currentPlayerIndices[currentTeam] || 0;
  const teamPlayers = room.teams[currentTeam] || [];
  const currentExplainer = teamPlayers[currentExplainerIndex] || null;
  return {
    code: room.code, hostId: room.hostId, players, teams: room.teams,
    scores: room.scores, state: room.state, currentTeam, currentExplainer,
    currentWord: room.currentWord, roundWords: room.roundWords,
    roundScore: room.roundScore, timeLeft: room.timeLeft, settings: room.settings,
  };
}

function getNextWord(room) {
  if (room.wordIndex >= room.wordPool.length) {
    room.wordPool = shuffle(WORDS_UA);
    room.wordIndex = 0;
  }
  room.currentWord = room.wordPool[room.wordIndex];
  room.wordIndex++;
  return room.currentWord;
}

function startTimer(room) {
  stopTimer(room);
  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    io.to(room.code).emit("timer_tick", { timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) endRound(room);
  }, 1000);
}

function stopTimer(room) {
  if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
}

function endRound(room) {
  stopTimer(room);
  const teamNames = Object.keys(room.teams);
  const currentTeam = teamNames[room.currentTeamIndex];
  room.scores[currentTeam] = Math.max(0, (room.scores[currentTeam] || 0) + room.roundScore);
  if (room.scores[currentTeam] >= room.settings.winningScore) {
    room.state = "finished";
    io.to(room.code).emit("game_state", { ...getRoomState(room), winner: currentTeam });
    return;
  }
  const teamPlayers = room.teams[currentTeam];
  if (teamPlayers.length > 0) {
    room.currentPlayerIndices[currentTeam] =
      ((room.currentPlayerIndices[currentTeam] || 0) + 1) % teamPlayers.length;
  }
  room.currentTeamIndex = (room.currentTeamIndex + 1) % teamNames.length;
  room.state = "turn_start";
  io.to(room.code).emit("game_state", getRoomState(room));
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create_room", ({ playerName }, callback) => {
    const room = createRoom(socket.id, playerName);
    socket.join(room.code);
    callback({ success: true, roomCode: room.code });
    io.to(room.code).emit("game_state", getRoomState(room));
  });

  socket.on("join_room", ({ roomCode, playerName }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: "Кімнату не знайдено" });
    if (room.state !== "lobby") return callback({ success: false, error: "Гра вже почалась" });
    let name = playerName;
    const existingNames = [];
    room.players.forEach((p) => existingNames.push(p.name));
    let counter = 2;
    while (existingNames.includes(name)) { name = playerName + "(" + counter + ")"; counter++; }
    room.players.set(socket.id, { name, team: null });
    socket.join(code);
    callback({ success: true, roomCode: code, assignedName: name });
    io.to(code).emit("game_state", getRoomState(room));
  });

  socket.on("join_team", ({ roomCode, teamName }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "lobby") return;
    const player = room.players.get(socket.id);
    if (!player) return;
    for (const t of Object.keys(room.teams)) {
      room.teams[t] = room.teams[t].filter((n) => n !== player.name);
    }
    if (room.teams[teamName]) {
      room.teams[teamName].push(player.name);
      player.team = teamName;
    }
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("auto_assign", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "lobby" || socket.id !== room.hostId) return;
    const playerNames = [];
    room.players.forEach((p) => playerNames.push(p.name));
    const shuffled = shuffle(playerNames);
    room.teams = { "Команда 1": [], "Команда 2": [] };
    shuffled.forEach((name, i) => {
      const team = i % 2 === 0 ? "Команда 1" : "Команда 2";
      room.teams[team].push(name);
      room.players.forEach((p) => { if (p.name === name) p.team = team; });
    });
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("update_settings", ({ roomCode, settings }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;
    room.settings = { ...room.settings, ...settings };
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("start_game", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;
    if (room.teams["Команда 1"].length < 1 || room.teams["Команда 2"].length < 1) return;
    room.wordPool = shuffle(WORDS_UA);
    room.wordIndex = 0;
    room.scores = { "Команда 1": 0, "Команда 2": 0 };
    room.currentTeamIndex = 0;
    room.currentPlayerIndices = { "Команда 1": 0, "Команда 2": 0 };
    room.state = "turn_start";
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("start_round", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "turn_start") return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const teamNames = Object.keys(room.teams);
    const currentTeam = teamNames[room.currentTeamIndex];
    const idx = room.currentPlayerIndices[currentTeam] || 0;
    const explainerName = room.teams[currentTeam][idx];
    if (player.name !== explainerName) return;
    room.state = "playing";
    room.timeLeft = room.settings.roundTime;
    room.roundWords = [];
    room.roundScore = 0;
    getNextWord(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
    startTimer(room);
  });

  socket.on("word_correct", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "playing") return;
    room.roundWords.push({ word: room.currentWord, correct: true });
    room.roundScore++;
    getNextWord(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("word_skip", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "playing") return;
    room.roundWords.push({ word: room.currentWord, correct: false });
    room.roundScore--;
    getNextWord(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("play_again", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.state = "lobby";
    room.scores = { "Команда 1": 0, "Команда 2": 0 };
    room.currentTeamIndex = 0;
    room.currentPlayerIndices = { "Команда 1": 0, "Команда 2": 0 };
    room.roundWords = [];
    room.roundScore = 0;
    stopTimer(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("disconnect", () => {
    rooms.forEach((room, code) => {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        for (const t of Object.keys(room.teams)) {
          room.teams[t] = room.teams[t].filter((n) => n !== player.name);
        }
        room.players.delete(socket.id);
        if (room.players.size === 0) { stopTimer(room); rooms.delete(code); return; }
        if (room.hostId === socket.id) { room.hostId = room.players.keys().next().value; }
        if (room.state === "playing" || room.state === "turn_start") {
          if (room.teams["Команда 1"].length === 0 || room.teams["Команда 2"].length === 0) {
            stopTimer(room); room.state = "lobby";
          }
        }
        io.to(code).emit("game_state", getRoomState(room));
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log("Сервер запущено: http://localhost:" + PORT);
});const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const WORDS_UA = [
  "Сонце","Кіт","Дерево","Музика","Літак","Книга","Океан","Гора",
  "Вчитель","Піца","Футбол","Лікар","Зірка","Робот","Квітка",
  "Велосипед","Хмара","Шоколад","Дракон","Пляж","Ракета","Парасолька",
  "Метелик","Піаніно","Замок","Вулкан","Айсберг","Джунглі","Скрипка",
  "Блискавка","Маяк","Корабель","Водоспад","Компас","Телескоп",
  "Балерина","Фонтан","Лабіринт","Привид","Скарб","Магніт",
  "Календар","Акула","Печера","Веселка","Годинник","Павук",
  "Фотоапарат","Ковзани","Серфінг","Пінгвін","Гамак","Бібліотека",
  "Карнавал","Жонглер","Детектив","Космонавт","Диригент","Фараон",
  "Пірат","Ніндзя","Чаклун","Архітектор","Марафон","Сафарі",
  "Акробат","Художник","Диско","Карате","Серенада","Карусель",
  "Батут","Доміно","Калейдоскоп","Орігамі","Пантоміма","Бумеранг",
  "Ковбой","Фламінго","Динозавр","Шпигун","Сніговик","Самурай",
  "Барабан","Жираф","Русалка","Торнадо","Єдиноріг","Гладіатор",
  "Супергерой","Пілот","Танцюрист","Фокусник","Ескімо","Парашут",
  "Кенгуру","Хамелеон","Папуга","Піраміда","Лицар","Чемпіон",
  "Сноуборд","Серце","Планета","Галактика","Магія","Фестиваль",
  "Каскадер","Принцеса","Трактор","Підводний човен","Вертоліт",
  "Олімпіада","Спагеті","Джокер","Комп'ютер","Телефон","Інтернет",
  "Пазл","Шахи","Клоун","Цирк","Мікрофон","Навушники","Окуляри",
  "Рюкзак","Ковдра","Холодильник","Пральна машина","Ліхтар",
  "Банан","Полуниця","Ананас","Кавун","Виноград","Авокадо",
  "Крокодил","Слон","Дельфін","Орел","Черепаха","Їжак",
  "Ковзанка","Гойдалка","Батько","Бабуся","Сусід","Листоноша"
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const rooms = new Map();

function createRoom(hostId, hostName) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));
  const room = {
    code, hostId,
    players: new Map(),
    teams: { "Команда 1": [], "Команда 2": [] },
    scores: { "Команда 1": 0, "Команда 2": 0 },
    state: "lobby",
    currentTeamIndex: 0,
    currentPlayerIndices: { "Команда 1": 0, "Команда 2": 0 },
    wordPool: [], wordIndex: 0, currentWord: "",
    roundWords: [], roundScore: 0,
    timeLeft: 60, timerInterval: null,
    settings: { roundTime: 60, winningScore: 30 },
    createdAt: Date.now(),
  };
  room.players.set(hostId, { name: hostName, team: null });
  rooms.set(code, room);
  return room;
}

function getRoomState(room) {
  const players = [];
  room.players.forEach((val, key) => {
    players.push({ id: key, name: val.name, team: val.team });
  });
  const teamNames = Object.keys(room.teams);
  const currentTeam = teamNames[room.currentTeamIndex];
  const currentExplainerIndex = room.currentPlayerIndices[currentTeam] || 0;
  const teamPlayers = room.teams[currentTeam] || [];
  const currentExplainer = teamPlayers[currentExplainerIndex] || null;
  return {
    code: room.code, hostId: room.hostId, players, teams: room.teams,
    scores: room.scores, state: room.state, currentTeam, currentExplainer,
    currentWord: room.currentWord, roundWords: room.roundWords,
    roundScore: room.roundScore, timeLeft: room.timeLeft, settings: room.settings,
  };
}

function getNextWord(room) {
  if (room.wordIndex >= room.wordPool.length) {
    room.wordPool = shuffle(WORDS_UA);
    room.wordIndex = 0;
  }
  room.currentWord = room.wordPool[room.wordIndex];
  room.wordIndex++;
  return room.currentWord;
}

function startTimer(room) {
  stopTimer(room);
  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    io.to(room.code).emit("timer_tick", { timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) endRound(room);
  }, 1000);
}

function stopTimer(room) {
  if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
}

function endRound(room) {
  stopTimer(room);
  const teamNames = Object.keys(room.teams);
  const currentTeam = teamNames[room.currentTeamIndex];
  room.scores[currentTeam] = Math.max(0, (room.scores[currentTeam] || 0) + room.roundScore);
  if (room.scores[currentTeam] >= room.settings.winningScore) {
    room.state = "finished";
    io.to(room.code).emit("game_state", { ...getRoomState(room), winner: currentTeam });
    return;
  }
  const teamPlayers = room.teams[currentTeam];
  if (teamPlayers.length > 0) {
    room.currentPlayerIndices[currentTeam] =
      ((room.currentPlayerIndices[currentTeam] || 0) + 1) % teamPlayers.length;
  }
  room.currentTeamIndex = (room.currentTeamIndex + 1) % teamNames.length;
  room.state = "turn_start";
  io.to(room.code).emit("game_state", getRoomState(room));
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create_room", ({ playerName }, callback) => {
    const room = createRoom(socket.id, playerName);
    socket.join(room.code);
    callback({ success: true, roomCode: room.code });
    io.to(room.code).emit("game_state", getRoomState(room));
  });

  socket.on("join_room", ({ roomCode, playerName }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: "Кімнату не знайдено" });
    if (room.state !== "lobby") return callback({ success: false, error: "Гра вже почалась" });
    let name = playerName;
    const existingNames = [];
    room.players.forEach((p) => existingNames.push(p.name));
    let counter = 2;
    while (existingNames.includes(name)) { name = playerName + "(" + counter + ")"; counter++; }
    room.players.set(socket.id, { name, team: null });
    socket.join(code);
    callback({ success: true, roomCode: code, assignedName: name });
    io.to(code).emit("game_state", getRoomState(room));
  });

  socket.on("join_team", ({ roomCode, teamName }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "lobby") return;
    const player = room.players.get(socket.id);
    if (!player) return;
    for (const t of Object.keys(room.teams)) {
      room.teams[t] = room.teams[t].filter((n) => n !== player.name);
    }
    if (room.teams[teamName]) {
      room.teams[teamName].push(player.name);
      player.team = teamName;
    }
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("auto_assign", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "lobby" || socket.id !== room.hostId) return;
    const playerNames = [];
    room.players.forEach((p) => playerNames.push(p.name));
    const shuffled = shuffle(playerNames);
    room.teams = { "Команда 1": [], "Команда 2": [] };
    shuffled.forEach((name, i) => {
      const team = i % 2 === 0 ? "Команда 1" : "Команда 2";
      room.teams[team].push(name);
      room.players.forEach((p) => { if (p.name === name) p.team = team; });
    });
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("update_settings", ({ roomCode, settings }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;
    room.settings = { ...room.settings, ...settings };
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("start_game", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;
    if (room.teams["Команда 1"].length < 1 || room.teams["Команда 2"].length < 1) return;
    room.wordPool = shuffle(WORDS_UA);
    room.wordIndex = 0;
    room.scores = { "Команда 1": 0, "Команда 2": 0 };
    room.currentTeamIndex = 0;
    room.currentPlayerIndices = { "Команда 1": 0, "Команда 2": 0 };
    room.state = "turn_start";
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("start_round", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "turn_start") return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const teamNames = Object.keys(room.teams);
    const currentTeam = teamNames[room.currentTeamIndex];
    const idx = room.currentPlayerIndices[currentTeam] || 0;
    const explainerName = room.teams[currentTeam][idx];
    if (player.name !== explainerName) return;
    room.state = "playing";
    room.timeLeft = room.settings.roundTime;
    room.roundWords = [];
    room.roundScore = 0;
    getNextWord(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
    startTimer(room);
  });

  socket.on("word_correct", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "playing") return;
    room.roundWords.push({ word: room.currentWord, correct: true });
    room.roundScore++;
    getNextWord(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("word_skip", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== "playing") return;
    room.roundWords.push({ word: room.currentWord, correct: false });
    room.roundScore--;
    getNextWord(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("play_again", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.state = "lobby";
    room.scores = { "Команда 1": 0, "Команда 2": 0 };
    room.currentTeamIndex = 0;
    room.currentPlayerIndices = { "Команда 1": 0, "Команда 2": 0 };
    room.roundWords = [];
    room.roundScore = 0;
    stopTimer(room);
    io.to(roomCode).emit("game_state", getRoomState(room));
  });

  socket.on("disconnect", () => {
    rooms.forEach((room, code) => {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        for (const t of Object.keys(room.teams)) {
          room.teams[t] = room.teams[t].filter((n) => n !== player.name);
        }
        room.players.delete(socket.id);
        if (room.players.size === 0) { stopTimer(room); rooms.delete(code); return; }
        if (room.hostId === socket.id) { room.hostId = room.players.keys().next().value; }
        if (room.state === "playing" || room.state === "turn_start") {
          if (room.teams["Команда 1"].length === 0 || room.teams["Команда 2"].length === 0) {
            stopTimer(room); room.state = "lobby";
          }
        }
        io.to(code).emit("game_state", getRoomState(room));
      }
    });
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log("Сервер запущено: http://localhost:" + PORT);
});
