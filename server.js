const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { ExpressPeerServer } = require('peer');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const peerServer = ExpressPeerServer(server, { debug: true });
app.use('/peerjs', peerServer);
app.use(express.static(path.join(__dirname, 'public')));

let waitingUsers = [];
let onlineCount = 0;
let bannedSockets = new Set();
let reportedUsers = new Map();

const badWords = [
  'bc', 'mc', 'chutiya', 'madarchod', 'bhenchod', 'gandu',
  'randi', 'harami', 'saala', 'fuck', 'shit', 'bastard',
  'bitch', 'ass', 'dick', 'pussy', 'sex', 'nude', 'naked',
  'porn', 'xxx', 'rape', 'kill', 'murder', 'terrorist'
];

function containsBadWord(msg) {
  const lower = msg.toLowerCase();
  return badWords.some(word => lower.includes(word));
}

function addWarning(socketId) {
  const count = (reportedUsers.get(socketId) || 0) + 1;
  reportedUsers.set(socketId, count);
  return count;
}

function isGenderMatch(socket, waiting) {
  if (socket.isPremium || socket.coins > 0) {
    const wantedGender = socket.wantGender;
    if (wantedGender && wantedGender !== 'any') {
      return waiting.gender === wantedGender;
    }
  }
  return true;
}

function findMatch(socket) {
  const userInterests = socket.interests || [];
  let bestMatch = null;
  let bestScore = -1;

  for (let i = 0; i < waitingUsers.length; i++) {
    const waiting = waitingUsers[i];
    if (waiting.id === socket.id) continue;
    if (bannedSockets.has(waiting.id)) continue;
    if (!isGenderMatch(socket, waiting)) continue;
    if (!isGenderMatch(waiting, socket)) continue;

    const common = waiting.interests.filter(i =>
      userInterests.includes(i)
    );

    if (common.length > bestScore) {
      bestScore = common.length;
      bestMatch = waiting;
    }
  }

  if (bestMatch) {
    waitingUsers = waitingUsers.filter(u => u.id !== bestMatch.id);
    socket.partner = bestMatch;
    bestMatch.partner = socket;

    const common = bestMatch.interests.filter(i =>
      userInterests.includes(i)
    );

    socket.emit('chatStart', { commonInterests: common });
    bestMatch.emit('chatStart', { commonInterests: common });
  } else {
    waitingUsers.push(socket);
    socket.emit('waiting');
  }
}

io.on('connection', (socket) => {
  if (bannedSockets.has(socket.id)) {
    socket.emit('banned', 'Aap ban ho gaye hain!');
    socket.disconnect();
    return;
  }

  onlineCount++;
  io.emit('onlineCount', onlineCount);

  socket.interests = [];
  socket.partner = null;
  socket.warningCount = 0;
  socket.blockedUsers = new Set();
  socket.isPremium = false;
  socket.coins = 0;
  socket.gender = 'other';
  socket.wantGender = 'any';

  socket.on('startSearch', (data) => {
    socket.interests = data.interests || [];
    socket.gender = data.gender || 'other';
    socket.wantGender = data.wantGender || 'any';
    socket.isPremium = data.isPremium || false;
    socket.coins = data.coins || 0;
    socket.userName = data.userName || 'User';
    findMatch(socket);
  });

  socket.on('message', (msg) => {
    if (!socket.partner) return;
    if (containsBadWord(msg)) {
      socket.warningCount++;
      if (socket.warningCount === 1) {
        socket.emit('autoWarning', { level: 1, msg: '⚠️ Warning 1/3: Abusive language detect hua!' });
      } else if (socket.warningCount === 2) {
        socket.emit('autoWarning', { level: 2, msg: '⚠️ Warning 2/3: Last warning!' });
      } else {
        bannedSockets.add(socket.id);
        socket.emit('banned', '❌ 3 warnings ke baad BAN!');
        if (socket.partner) {
          socket.partner.emit('partnerLeft');
          socket.partner.partner = null;
        }
        waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
        socket.disconnect();
        return;
      }
      return;
    }
    socket.partner.emit('message', msg);
  });

  socket.on('sendGift', (data) => {
  if (!socket.partner) return;

  // Partner ko gift bhejo
  socket.partner.emit('giftReceived', {
    emoji: data.emoji,
    name: data.name,
    cost: data.cost
  });

  // Agar partner creator hai toh unhe coins milenge
  socket.partner.emit('creatorGiftEarned', {
    emoji: data.emoji,
    name: data.name,
    cost: data.cost
  });
});

  socket.on('report', (data) => {
    const warnings = addWarning(socket.partner ? socket.partner.id : 'unknown');
    if (socket.partner) {
      if (warnings >= 3) {
        bannedSockets.add(socket.partner.id);
        socket.partner.emit('banned', '❌ Multiple reports ke baad BAN!');
        socket.partner.disconnect();
      }
    }
    socket.emit('reportSuccess', '✅ Report submit ho gayi!');
    if (socket.partner) {
      socket.partner.emit('partnerLeft');
      socket.partner.partner = null;
    }
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    socket.partner = null;
    findMatch(socket);
  });

  socket.on('blockUser', () => {
    if (socket.partner) {
      socket.blockedUsers.add(socket.partner.id);
      socket.partner.emit('partnerLeft');
      socket.partner.partner = null;
    }
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    socket.partner = null;
    socket.emit('blockSuccess', '🚫 User block ho gaya!');
    findMatch(socket);
  });

  socket.on('peerId', (peerId) => {
    if (socket.partner) socket.partner.emit('partnerPeerId', peerId);
  });

  socket.on('typing', () => {
    if (socket.partner) socket.partner.emit('typing');
  });

  socket.on('next', () => {
    if (socket.partner) {
      socket.partner.emit('partnerLeft');
      socket.partner.partner = null;
    }
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    socket.partner = null;
    findMatch(socket);
  });

  socket.on('disconnect', () => {
    onlineCount--;
    io.emit('onlineCount', onlineCount);
    if (socket.partner) {
      socket.partner.emit('partnerLeft');
      socket.partner.partner = null;
    }
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log('ZapChat chal raha hai! Port 3000');
});
