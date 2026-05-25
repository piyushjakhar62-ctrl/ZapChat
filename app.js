const socket = io();
let typingTimeout;
let myPeer;
let myStream;
let currentCall;
let camOn = true;
let micOn = true;
const mode = localStorage.getItem('mode') || 'text';
const userName = localStorage.getItem('userName') || 'User';
const interests = JSON.parse(localStorage.getItem('interests') || '[]');
const gender = localStorage.getItem('gender') || 'other';
const wantGender = localStorage.getItem('wantGender') || 'any';
const isPremium = localStorage.getItem('zapPremium') === 'true';
let myCoins = parseInt(localStorage.getItem('zapCoins') || '0');

updateCoinDisplay();

function updateCoinDisplay() {
  const el = document.getElementById('headerCoins');
  const el2 = document.getElementById('giftCoins');
  if (el) el.textContent = myCoins;
  if (el2) el2.textContent = myCoins;
}

socket.emit('startSearch', {
  interests: interests,
  gender: gender,
  wantGender: wantGender,
  isPremium: isPremium,
  coins: myCoins,
  userName: userName
});

if (mode === 'video') {
  document.getElementById('videoContainer').classList.add('show');
  document.getElementById('videoControls').classList.add('show');
  startVideo();
}

async function startVideo() {
  try {
    myStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    document.getElementById('myVideo').srcObject = myStream;

    myPeer = new Peer(undefined, {
      host: location.hostname,
      port: location.port || 3000,
      path: '/peerjs'
    });

    myPeer.on('open', (id) => {
      socket.emit('peerId', id);
    });

    myPeer.on('call', (call) => {
      call.answer(myStream);
      currentCall = call;
      call.on('stream', (remoteStream) => {
        document.getElementById('strangerVideo').srcObject = remoteStream;
      });
    });

  } catch (err) {
    addSystemMsg('❌ Camera/Mic allow karo!');
  }
}

function callStranger(peerId) {
  if (!myStream || !myPeer) return;
  const call = myPeer.call(peerId, myStream);
  currentCall = call;
  call.on('stream', (remoteStream) => {
    document.getElementById('strangerVideo').srcObject = remoteStream;
  });
}

function toggleCamera() {
  if (!myStream) return;
  camOn = !camOn;
  myStream.getVideoTracks().forEach(t => t.enabled = camOn);
  const btn = document.getElementById('camBtn');
  btn.textContent = camOn ? '📷 Camera Off' : '📷 Camera On';
  btn.classList.toggle('off', !camOn);
}

function toggleMic() {
  if (!myStream) return;
  micOn = !micOn;
  myStream.getAudioTracks().forEach(t => t.enabled = micOn);
  const btn = document.getElementById('micBtn');
  btn.textContent = micOn ? '🎤 Mic Off' : '🎤 Mic On';
  btn.classList.toggle('off', !micOn);
}

function stopVideoCall() {
  if (currentCall) currentCall.close();
  const sv = document.getElementById('strangerVideo');
  if (sv) sv.srcObject = null;
}

socket.on('onlineCount', (count) => {
  const el = document.getElementById('onlineCount');
  if (el) el.textContent = count;
});

socket.on('waiting', () => {
  setStatus('🔍 Stranger dhundh rahe hain...', 'waiting');
  disableChat();
  addSystemMsg('Naye stranger ka intezaar hai...');
});

socket.on('chatStart', (data) => {
  setStatus('✅ Stranger mil gaya! Baat karo!', 'connected');
  enableChat();
  if (data.commonInterests && data.commonInterests.length > 0) {
    const banner = document.getElementById('commonInterests');
    if (banner) {
      banner.textContent = '🎯 Common: ' + data.commonInterests.join(', ');
      banner.classList.add('show');
    }
    addSystemMsg('⚡ Connected! Common: ' + data.commonInterests.join(', '));
  } else {
    addSystemMsg('⚡ Stranger se connected ho gaye!');
  }
});

