const wsUrl = 'wss://backend-project-5r9n.onrender.com';
let ws;
let localStream;
let peerConnections = new Map();
let roomId = null;
let isMuted = false;
let userName = '';
let audioContext;
let audioAnalyser;
let audioSources = new Map();
let activeSpeakers = new Set();
let audioAnalysers = new Map();


// DOM Elements
const userNameInput = document.getElementById('userNameInput');
const enterButton = document.getElementById('enterButton');
const createRoomButton = document.getElementById('createRoomButton');
const roomsList = document.getElementById('roomsList');
const createRoomModal = document.getElementById('createRoomModal');
const roomTitleInput = document.getElementById('roomTitleInput');
const confirmCreateRoom = document.getElementById('confirmCreateRoom');
const cancelCreateRoom = document.getElementById('cancelCreateRoom');
const disconnectButton = document.getElementById('disconnectButton');
const muteButton = document.getElementById('muteButton');
const callControls = document.getElementById('callControls');
const connectionAnimation = document.getElementById('connectionAnimation');
const welcomeMessage = document.getElementById('welcomeMessage');
const roomTitle = document.getElementById('roomTitle');
const participantsList = document.getElementById('participantsList');

// Check if we're on the index page
if (userNameInput && enterButton) {
  enterButton.addEventListener('click', () => {
    userName = userNameInput.value.trim();
    if (userName) {
      localStorage.setItem('userName', userName);
      window.location.href = 'rooms.html';
    } else {
      alert('Please enter your name');
    }
  });
}

// Check if we're on the rooms page
if (createRoomButton && roomsList) {
  userName = localStorage.getItem('userName');
  if (!userName) {
    window.location.href = 'index.html';
  } else {
    welcomeMessage.textContent = `Welcome, ${userName}!`;
    connectWebSocket();
  }

  createRoomButton.addEventListener('click', () => {
    createRoomModal.style.display = 'block';
  });

  confirmCreateRoom.addEventListener('click', () => {
    const roomTitle = roomTitleInput.value.trim();
    if (roomTitle) {
      createRoom(roomTitle);
      createRoomModal.style.display = 'none';
    } else {
      alert('Please enter a room title');
    }
  });

  cancelCreateRoom.addEventListener('click', () => {
    createRoomModal.style.display = 'none';
  });
}

// Check if we're on the call page
if (disconnectButton && muteButton) {
  userName = localStorage.getItem('userName');
  roomId = localStorage.getItem('currentRoomId');
  if (!userName || !roomId) {
    window.location.href = 'index.html';
  } else {
    connectWebSocket();
  }

  disconnectButton.addEventListener('click', leaveRoom);
  muteButton.addEventListener('click', toggleMute);
}

async function getLocalStream() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      console.log('Local stream obtained');

      // Initialize audio context and analyser for local stream
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(localStream);
      source.connect(analyser);
      audioAnalysers.set('local', analyser);

      // Start detecting active speakers
      detectActiveSpeakers();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please ensure you have given permission.');
      return null;
    }
  }
  return localStream;
}

function detectActiveSpeakers() {
  const bufferLength = 1024;
  const dataArray = new Uint8Array(bufferLength);

  function checkAudioLevel() {
    audioAnalysers.forEach((analyser, participantId) => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((acc, value) => acc + value, 0) / bufferLength;

      if (average > 5) { // Adjust this threshold as needed
        if (!activeSpeakers.has(participantId)) {
          activeSpeakers.add(participantId);
          updateParticipantStyle(participantId, true);
          broadcastActiveSpeaker(participantId, true);
        }
      } else {
        if (activeSpeakers.has(participantId)) {
          activeSpeakers.delete(participantId);
          updateParticipantStyle(participantId, false);
          broadcastActiveSpeaker(participantId, false);
        }
      }
    });

    requestAnimationFrame(checkAudioLevel);
  }

  checkAudioLevel();
}

function broadcastActiveSpeaker(participantId, isActive) {
  ws.send(JSON.stringify({
    type: 'active_speaker',
    participantId: participantId,
    isActive: isActive
  }));
}

