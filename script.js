const wsUrl = 'wss://backend-project-5r9n.onrender.com';
let ws;
let localStream;
let peerConnections = new Map();
let roomId = null;
let isMuted = false;
let userName = '';

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
        updateRoomsList(data.rooms);
        break;
      case 'room_created':
      case 'room_joined':
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
  roomsList.innerHTML = '';
  if (rooms.length === 0) {
    roomsList.innerHTML = '<p>No rooms available. Create one!</p>';
  } else {
    rooms.forEach(room => {
      const roomCard = document.createElement('div');
      roomCard.className = 'room-card';
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
}

function updateParticipantsList(participants) {
  participantsList.innerHTML = '<h3>Participants:</h3>';
  participants.forEach(participant => {
    const participantElement = document.createElement('p');
    participantElement.textContent = participant.name;
    participantsList.appendChild(participantElement);
  });
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
  muteButton.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i> Unmute' : '<i class="fas fa-microphone"></i> Mute';
  muteButton.classList.toggle('muted', isMuted);
}

// Initialize WebSocket connection when the script loads
connectWebSocket();