socket.on('partnerPeerId', (peerId) => {
  callStranger(peerId);
});

socket.on('message', (msg) => {
  removeTyping();
  addMsg(msg, 'stranger');
});

socket.on('typing', () => {
  showTyping();
  setTimeout(removeTyping, 2000);
});

socket.on('partnerLeft', () => {
  removeTyping();
  stopVideoCall();
  setStatus('❌ Stranger chala gaya!', 'waiting');
  disableChat();
  const banner = document.getElementById('commonInterests');
  if (banner) banner.classList.remove('show');
  hideWarning();
  addSystemMsg('Stranger ne chat chhod di. Next dabao!');
});

socket.on('autoWarning', (data) => {
  showWarning(data.msg);
  addSystemMsg(data.msg);
});

socket.on('banned', (reason) => {
  const banScreen = document.getElementById('banScreen');
  const banReason = document.getElementById('banReason');
  if (banScreen) {
    banReason.textContent = reason;
    banScreen.classList.add('show');
  }
});

socket.on('reportSuccess', (msg) => {
  addSystemMsg(msg);
  closeReport();
});

socket.on('blockSuccess', (msg) => {
  addSystemMsg(msg);
  closeBlock();
});

socket.on('giftReceived', (data) => {
  showGiftAnimation(data.emoji, data.name);
  addSystemMsg('🎁 Stranger ne ' + data.emoji + ' ' + data.name + ' gift bheja!');
});
// Creator gift earn karo
socket.on('creatorGiftEarned', (data) => {
  const isCreator = localStorage.getItem('isCreator') === 'true';
  if (!isCreator) return;

  // Coins add karo
  let creatorCoins = parseInt(localStorage.getItem('creatorCoins') || '0');
  creatorCoins += data.cost;
  localStorage.setItem('creatorCoins', creatorCoins);

  // History save karo
  const history = JSON.parse(localStorage.getItem('creatorGiftHistory') || '[]');
  history.unshift({
    emoji: data.emoji,
    name: data.name,
    cost: data.cost,
    date: new Date().toLocaleDateString('hi-IN'),
    time: new Date().toLocaleTimeString('hi-IN')
  });
  localStorage.setItem('creatorGiftHistory', JSON.stringify(history));

  // 🔴 LIVE — Screen par turant update karo
  const headerCoinsEl = document.getElementById('headerCoins');
  if (headerCoinsEl) {
    headerCoinsEl.textContent = creatorCoins;
    // Animation
    headerCoinsEl.style.color = '#f9c846';
    headerCoinsEl.style.transform = 'scale(1.5)';
    setTimeout(() => {
      headerCoinsEl.style.transform = 'scale(1)';
    }, 500);
  }

  // Coin display bhi update karo
  myCoins = creatorCoins;
  updateCoinDisplay();

  // System message
  addSystemMsg('🎁 Gift mila! +' + data.cost + ' 🪙 | Total: ' + creatorCoins + ' coins | ₹' + (creatorCoins * 0.7).toFixed(0) + ' earned!');
});

function toggleGifts() {
  const picker = document.getElementById('giftPicker');
  const emojiPicker = document.getElementById('emojiPicker');
  emojiPicker.classList.remove('show');
  picker.classList.toggle('show');
  updateCoinDisplay();
}

