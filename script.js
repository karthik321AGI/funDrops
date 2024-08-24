const wsUrl = 'wss://backend-project-5r9n.onrender.com'; // Replace with your actual backend URL
let ws;
let localStream;
let peerConnections = new Map();
let currentRoom = null;
let isMuted = false;
let username = '';

// Connect WebSocket
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
      console.log('Displaying rooms:', data.rooms);
      displayRooms(data.rooms);
      break;
    case 'room_created':
    case 'room_joined':
      currentRoom = data.roomId;
      updateRoomUI(data);
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
    case 'room_updated':
      updateRoomUI(data);
      break;
  }
}

// Request rooms list
function requestRooms() {
  ws.send(JSON.stringify({ type: 'get_rooms' }));
}

// Display rooms
function displayRooms(rooms) {
  const roomsList = document.getElementById('roomsList');
  roomsList.innerHTML = '';

  if (rooms.length === 0) {
    console.log('No rooms available');
    roomsList.innerHTML = '<p>No rooms available. Create a new one!</p>';
    return;
  }

  console.log('Displaying rooms:', rooms);
  rooms.forEach(room => {
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    roomCard.innerHTML = `
            <h3>${room.title}</h3>
            <p>Host: ${room.host}</p>
            <p>Participants: ${room.participants}</p>
        `;
    roomCard.onclick = () => joinRoom(room.id);
    roomsList.appendChild(roomCard);
  });
}

// Join room
function joinRoom(roomId) {
  ws.send(JSON.stringify({ type: 'join_room', roomId, username }));
  window.location.href = 'call.html';
}

// Create room
function createRoom() {
  const roomTitle = prompt('Enter room title:');
  if (roomTitle) {
    ws.send(JSON.stringify({ type: 'create_room', title: roomTitle, username }));
    window.location.href = 'call.html';
  }
}

// Update room UI
function updateRoomUI(data) {
  document.getElementById('roomTitle').textContent = data.roomTitle;
  updateParticipantsGrid(data.participants);
  updateParticipantsCount(data.participants.length);
}

// Update participants grid
function updateParticipantsGrid(participants) {
  const grid = document.getElementById('participantsGrid');
  grid.innerHTML = '';
  participants.forEach(participant => {
    const avatar = document.createElement('div');
    avatar.className = 'participant-avatar';
    avatar.style.backgroundColor = getRandomColor();
    avatar.textContent = getInitials(participant.username);
    grid.appendChild(avatar);
  });
}

// Get random color for avatar
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Get initials from username
function getInitials(username) {
  return username.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

// Handle new participant
async function handleNewParticipant(data) {
  console.log('New participant joined:', data.id);
  const peerConnection = createPeerConnection(data.id);
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', offer: offer, targetId: data.id }));
  updateRoomUI(data);
}

// Handle offer
async function handleOffer(data) {
  console.log('Received offer from:', data.senderId);
  const peerConnection = createPeerConnection(data.senderId);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'answer', answer: answer, targetId: data.senderId }));
}

// Handle answer
async function handleAnswer(data) {
  console.log('Received answer from:', data.senderId);
  await peerConnections.get(data.senderId).setRemoteDescription(new RTCSessionDescription(data.answer));
}

// Handle ICE candidate
async function handleIceCandidate(data) {
  console.log('Received ICE candidate from:', data.senderId);
  if (peerConnections.has(data.senderId)) {
    await peerConnections.get(data.senderId).addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

// Handle participant left
function handleParticipantLeft(data) {
  console.log('Participant left:', data.id);
  if (peerConnections.has(data.id)) {
    peerConnections.get(data.id).close();
    peerConnections.delete(data.id);
  }
  updateRoomUI(data);
}

// Create peer connection
function createPeerConnection(participantId) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:your-turn-server.com",
        username: "your-username",
        credential: "your-credential"
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

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnections.set(participantId, peerConnection);
  return peerConnection;
}

// Update participants count
function updateParticipantsCount(count) {
  const participantsCount = document.getElementById('participantsCount');
  if (participantsCount) {
    participantsCount.textContent = `Participants: ${count}`;
  }
}

// Leave room
function leaveRoom() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leave_room' }));
  }
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
  currentRoom = null;
  window.location.href = 'rooms.html';
}

// Toggle mute
function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  const muteButton = document.getElementById('muteButton');
  muteButton.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i> Unmute' : '<i class="fas fa-microphone"></i> Mute';
  muteButton.classList.toggle('muted', isMuted);
}

// Initialize
function init() {
  connectWebSocket();

  if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    document.getElementById('enterRoomsButton').addEventListener('click', () => {
      username = document.getElementById('usernameInput').value.trim();
      if (username) {
        localStorage.setItem('username', username);
        window.location.href = 'rooms.html';
      } else {
        alert('Please enter your name');
      }
    });
  } else if (window.location.pathname.includes('rooms.html')) {
    username = localStorage.getItem('username');
    if (!username) {
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('createRoomButton').addEventListener('click', createRoom);
  } else if (window.location.pathname.includes('call.html')) {
    username = localStorage.getItem('username');
    if (!username) {
      window.location.href = 'index.html';
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        localStream = stream;
        document.getElementById('disconnectButton').addEventListener('click', leaveRoom);
        document.getElementById('muteButton').addEventListener('click', toggleMute);
      })
      .catch(error => {
        console.error('Error accessing microphone:', error);
        alert('Error accessing microphone. Please ensure you have given permission.');
      });
  }
}

// Call init function when the page loads
window.addEventListener('load', init);