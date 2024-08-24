const wsUrl = 'wss://backend-project-5r9n.onrender.com';
let ws;
let localStream;
let peerConnections = new Map();
let roomId = null;
let username = null;
let isMuted = false;

// WebSocket connection
function connectWebSocket() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connection established');
    if (window.location.pathname.includes('rooms.html')) {
      requestRooms();
    }
  };

  ws.onmessage = handleWebSocketMessage;

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    alert('Error connecting to the server. Please try again.');
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
  };
}

// Handle WebSocket messages
function handleWebSocketMessage(event) {
  const data = JSON.parse(event.data);
  console.log('Received message:', data);

  switch (data.type) {
    case 'rooms_list':
      displayRooms(data.rooms);
      break;
    case 'room_created':
    case 'room_joined':
      roomId = data.roomId;
      window.location.href = 'call.html';
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
      handleCallSignaling(data);
      break;
  }
}

// Index page
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
  document.getElementById('enterButton').addEventListener('click', () => {
    username = document.getElementById('usernameInput').value.trim();
    if (username) {
      localStorage.setItem('username', username);
      window.location.href = 'rooms.html';
    } else {
      alert('Please enter a username');
    }
  });
}

// Rooms page
if (window.location.pathname.includes('rooms.html')) {
  username = localStorage.getItem('username');
  if (!username) {
    window.location.href = 'index.html';
  }

  connectWebSocket();

  document.getElementById('createRoomButton').addEventListener('click', createRoom);
}

function requestRooms() {
  ws.send(JSON.stringify({ type: 'get_rooms' }));
}

function displayRooms(rooms) {
  const roomsList = document.getElementById('roomsList');
  roomsList.innerHTML = '';

  if (rooms.length === 0) {
    roomsList.innerHTML = '<p>No rooms available. Create one!</p>';
    return;
  }

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

function createRoom() {
  const roomTitle = document.getElementById('roomTitleInput').value.trim();
  if (roomTitle) {
    ws.send(JSON.stringify({ type: 'create_room', title: roomTitle, host: username }));
  } else {
    alert('Please enter a room title');
  }
}

function joinRoom(roomId) {
  ws.send(JSON.stringify({ type: 'join_room', roomId, username }));
}

// Call page
if (window.location.pathname.includes('call.html')) {
  username = localStorage.getItem('username');
  if (!username || !roomId) {
    window.location.href = 'rooms.html';
  }

  connectWebSocket();
  initializeCall();

  document.getElementById('leaveButton').addEventListener('click', leaveRoom);
  document.getElementById('muteButton').addEventListener('click', toggleMute);
  document.getElementById('closeRoomButton').addEventListener('click', closeRoom);
}

async function initializeCall() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    addParticipant(username, true);
  } catch (error) {
    console.error('Error accessing microphone:', error);
    alert('Error accessing microphone. Please ensure you have given permission.');
  }
}

function addParticipant(participantUsername, isLocal = false) {
  const participantsGrid = document.getElementById('participantsGrid');
  const participant = document.createElement('div');
  participant.className = 'participant';
  participant.textContent = participantUsername.slice(0, 2).toUpperCase();
  participant.title = participantUsername;
  if (isLocal) {
    participant.classList.add('local-participant');
  }
  participantsGrid.appendChild(participant);
}

function handleNewParticipant(data) {
  addParticipant(data.username);
  createPeerConnection(data.id);
}

function handleParticipantLeft(data) {
  const participantsGrid = document.getElementById('participantsGrid');
  const participant = participantsGrid.querySelector(`[title="${data.username}"]`);
  if (participant) {
    participantsGrid.removeChild(participant);
  }
  if (peerConnections.has(data.id)) {
    peerConnections.get(data.id).close();
    peerConnections.delete(data.id);
  }
}

function createPeerConnection(participantId) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
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
  };

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnections.set(participantId, peerConnection);
  return peerConnection;
}

function handleCallSignaling(data) {
  const peerConnection = peerConnections.get(data.senderId) || createPeerConnection(data.senderId);

  switch (data.type) {
    case 'offer':
      peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
          ws.send(JSON.stringify({
            type: 'answer',
            answer: peerConnection.localDescription,
            targetItype: 'answer',
            answer: peerConnection.localDescription,
            targetId: data.senderId
          }));
        });
      break;
    case 'answer':
      peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;
    case 'ice_candidate':
      peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      break;
  }
}

function leaveRoom() {
  ws.send(JSON.stringify({ type: 'leave_room', roomId, username }));
  cleanup();
  window.location.href = 'rooms.html';
}

function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  updateMuteButtonState();
}

function updateMuteButtonState() {
  const muteButton = document.getElementById('muteButton');
  muteButton.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i> Unmute' : '<i class="fas fa-microphone"></i> Mute';
  muteButton.classList.toggle('muted', isMuted);
}

function closeRoom() {
  if (confirm('Are you sure you want to close the room? This will disconnect all participants.')) {
    ws.send(JSON.stringify({ type: 'close_room', roomId }));
    cleanup();
    window.location.href = 'rooms.html';
  }
}

function cleanup() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
}

// Keep screen on
function keepScreenOn() {
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then(lock => {
      console.log('Screen wake lock is active');
    }).catch(err => {
      console.error(`${err.name}, ${err.message}`);
    });
  }
}

// Call this function when entering a call
if (window.location.pathname.includes('call.html')) {
  keepScreenOn();
}

// Periodic connection check
function checkConnections() {
  peerConnections.forEach((pc, participantId) => {
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      console.log(`Connection to ${participantId} is ${pc.iceConnectionState}. Restarting ICE.`);
      pc.restartIce();
    }
  });
}

// Call this function every 10 seconds
setInterval(checkConnections, 10000);

// Handle visibility change
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && peerConnections.size > 0) {
    peerConnections.forEach(pc => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    });
  }
});