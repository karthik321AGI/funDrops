const wsUrl = 'wss://backend-project-5r9n.onrender.com';
let ws;
let localStream;
let peerConnections = new Map();
let roomId = null;
let isMuted = false;
let username = '';

// Utility functions
function $(id) { return document.getElementById(id); }

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
      getRooms();
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
      window.location.href = `call.html?roomId=${roomId}`;
      break;
    case 'new_participant':
      handleNewParticipant(data);
      break;
    case 'offer':
      handleOffer(data);
      break;
    case 'answer':
      handleAnswer(data);
      break;
    case 'ice_candidate':
      handleIceCandidate(data);
      break;
    case 'participant_left':
      handleParticipantLeft(data);
      break;
  }
}

// Index page
if (window.location.pathname.includes('index.html')) {
  $('enterButton').addEventListener('click', () => {
    username = $('usernameInput').value.trim();
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

  $('createRoomButton').addEventListener('click', () => {
    const roomTitle = $('roomTitleInput').value.trim();
    if (roomTitle) {
      ws.send(JSON.stringify({ type: 'create_room', title: roomTitle, host: username }));
    } else {
      alert('Please enter a room title');
    }
  });
}

function getRooms() {
  ws.send(JSON.stringify({ type: 'get_rooms' }));
}

function displayRooms(rooms) {
  const roomsList = $('roomsList');
  roomsList.innerHTML = '';
  if (rooms.length === 0) {
    roomsList.innerHTML = '<p>No rooms available</p>';
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

function joinRoom(roomId) {
  ws.send(JSON.stringify({ type: 'join_room', roomId, username }));
}

// Call page
if (window.location.pathname.includes('call.html')) {
  username = localStorage.getItem('username');
  if (!username) {
    window.location.href = 'index.html';
  }

  const urlParams = new URLSearchParams(window.location.search);
  roomId = urlParams.get('roomId');

  if (!roomId) {
    window.location.href = 'rooms.html';
  }

  connectWebSocket();
  initializeCall();

  $('disconnectButton').addEventListener('click', leaveRoom);
  $('muteButton').addEventListener('click', toggleMute);
}

async function initializeCall() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    addParticipant(username, true);
    ws.send(JSON.stringify({ type: 'join_room', roomId, username }));
  } catch (error) {
    console.error('Error accessing microphone:', error);
    alert('Error accessing microphone. Please ensure you have given permission.');
  }
}

function addParticipant(participantUsername, isLocal = false) {
  const participantsContainer = $('participants');
  const participant = document.createElement('div');
  participant.className = 'participant';
  participant.id = `participant-${participantUsername}`;

  const initials = participantUsername.split(' ').map(n => n[0]).join('').toUpperCase();
  participant.innerHTML = `
        <div class="participant-dp">${initials}</div>
        <p>${participantUsername}${isLocal ? ' (You)' : ''}</p>
    `;

  participantsContainer.appendChild(participant);
}

function removeParticipant(participantUsername) {
  const participant = $(`participant-${participantUsername}`);
  if (participant) {
    participant.remove();
  }
}

function handleNewParticipant(data) {
  addParticipant(data.username);
  createPeerConnection(data.id, data.username);
}

function createPeerConnection(participantId, participantUsername) {
  const peerConnection = new RTCPeerConnection({
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

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnections.set(participantId, { connection: peerConnection, username: participantUsername });

  return peerConnection;
}

async function handleOffer(data) {
  let peerConnection = peerConnections.get(data.senderId)?.connection;
  if (!peerConnection) {
    peerConnection = createPeerConnection(data.senderId, data.senderUsername);
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: 'answer',
    answer: answer,
    targetId: data.senderId
  }));
}

async function handleAnswer(data) {
  const peerConnection = peerConnections.get(data.senderId)?.connection;
  if (peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
}

async function handleIceCandidate(data) {
  const peerConnection = peerConnections.get(data.senderId)?.connection;
  if (peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error("Error adding received ice candidate", e);
    }
  }
}

function handleParticipantLeft(data) {
  const peerData = peerConnections.get(data.id);
  if (peerData) {
    peerData.connection.close();
    peerConnections.delete(data.id);
    removeParticipant(peerData.username);
  }
}

function leaveRoom() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leave_room', roomId }));
  }
  peerConnections.forEach(peer => peer.connection.close());
  peerConnections.clear();
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  window.location.href = 'rooms.html';
}

function toggleMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      isMuted = !isMuted;
      audioTrack.enabled = !isMuted;
      $('muteButton').innerHTML = isMuted ?
        '<i class="fas fa-microphone-slash"></i> Unmute' :
        '<i class="fas fa-microphone"></i> Mute';
      $('muteButton').classList.toggle('muted', isMuted);
    }
  }
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

// Initialize
connectWebSocket();
keepScreenOn();