function updateParticipantStyle(participantId, isActive) {
  const participantElement = document.querySelector(`[data-participant-id="${participantId}"]`);
  if (participantElement) {
    const nameElement = participantElement.querySelector('.participant-name');
    if (nameElement) {
      if (isActive) {
        nameElement.classList.add('active-speaker');
        participantElement.classList.add('active-speaker');
      } else {
        nameElement.classList.remove('active-speaker');
        participantElement.classList.remove('active-speaker');
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  showLoadingAnimation();
});


function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('WebSocket already connected');
    return;
  }

  console.log('Connecting to WebSocket');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connection established');
    if (window.location.pathname.includes('rooms.html')) {
      ws.send(JSON.stringify({ type: 'get_rooms' }));
    } else if (window.location.pathname.includes('call.html')) {
      joinRoom(roomId);
    }
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);

    switch (data.type) {

      case 'rooms_list':
        hideLoadingAnimation(); // Hide loading animation
        updateRoomsList(data.rooms);
        break;

      case 'active_speaker':
        handleActiveSpeaker(data);
        break;
      case 'rooms_list':
        updateRoomsList(data.rooms);
        break;
      case 'room_created':
      case 'room_joined':
        resetUnreadMessageCount();
        handleRoomJoined(data);
        break;
      case 'participant_joined':
        handleParticipantJoined(data);
        break;
      case 'participant_left':
        handleParticipantLeft(data);
        break;
      case 'offer':
      case 'answer':
      case 'ice_candidate':
        handleCallSignaling(data);
        break;

      case 'emoji_reaction':
        displayEmojiReaction(data.participantId, data.emoji);
        break;

      case 'chat_message':
        displayChatMessage(data.participantName, data.message, data.timestamp);
        break;

    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    alert('Error connecting to the server. Please try again.');
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
  };
}

function createRoom(title) {
  ws.send(JSON.stringify({ type: 'create_room', title, hostName: userName }));
}

function joinRoom(roomId) {
  ws.send(JSON.stringify({ type: 'join_room', roomId, userName }));
}

function updateRoomsList(rooms) {
  hideLoadingAnimation();
  roomsList.innerHTML = '';
  if (rooms.length === 0) {
    roomsList.innerHTML = '<p>No rooms available. Create one!</p>';
  } else {
    rooms.forEach((room, index) => {
      const roomCard = document.createElement('div');
      roomCard.className = 'room-card';
      roomCard.style.backgroundColor = getRandomColor(index);
      roomCard.innerHTML = `
        <h3>${room.title}</h3>
        <p>Host: ${room.hostName}</p>
        <p>Participants: ${room.participants.length}</p>
      `;
      roomCard.addEventListener('click', () => {
        localStorage.setItem('currentRoomId', room.id);
        window.location.href = 'call.html';
      });
      roomsList.appendChild(roomCard);
    });
  }
}
function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F67280', '#C06C84',
    '#6A0572', '#FEBF10', '#16A085', '#F39C12', '#3498DB', '#9B59B6', '#1ABC9C',
    '#E74C3C', '#2980B9', '#E67E22', '#2ECC71', '#8E44AD', '#D35400', '#7F8C8D',
    '#27AE60', '#C0392B', '#BDC3C7', '#2C3E50', '#95A5A6', '#34495E', '#D1E231',
    '#F9BF3B', '#2F4F4F', '#4682B4', '#8A2BE2', '#EE82EE', '#FA8072'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function handleRoomJoined(data) {
  roomId = data.roomId;
  roomTitle.textContent = data.title;
  updateParticipantsList(data.participants);
  connectionAnimation.classList.add('hidden');
  callControls.classList.remove('hidden');
}

function handleParticipantJoined(data) {
  updateParticipantsList(data.participants);
  initiateCall(data.participantId);
}

function handleParticipantLeft(data) {
  updateParticipantsList(data.participants);
  if (peerConnections.has(data.participantId)) {
    peerConnections.get(data.participantId).close();
    peerConnections.delete(data.participantId);
  }

  // Remove this participant from the audioAnalysers map
  if (audioAnalysers.has(data.participantId)) {
    audioAnalysers.delete(data.participantId);
  }

  // Remove from active speakers if present
  activeSpeakers.delete(data.participantId);
  updateParticipantStyle(data.participantId, false);
}

