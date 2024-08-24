const wsUrl = 'wss://backend-project-5r9n.onrender.com';
let ws;
let localStream;
let peerConnections = new Map();
let currentRoom = null;
let userName = '';
let isMuted = false;

// DOM Elements
const enterButton = document.getElementById('enterButton');
const createRoomButton = document.getElementById('createRoomButton');
const disconnectButton = document.getElementById('disconnectButton');
const muteButton = document.getElementById('muteButton');
const userNameInput = document.getElementById('userNameInput');
const roomTitleInput = document.getElementById('roomTitleInput');
const roomsList = document.getElementById('roomsList');
const welcomeMessage = document.getElementById('welcomeMessage');
const roomTitle = document.getElementById('roomTitle');
const participantsCount = document.getElementById('participantsCount');

// Event Listeners
if (enterButton) enterButton.addEventListener('click', enterApp);
if (createRoomButton) createRoomButton.addEventListener('click', createRoom);
if (disconnectButton) disconnectButton.addEventListener('click', leaveRoom);
if (muteButton) muteButton.addEventListener('click', toggleMute);

// Functions
function enterApp() {
  userName = userNameInput.value.trim();
  if (userName) {
    localStorage.setItem('userName', userName);
    window.location.href = 'rooms.html';
  } else {
    alert('Please enter your name');
  }
}

function initRoomsPage() {
  userName = localStorage.getItem('userName');
  if (!userName) {
    window.location.href = 'index.html';
    return;
  }
  welcomeMessage.textContent = `Welcome, ${userName}!`;
  connectWebSocket();
}

function createRoom() {
  const roomTitle = roomTitleInput.value.trim();
  if (roomTitle) {
    ws.send(JSON.stringify({ type: 'create_room', title: roomTitle, host: userName }));
  } else {
    alert('Please enter a room title');
  }
}

function joinRoom(roomId) {
  currentRoom = roomId;
  getLocalStream().then(() => {
    ws.send(JSON.stringify({ type: 'join_room', roomId: roomId }));
    window.location.href = `call.html?roomId=${roomId}`;
  });
}

function leaveRoom() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leave_room', roomId: currentRoom }));
  }
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
  currentRoom = null;
  window.location.href = 'rooms.html';
}

function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  updateMuteButtonState();
}

function updateMuteButtonState() {
  muteButton.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i> Unmute' : '<i class="fas fa-microphone"></i> Mute';
  muteButton.classList.toggle('muted', isMuted);
}

async function getLocalStream() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      console.log('Local stream obtained');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please ensure you have given permission.');
      return null;
    }
  }
  return localStream;
}

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('WebSocket already connected');
    return;
  }

  console.log('Connecting to WebSocket');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connection established');
    ws.send(JSON.stringify({ type: 'get_rooms' }));
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);

    switch (data.type) {
      case 'rooms_list':
        updateRoomsList(data.rooms);
        break;
      case 'room_created':
        alert('Room created successfully!');
        roomTitleInput.value = '';
        break;
      case 'new_participant':
        handleNewParticipant(data);
        break;
      case 'participant_left':
        handleParticipantLeft(data);
        break;
      case 'offer':
      case 'answer':
      case 'ice_candidate':
        handlePeerMessage(data);
        break;
      case 'room_joined':
        handleRoomJoined(data);
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

function updateRoomsList(rooms) {
  roomsList.innerHTML = '';
  rooms.forEach(room => {
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    roomCard.innerHTML = `
          <h3>${room.title}</h3>
          <p>Host: ${room.host}</p>
          <p>Participants: ${room.participants}</p>
      `;
    roomCard.addEventListener('click', () => joinRoom(room.id));
    roomsList.appendChild(roomCard);
  });
}

function handleNewParticipant(data) {
  console.log('New participant joined:', data.id);
  createPeerConnection(data.id);
  updateParticipantsCount(data.participants);
}

function handleParticipantLeft(data) {
  console.log('Participant left:', data.id);
  if (peerConnections.has(data.id)) {
    peerConnections.get(data.id).close();
    peerConnections.delete(data.id);
  }
  updateParticipantsCount(data.participants);
}

function handlePeerMessage(data) {
  const pc = peerConnections.get(data.senderId);
  if (pc) {
    switch (data.type) {
      case 'offer':
        handleOffer(pc, data.offer, data.senderId);
        break;
      case 'answer':
        handleAnswer(pc, data.answer);
        break;
      case 'ice_candidate':
        handleIceCandidate(pc, data.candidate);
        break;
    }
  }
}

async function handleOffer(pc, offer, senderId) {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'answer', answer: answer, targetId: senderId }));
}

async function handleAnswer(pc, answer) {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIceCandidate(pc, candidate) {
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

function createPeerConnection(participantId) {
  console.log('Creating peer connection for participant:', participantId);
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "e71c4a9cf031d7330ef0b2de",
        credential: "PSt/7RpLC4ErNFGu"
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "e71c4a9cf031d7330ef0b2de",
        credential: "PSt/7RpLC4ErNFGu"
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "e71c4a9cf031d7330ef0b2de",
        credential: "PSt/7RpLC4ErNFGu"
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "e71c4a9cf031d7330ef0b2de",
        credential: "PSt/7RpLC4ErNFGu"
      }
    ]
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate');
      ws.send(JSON.stringify({
        type: 'ice_candidate',
        candidate: event.candidate,
        targetId: participantId
      }));
    }
  };

  pc.ontrack = (event) => {
    console.log('Received remote track');
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch(e => console.error('Error playing audio:', e));
  };

  if (localStream) {
    console.log('Adding local stream to peer connection');
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  peerConnections.set(participantId, pc);
  return pc;
}

function updateParticipantsCount(count) {
  if (participantsCount) {
    participantsCount.textContent = `Participants: ${count}`;
  }
}

function handleRoomJoined(data) {
  currentRoom = data.roomId;
  if (roomTitle) {
    roomTitle.textContent = `Room: ${data.title}`;
  }
  updateParticipantsCount(data.participants);
}

function initCallPage() {
  const urlParams = new URLSearchParams(window.location.search);
  currentRoom = urlParams.get('roomId');
  if (!currentRoom) {
    window.location.href = 'rooms.html';
    return;
  }
  connectWebSocket();
  getLocalStream().then(() => {
    ws.send(JSON.stringify({ type: 'join_room', roomId: currentRoom }));
  });
}

// Initialize the appropriate page
if (window.location.pathname.endsWith('rooms.html')) {
  initRoomsPage();
} else if (window.location.pathname.endsWith('call.html')) {
  initCallPage();
}

function keepScreenOn() {
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then(lock => {
      console.log('Screen wake lock is active');
    }).catch(err => {
      console.error(`${err.name}, ${err.message}`);
    });
  }
}

keepScreenOn();