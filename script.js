let ws;
let localStream;
let peerConnections = new Map();
let roomId = null;
let username = '';
let isMuted = false;

const wsUrl = 'wss://backend-project-5r9n.onrender.com';

function connectWebSocket() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connection established');
    if (window.location.pathname.includes('rooms.html')) {
      getRooms();
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    alert('Error connecting to the server. Please try again.');
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
  };
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'rooms_list':
      updateRoomsList(data.rooms);
      break;
    case 'room_created':
    case 'room_joined':
      joinRoom(data.roomId, data.roomTitle);
      break;
    case 'new_participant':
      handleNewParticipant(data);
      break;
    case 'offer':
    case 'answer':
    case 'ice_candidate':
      handlePeerConnection(data);
      break;
    case 'participant_left':
      handleParticipantLeft(data);
      break;
    case 'room_closed':
      handleRoomClosed();
      break;
  }
}

// Index page functions
if (window.location.pathname.includes('index.html')) {
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

// Rooms page functions
if (window.location.pathname.includes('rooms.html')) {
  connectWebSocket();

  document.getElementById('createRoomButton').addEventListener('click', () => {
    const roomTitle = document.getElementById('roomTitleInput').value.trim();
    if (roomTitle) {
      ws.send(JSON.stringify({ type: 'create_room', roomTitle, username }));
    } else {
      alert('Please enter a room title');
    }
  });

  function getRooms() {
    ws.send(JSON.stringify({ type: 'get_rooms' }));
  }

  function updateRoomsList(rooms) {
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';
    rooms.forEach(room => {
      const roomCard = document.createElement('div');
      roomCard.className = 'room-card';
      roomCard.innerHTML = `
                <h3>${room.title}</h3>
                <p>Host: ${room.host}</p>
                <p>Participants: ${room.participants}</p>
            `;
      roomCard.addEventListener('click', () => joinRoom(room.id, room.title));
      roomList.appendChild(roomCard);
    });
  }

  function joinRoom(roomId, roomTitle) {
    localStorage.setItem('roomId', roomId);
    localStorage.setItem('roomTitle', roomTitle);
    window.location.href = 'call.html';
  }
}

// Call page functions
if (window.location.pathname.includes('call.html')) {
  connectWebSocket();

  username = localStorage.getItem('username');
  roomId = localStorage.getItem('roomId');
  const roomTitle = localStorage.getItem('roomTitle');

  document.getElementById('roomTitle').textContent = roomTitle;

  document.getElementById('leaveButton').addEventListener('click', leaveRoom);
  document.getElementById('muteButton').addEventListener('click', toggleMute);
  document.getElementById('closeRoomButton').addEventListener('click', closeRoom);

  initializeCall();

  async function initializeCall() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      ws.send(JSON.stringify({ type: 'join_room', roomId, username }));
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please ensure you have given permission.');
    }
  }

  function handleNewParticipant(data) {
    addParticipantToUI(data.username);
    createPeerConnection(data.id, data.username);
  }

  function addParticipantToUI(username) {
    const participantsList = document.getElementById('participantsList');
    const participantEl = document.createElement('div');
    participantEl.className = 'participant';
    participantEl.textContent = username.substring(0, 2).toUpperCase();
    participantEl.title = username;
    participantsList.appendChild(participantEl);
  }

  function createPeerConnection(participantId, participantUsername) {
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

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnections.set(participantId, { connection: peerConnection, username: participantUsername });

    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        ws.send(JSON.stringify({
          type: 'offer',
          offer: peerConnection.localDescription,
          targetId: participantId
        }));
      });
  }

  function handlePeerConnection(data) {
    const peerConnection = peerConnections.get(data.senderId)?.connection;
    if (peerConnection) {
      if (data.type === 'offer') {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
          .then(() => peerConnection.createAnswer())
          .then(answer => peerConnection.setLocalDescription(answer))
          .then(() => {
            ws.send(JSON.stringify({
              type: 'answer',
              answer: peerConnection.localDescription,
              targetId: data.senderId
            }));
          });
      } else if (data.type === 'answer') {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      } else if (data.type === 'ice_candidate') {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    }
  }

  function handleParticipantLeft(data) {
    const peerConnection = peerConnections.get(data.id);
    if (peerConnection) {
      peerConnection.connection.close();
      peerConnections.delete(data.id);
      removeParticipantFromUI(peerConnection.username);
    }
  }

  function removeParticipantFromUI(username) {
    const participantsList = document.getElementById('participantsList');
    const participants = participantsList.getElementsByClassName('participant');
    for (let participant of participants) {
      if (participant.title === username) {
        participantsList.removeChild(participant);
        break;
      }
    }
  }

  function handleRoomClosed() {
    alert('The room has been closed by the host.');
    leaveRoom();
  }

  function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_room', roomId }));
    }
    peerConnections.forEach(pc => pc.connection.close());
    peerConnections.clear();
    localStream.getTracks().forEach(track => track.stop());
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
      leaveRoom();
    }
  }
}

// Utility functions
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

// Check connections periodically
setInterval(() => {
  peerConnections.forEach((pc, participantId) => {
    if (pc.connection.iceConnectionState === 'disconnected' || pc.connection.iceConnectionState === 'failed') {
      console.log(`Connection to ${participantId} is ${pc.connection.iceConnectionState}. Restarting ICE.`);
      pc.connection.restartIce();
    }
  });
}, 10000);

// Handle visibility change
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && peerConnections.size > 0) {
    peerConnections.forEach(pc => {
      if (pc.connection.iceConnectionState === 'disconnected' || pc.connection.iceConnectionState === 'failed') {
        pc.connection.restartIce();
      }
    });
  }
});