function updateParticipantsList(participants) {
  participantsList.innerHTML = '';
  participants.forEach(participant => {
    const participantElement = document.createElement('div');
    participantElement.className = 'participant';
    participantElement.setAttribute('data-participant-id', participant.id);

    const avatar = document.createElement('div');
    avatar.className = 'participant-avatar';
    avatar.style.backgroundColor = getRandomColor();

    avatar.textContent = participant.name.substring(0, 2).toUpperCase();

    const name = document.createElement('div');
    name.className = 'participant-name';
    name.textContent = participant.name + (participant.id === ws.id ? ' (You)' : '');

    participantElement.appendChild(avatar);
    participantElement.appendChild(name);
    participantsList.appendChild(participantElement);
  });
}

function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F67280', '#C06C84',
    '#6A0572', '#FEBF10', '#16A085', '#F39C12', '#3498DB', '#9B59B6', '#1ABC9C',
    '#E74C3C', '#2980B9', '#E67E22', '#2ECC71', '#8E44AD', '#D35400', '#7F8C8D',
    '#27AE60', '#C0392B', '#BDC3C7', '#2C3E50', '#95A5A6', '#34495E', '#D1E231',
    '#F9BF3B', '#2F4F4F', '#4682B4', '#8A2BE2', '#EE82EE', '#FA8072'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}


async function handleCallSignaling(data) {
  const peerConnection = peerConnections.get(data.senderId) || await createPeerConnection(data.senderId);

  try {
    switch (data.type) {
      case 'offer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        ws.send(JSON.stringify({
          type: 'answer',
          answer: answer,
          targetId: data.senderId
        }));
        break;
      case 'answer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        break;
      case 'ice_candidate':
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        break;
    }
  } catch (error) {
    console.error('Error handling call signaling:', error);
  }
}

async function createPeerConnection(participantId) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun.ekiga.net" },
      { urls: "stun:stun.ideasip.com" },
      { urls: "stun:stun.iptel.org" },
      { urls: "stun:stun.rixtelecom.se" },
      { urls: "stun:stun.schlund.de" },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "e71c4a9cf031d7330ef0b2de",
        credential: "PSt/7RpLC4ErNFGu"
      },
    ]
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'ice_candidate',
        candidate: event.candidate,
        targetId: participantId
      }));
    }
  };

  peerConnection.ontrack = (event) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch(e => console.error('Error playing audio:', e));

    // Set up audio analysis for the remote stream
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(event.streams[0]);
    source.connect(analyser);
    audioAnalysers.set(participantId, analyser);
  };

  try {
    const stream = await getLocalStream();
    if (stream) {
      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
    }
  } catch (error) {
    console.error('Error getting local stream:', error);
  }

  peerConnections.set(participantId, peerConnection);
  return peerConnection;
}


function handleActiveSpeaker(data) {
  updateParticipantStyle(data.participantId, data.isActive);
}

async function initiateCall(participantId) {
  try {
    const peerConnection = await createPeerConnection(participantId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({
      type: 'offer',
      offer: offer,
      targetId: participantId
    }));
  } catch (error) {
    console.error('Error initiating call:', error);
  }
}

function leaveRoom() {
  ws.send(JSON.stringify({ type: 'leave_room', roomId }));
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
  localStorage.removeItem('currentRoomId');
  window.location.href = 'rooms.html';
}

function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  const muteIcon = muteButton.querySelector('i');
  if (isMuted) {
    muteIcon.classList.remove('fa-microphone');
    muteIcon.classList.add('fa-microphone-slash');
    muteButton.classList.add('muted');
  } else {
    muteIcon.classList.remove('fa-microphone-slash');
    muteIcon.classList.add('fa-microphone');
    muteButton.classList.remove('muted');
  }
}


function sendChatMessage(message) {
  ws.send(JSON.stringify({
    type: 'chat_message',
    message: message
  }));
}


function displayEmojiReaction(participantId, emoji) {
  const participantElement = document.querySelector(`[data-participant-id="${participantId}"]`);
  if (participantElement) {
    const avatarElement = participantElement.querySelector('.participant-avatar');
    if (avatarElement) {
      const reactionElement = document.createElement('div');
      reactionElement.className = 'emoji-reaction';
      reactionElement.textContent = emoji;

      // No need to set left and top here as it's in the CSS now

      avatarElement.appendChild(reactionElement);

      // Remove the emoji after animation
      setTimeout(() => reactionElement.remove(), 4000); // Doubled to 3000ms
    }
  }
}