function sendGift(emoji, name, cost) {
  myCoins = parseInt(localStorage.getItem('zapCoins') || '0');
  if (myCoins < cost) {
    alert('🪙 Coins kam hain!\n\n' + cost + ' coins chahiye.\nAapke paas ' + myCoins + ' coins hain.\n\nWallet mein jao!');
    window.location.href = 'wallet.html';
    return;
  }
  myCoins -= cost;
  localStorage.setItem('zapCoins', myCoins);
  updateCoinDisplay();

  const transactions = JSON.parse(localStorage.getItem('zapTransactions') || '[]');
  transactions.unshift({
    type: 'debit',
    coins: cost,
    date: new Date().toLocaleDateString('hi-IN'),
    time: new Date().toLocaleTimeString('hi-IN'),
    gift: name
  });
  localStorage.setItem('zapTransactions', JSON.stringify(transactions));

  socket.emit('sendGift', { emoji: emoji, name: name, cost: cost });
  showGiftAnimation(emoji, name);
  addSystemMsg('🎁 Tumne ' + emoji + ' ' + name + ' gift bheja! (-' + cost + ' 🪙)');
  document.getElementById('giftPicker').classList.remove('show');
}

function showGiftAnimation(emoji, name) {
  const overlay = document.getElementById('giftAnimation');
  overlay.innerHTML = `
    <div class="gift-anim-box">
      <div class="gift-anim-emoji">${emoji}</div>
      <div class="gift-anim-name">${name}</div>
    </div>
  `;
  overlay.classList.add('show');
  setTimeout(() => {
    overlay.classList.remove('show');
    overlay.innerHTML = '';
  }, 3000);
}

function sendMessage() {
  const input = document.getElementById('msgInput');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('message', msg);
  addMsg(msg, 'me');
  input.value = '';
}

function checkEnter(e) {
  if (e.key === 'Enter') sendMessage();
}

function typingStart() {
  socket.emit('typing');
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {}, 1000);
}

function nextStranger() {
  document.getElementById('chatBox').innerHTML = '';
  removeTyping();
  stopVideoCall();
  hideWarning();
  const banner = document.getElementById('commonInterests');
  if (banner) banner.classList.remove('show');
  document.getElementById('giftPicker').classList.remove('show');
  socket.emit('next');
}

function stopChat() {
  if (myStream) myStream.getTracks().forEach(t => t.stop());
  window.location.href = 'index.html';
}

function openReport() {
  document.getElementById('reportModal').classList.add('show');
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('show');
}

function submitReport(reason) {
  socket.emit('report', { reason: reason });
  addSystemMsg('🚨 Report submit ho gayi: ' + reason);
  closeReport();
}

function openBlock() {
  document.getElementById('blockModal').classList.add('show');
}

function closeBlock() {
  document.getElementById('blockModal').classList.remove('show');
}

function confirmBlock() {
  socket.emit('blockUser');
  document.getElementById('chatBox').innerHTML = '';
  closeBlock();
}

function showWarning(msg) {
  const box = document.getElementById('warningBox');
  if (box) {
    box.textContent = msg;
    box.classList.add('show');
    setTimeout(() => hideWarning(), 5000);
  }
}

function hideWarning() {
  const box = document.getElementById('warningBox');
  if (box) box.classList.remove('show');
}

function toggleEmoji() {
  const picker = document.getElementById('emojiPicker');
  const giftPicker = document.getElementById('giftPicker');
  giftPicker.classList.remove('show');
  picker.classList.toggle('show');
}

function addEmoji(emoji) {
  const input = document.getElementById('msgInput');
  input.value += emoji;
  input.focus();
}

function setStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + type;
}

