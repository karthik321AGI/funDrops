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
      localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
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
    setTimeout(connectWebSocket, 5000); // Attempt to reconnect after 5 seconds
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
    setTimeout(connectWebSocket, 5000); // Attempt to reconnect after 5 seconds
  };
}

function createRoom(title) {
  ws.send(JSON.stringify({ type: 'create_room', title, hostName: userName }));
}

function joinRoom(roomId) {
  ws.send(JSON.stringify({ type: 'join_room', roomId, userName }));
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

function updateRoomsList(rooms) {
  roomsList.innerHTML = '';
  if (rooms.length === 0) {
    roomsList.innerHTML = '<p>No rooms available. Create one!</p>';
  } else {
    rooms.forEach((room) => {
      const roomCard = document.createElement('div');
      roomCard.className = 'room-card';
      roomCard.style.backgroundColor = getRandomColor();
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
  updateMuteButton();
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
  participantsList.innerHTML = '';
  participants.forEach(participant => {
    const participantElement = document.createElement('div');
    participantElement.className = 'participant';

    const avatar = document.createElement('div');
    avatar.className = 'participant-avatar';
    avatar.style.backgroundColor = getRandomColor();

    avatar.textContent = participant.name.substring(0, 2).toUpperCase();

    const name = document.createElement('div');
    name.className = 'participant-name';
    name.textContent = participant.name;

    participantElement.appendChild(avatar);
    participantElement.appendChild(name);
    participantsList.appendChild(participantElement);
  });
}

async function handleCallSignaling(data) {
  let peerConnection = peerConnections.get(data.senderId);
  if (!peerConnection) {
    peerConnection = await createPeerConnection(data.senderId);
  }

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
    await recreatePeerConnection(data.senderId);
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

  peerConnection.oniceconnectionstatechange = () => {
    console.log(`ICE connection state change: ${peerConnection.iceConnectionState}`);
    if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
      console.log(`Attempting to recreate peer connection with ${participantId}`);
      recreatePeerConnection(participantId);
    }
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

async function recreatePeerConnection(participantId) {
  console.log(`Recreating peer connection with ${participantId}`);
  if (peerConnections.has(participantId)) {
    peerConnections.get(participantId).close();
    peerConnections.delete(participantId);
  }
  await createPeerConnection(participantId);
  initiateCall(participantId);
}

async function initiateCall(participantId) {
  try {
    const peerConnection = peerConnections.get(participantId) || await createPeerConnection(participantId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({
      type: 'offer',
      offer: offer,
      targetId: participantId
    }));
  } catch (error) {
    console.error('Error initiating call:', error);
    await recreatePeerConnection(participantId);
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
  if (localStream) {
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  }
  updateMuteButton();
}

function updateMuteButton() {
  if (muteButton) {
    muteButton.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i> Unmute' : '<i class="fas fa-microphone"></i> Mute';
    muteButton.classList.toggle('muted', isMuted);
  }
}

// Initialize WebSocket connection when the script loads
connectWebSocket();