// Initialize WebSocket connection when the script loads
connectWebSocket();


// DOM Elements
const emojiButton = document.getElementById('emojiButton');
const chatButton = document.getElementById('chatButton');
const emojiList = document.getElementById('emojiList');
const chatPanel = document.getElementById('chatPanel');
const messageInput = document.getElementById('messageInput');

// Event Listeners
emojiButton.addEventListener('click', toggleEmojiList);
chatButton.addEventListener('click', toggleChatPanel);


function toggleEmojiList() {
  const emojiList = document.getElementById('emojiList');
  emojiList.classList.toggle('hidden');
}

let unreadMessageCount = 0;
let isChatOpen = false;
let lastSeenMessageTimestamp = Date.now();

function toggleChatPanel(event) {
  event.stopPropagation();
  chatPanel.classList.toggle('open');
  isChatOpen = chatPanel.classList.contains('open');
  if (isChatOpen) {
    resetUnreadMessageCount();
    document.addEventListener('click', handleOutsideClickChat);
  } else {
    document.removeEventListener('click', handleOutsideClickChat);
  }
}

function resetUnreadMessageCount() {
  unreadMessageCount = 0;
  lastSeenMessageTimestamp = Date.now();
  updateChatBadge();
}

function updateChatBadge() {
  const chatBadge = document.getElementById('chatBadge');
  if (unreadMessageCount > 0) {
    chatBadge.textContent = unreadMessageCount;
    chatBadge.classList.remove('hidden');
  } else {
    chatBadge.classList.add('hidden');
  }
}


function handleOutsideClickChat(event) {
  if (!chatPanel.contains(event.target) && event.target !== chatButton) {
    toggleChatPanel(event);
  }
}

function sendChatMessage() {
  const message = messageInput.value.trim();
  if (message) {
    ws.send(JSON.stringify({
      type: 'chat_message',
      message: message
    }));
    messageInput.value = '';
  }
}

function displayChatMessage(participantName, message, timestamp) {
  const chatMessagesElement = document.getElementById('chatMessages');
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message';
  messageElement.innerHTML = `<strong>${participantName}:</strong> ${message}`;
  chatMessagesElement.appendChild(messageElement);
  chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;

  if (timestamp > lastSeenMessageTimestamp && !isChatOpen) {
    unreadMessageCount++;
    updateChatBadge();
  }
}

function displayEmojiReaction(participantId, emoji) {
  const participantElement = document.querySelector(`[data-participant-id="${participantId}"]`);
  if (participantElement) {
    const reactionElement = document.createElement('div');
    reactionElement.className = 'emoji-reaction';
    reactionElement.textContent = emoji;
    participantElement.appendChild(reactionElement);
    reactionElement.style.fontSize = '40px';

    // Remove the emoji after animation
    setTimeout(() => reactionElement.remove(), 2000);
  }
}


chatButton.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleChatPanel();
});
document.addEventListener('click', handleOutsideClick);



function toggleEmojiList(event) {
  event.stopPropagation();
  emojiList.classList.toggle('hidden');
  if (!emojiList.classList.contains('hidden')) {
    document.addEventListener('click', handleOutsideClickEmoji);
  } else {
    document.removeEventListener('click', handleOutsideClickEmoji);
  }
}

function handleOutsideClickEmoji(event) {
  if (!emojiList.contains(event.target) && event.target !== emojiButton) {
    emojiList.classList.add('hidden');
    document.removeEventListener('click', handleOutsideClickEmoji);
  }
}

function handleOutsideClick(event) {
  const emojiList = document.getElementById('emojiList');
  const emojiButton = document.getElementById('emojiButton');

  if (!emojiList.contains(event.target) && event.target !== emojiButton) {
    emojiList.classList.add('hidden');
  }
}


function sendEmojiReaction(emoji) {
  ws.send(JSON.stringify({
    type: 'emoji_reaction',
    emoji: emoji
  }));
  emojiList.classList.add('hidden');
  document.removeEventListener('click', handleOutsideClickEmoji);
}

function showLoadingAnimation() {
  loadingAnimation.style.display = 'flex';
}

function hideLoadingAnimation() {
  loadingAnimation.style.display = 'none';
}

document.getElementById('chatButton').addEventListener('click', toggleChatPanel);
updateChatBadge();