function addMsg(msg, type) {
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'msg ' + type;
  div.textContent = msg;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function addSystemMsg(msg) {
  addMsg(msg, 'system');
}

function showTyping() {
  removeTyping();
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function enableChat() {
  document.getElementById('msgInput').disabled = false;
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('msgInput').focus();
}

function disableChat() {
  document.getElementById('msgInput').disabled = true;
  document.getElementById('sendBtn').disabled = true;
}

// ── CALL SYSTEM ──
let currentCallMode = 'text';
let callTimer = null;
let callSeconds = 0;
let pendingCallMode = '';

function switchMode(mode) {
  // Tab active karo
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + mode).classList.add('active');

  if (mode === 'text') {
    // Text mode — video/audio band karo
    currentCallMode = 'text';
    stopVideoCall();
    if (myStream) {
      myStream.getTracks().forEach(t => t.stop());
      myStream = null;
    }
    document.getElementById('videoContainer').classList.remove('show');
    document.getElementById('videoControls').classList.remove('show');
    stopCallTimer();
    return;
  }

  // Video ya Audio — coins check karo
  const coins = parseInt(localStorage.getItem('zapCoins') || '0');
  if (coins < 10) {
    alert('🪙 Coins kam hain!\n\n' + mode + ' call ke liye coins chahiye.\nWallet mein jao!');
    // Tab wapas text par
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-text').classList.add('active');
    return;
  }

  // Popup dikhao
  pendingCallMode = mode;
  const icon = mode === 'video' ? '🎥' : '🎤';
  const title = mode === 'video' ? 'Video Call' : 'Audio Call';
  const desc = mode === 'video'
    ? 'Video call ke liye 10 coins/minute lagenge'
    : 'Audio call ke liye 10 coins/minute lagenge';

  document.getElementById('callPopupIcon').textContent = icon;
  document.getElementById('callPopupTitle').textContent = title;
  document.getElementById('callPopupDesc').textContent = desc;
  document.getElementById('callPopupCoins').textContent = coins;
  document.getElementById('callCoinPopup').classList.add('show');
}

function confirmCall() {
  document.getElementById('callCoinPopup').classList.remove('show');
  currentCallMode = pendingCallMode;

  if (currentCallMode === 'video') {
    document.getElementById('videoContainer').classList.add('show');
    document.getElementById('videoControls').classList.add('show');
    startVideo();
  } else if (currentCallMode === 'audio') {
    startAudioCall();
  }

  // Coin timer shuru karo — har minute 10 coins
  startCallTimer();
}

function closeCallPopup() {
  document.getElementById('callCoinPopup').classList.remove('show');
  // Tab wapas text par
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-text').classList.add('active');
}

async function startAudioCall() {
  try {
    myStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true
    });

    myPeer = new Peer(undefined, {
      host: location.hostname,
      port: location.port || 3000,
      path: '/peerjs'
    });

    myPeer.on('open', (id) => {
      socket.emit('peerId', id);
    });

    myPeer.on('call', (call) => {
      call.answer(myStream);
      currentCall = call;
      call.on('stream', () => {
        addSystemMsg('🎤 Audio call connected!');
      });
    });

    addSystemMsg('🎤 Audio call shuru ho gaya!');
  } catch (err) {
    addSystemMsg('❌ Mic allow karo!');
  }
}

function startCallTimer() {
  callSeconds = 0;
  stopCallTimer();

  callTimer = setInterval(() => {
    callSeconds++;

    // Har 60 second = 1 minute = 10 coins
    if (callSeconds % 60 === 0) {
      let coins = parseInt(localStorage.getItem('zapCoins') || '0');

      if (coins < 10) {
        addSystemMsg('❌ Coins khatam! Call band ho gayi.');
        stopCallTimer();
        switchMode('text');
        return;
      }

      coins -= 10;
      localStorage.setItem('zapCoins', coins);
      myCoins = coins;
      updateCoinDisplay();

      const minutes = callSeconds / 60;
      addSystemMsg('🪙 ' + minutes + ' min — 10 coins kate. Baaki: ' + coins + ' coins');
    }
  }, 1000);
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
}

window.addFriend = () => {
  const friends = JSON.parse(localStorage.getItem('zapFriends') || '[]');
  const newFriend = {
    name: 'ZapChat User',
    gender: 'other',
    addedAt: new Date().toLocaleDateString('hi-IN')
  };
  friends.push(newFriend);
  localStorage.setItem('zapFriends', JSON.stringify(friends));
  addSystemMsg('👫 Friend add ho gaya! Messages mein dekho!');
  document.getElementById('addFriendBtn').textContent = '✅ Added!';
  document.getElementById('addFriendBtn').disabled = true;
};