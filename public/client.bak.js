'use strict';

const roomId = '11';
const peerConfig = {'iceServers': [

	{
		urls: "stun:stun.l.google.com:19302"
	},	
/*
	{
		urls: "turn:test.telytec.com:3478",
		username: "cesar",
		credential: "cesar"
	}
*/	
	
]};
const socket = io();

let localVideo, remoteVideo;
let localStream, localStream2, audioTracks, videoTracks;
let localPeer;
let clients = new Map();

window.onload = () => {
	// DOM elements
	localVideo = document.getElementById('localVideo');
	//remoteVideo = document.getElementById('remoteVideo');	
	
	// DOM elements listeners
	document.getElementById('start').addEventListener('click', join);
	//document.getElementById('hangup').addEventListener('click', hangup);	
	//document.getElementById('mute').addEventListener('click', mute);
}


// SOCKET EVENT CALLBACKS =====================================================
socket.on('join_answer', (res) => {	
	console.log(`Socket event callback: join_answer. msg: ${res.joined}`);
	if(res.joined) {
		console.log(`This peer has been joined to the room: ${res.roomId}. SocketId: ${socket.id}`)
	}
	else {
		console.log(`Room is full`)
	}

})
/*
const peer = await addPeer(remoteSocketId);
		const offer = await peer.createOffer();
		await peer.setLocalDescription(offer);
		socket.emit('offer', {
			type: 'offer',
			from: socket.id,
			to: remoteSocketId,
			sdp: offer,
		});
*/
socket.on('offer', async (res) => {

})

// FUNCTIONS ==================================================================

async function join() {
	await setLocalStream();
	socket.emit('join', roomId, socket.id);
}

async function addPeer(remoteSocketId) {
	const peer = new RTCPeerConnection(peerConfig);
	localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
	const client = {remoteUserId:'', peer:peer}
	clients.set(remoteSocketId, client);

	peer.addEventListener('track', (e) => {		
		const video = document.createElement('video');
		video.setAttribute('id', remoteSocketId);
		video.setAttribute('autoplay', true);
   	//video.setAttribute('playsinline', true);
   	video.srcObject = e.streams[0];
   	const container = document.getElementById('container');
   	container.appendChild(video);
   	remoteVideo.srcObject = e.streams[0];
	});
	peer.addEventListener('connectionstatechange', async (e) => {
		console.log(peer.connectionState);
		if (peer.connectionState === 'connected') {
			// Peers connected!
			let stats = await peer.getStats();
			let values = stats.values();
			for (const value of stats.values()) {
				if(value.type=="local-candidate" || value.type=="remote-candidate")
					console.log(value);
			}
		}
	});
	peer.addEventListener('iceconnectionstatechange', (e) => {
		//console.log(peer.iceConnectionState);
	});
	peer.addEventListener("icegatheringstatechange", (e) => {
		//console.log(e.target.iceGatheringState);
	});
	peer.addEventListener('icecandidate', async (e) => {
		console.log(e.candidate);	
		socket.emit('webrtc_msg', {
			type: 'icecandidate',
			from: socket.id,
			to: remoteSocketId,
			candidate: e.candidate,
		});
	});	

	return peer;	
}

function addRemotePeer(remoteSocketId) {
	const peer = new RTCPeerConnection(peerConfig);
	const client = {remoteUserId:'', peer:peer}
	clients.set(remoteSocketId, client);
	//localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
	const tracks = localStream.getTracks();
	peer.addTrack(tracks[1], localStream);
	peer.addEventListener('track', (e) => {

		//remoteVideo.srcObject = e.streams[0];
		//const newVideo = document.createElement('video');
		//const container = document.getElementById('container');
		//container.appendChild(newVideo);
		//newVideo.srcObject = e.streams[0];
	});
	

	peer.addEventListener('icecandidate', async (e) => {
		socket.emit('webrtc_msg', {
			type: 'icecandidate',
			from: socket.id,
			to: remoteSocketId,
			candidate: e.candidate,
		});
	});

	

	return peer;	
}


// SOCKET EVENT CALLBACKS =====================================================



// Other Client has joined from remoteSocketId
socket.on('client_joined', async (remoteSocketId) => {		// Local peer
	console.log(`Socket event callback: client_joined. Socket Id: ${remoteSocketId}`);

	/*
	const peer = await addPeer(remoteSocketId);
	const offer = await peer.createOffer();
	await peer.setLocalDescription(offer);
	socket.emit('webrtc_msg', {
		type: 'offer',
		from: socket.id,
		to: remoteSocketId,
		sdp: offer,
	});
	*/
	
});


socket.on('webrtc_offer', async (msg) => {		// Remote peer
	console.log(`Socket event callback: webrtc_offer. Socket Id: ${socket.id}`);
	console.log(msg);
	const peer = new RTCPeerConnection(peerConfig);
	localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
	const sdp = new RTCSessionDescription(msg.sdp);		
	peer.setRemoteDescription(sdp);
	const answer = await peer.createAnswer();
	await peer.setLocalDescription(answer);
	socket.emit('webrtc_answer', {						
		type: 'answer',
		sdp: answer,
	});
	peer.addEventListener('icecandidate', async (e) => {
		console.log(e.candidate)
		socket.emit('icecandidate', {
			from: socket.id,
			//to: remoteSocketId,
			candidate: e.candidate,
		});
	});
	console.log(peer)
})

socket.on('webrtc_msg', async (msg) => {
	console.log(`Socket Event: ${msg.type}. From socket: ${msg.from}. To socket: ${msg.to}`);
	if(msg.type==='offer') {									// Remote peer
		const peer = await addRemotePeer(msg.from);		
		const sdp = new RTCSessionDescription(msg.sdp);		
		peer.setRemoteDescription(sdp);
   	const answer = await peer.createAnswer();
		await peer.setLocalDescription(answer);
		socket.emit('webrtc_msg', {						
			type: 'answer',
			from: socket.id,
			to: msg.from,
			sdp: answer,
		});	
	}

	else if(msg.type==='answer') {							// Local peer
		const peer = clients.get(msg.from).peer;
		const sdp = new RTCSessionDescription(msg.sdp);
		peer.setRemoteDescription(sdp);
	}

	else if(msg.type==='icecandidate') {					// Local and Remote peer

		const peer = clients.get(msg.from).peer;		
		const candidate = (msg.candidate) ? new RTCIceCandidate(msg.candidate) : msg.candidate;		
		//const ice = await peer.addIceCandidate(msg.candidate);
		/*
		console.log(candidate);
		let new_candidateInit = candidate.toJSON();
		let new_candidate = new_candidateInit.candidate;
		let res = new_candidate.split(" ");
		let port = parseInt(res[5]);
		//console.log(new_candidate);
		
		let new_icecandidate;
		for(let i=0; i<5; i++) {			
			res[5] = (port+i).toString();		
			new_candidate = res.join(" ");		
			new_candidateInit.candidate = new_candidate;
			new_icecandidate = new RTCIceCandidate(new_candidateInit);
			//console.log(new_icecandidate);
			await peer.addIceCandidate(candidate);
		}
		//peer.addIceCandidate(msg.candidate);
		/*
		*/
		try {
			await peer.addIceCandidate(candidate);

		} catch (e) {
			console.error('Error adding received ice candidate', e);
			console.log(msg.candidate);
		}
		
		//console.log(peer.iceGatheringState);
		/*
		peer.addIceCandidate(msg.candidate).catch(e => {
      	console.log("Failure during addIceCandidate(): " + e.name);
    	});
    	*/
	}
});
/* 
socket.on('ice_candidate', async (msg) => {		// Local and Remote peer
	console.log(`Socket Event: ice_candidate. From socket: ${msg.from}. To socket: ${msg.to}`);
	const client=clients.find( client => client.socketId === msg.to);
	const peer = client.peer;
	let ice = await peer.addIceCandidate(msg.candidate);
});

// This Client has joined
socket.on('webrtc_offer', async (msg) => {		// Remote peer
	console.log(`Socket Event: webrtc_offer. From socket: ${msg.from}. To socket: ${msg.to}`);
	const peer = new RTCPeerConnection(peerConfig);
	const client = {remoteuser:'', socketId:socket.id, peer:peer}
	clients.push(client);
	peer.addEventListener('track', (e) => {
		remoteVideo.srcObject = e.streams[0];
	});
	peer.addEventListener('icecandidate', (e) => {
		socket.emit('ice_candidate', {
			from: socket.id,
			to: msg.from,
			candidate: e.candidate,
		});	
	});
	localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

	peer.setRemoteDescription(msg.sdp);
   const answer = await peer.createAnswer();
	await peer.setLocalDescription(answer);

	socket.emit('webrtc_answer', {
		from: socket.id,
		to: msg.from,
		sdp: answer,
	});
});

socket.on('webrtc_answer', async (msg) => {		// Local peer
	console.log(`Socket Event: webrtc_answer. From socket: ${msg.from}. To socket: ${msg.to}`);
	const client=clients.find( client => client.socketId === msg.to);
	const peer = client.peer;
	peer.setRemoteDescription(msg.sdp);
});



socket.on('room_created', async (stat) => {
	console.log('Socket event callback: room_created. Room Id: '+stat);
	console.log('You are the first in the room');
	//socket.emit('start_call', room);
});

socket.on('room_joined', async () => {
  console.log('Socket event callback: room_joined');
  console.log('You have been accepted to enter into the room');
  
  const cfg = {'iceServers': [{urls: 'stun:stun.l.google.com:19302'}]}
	localPeer = new RTCPeerConnection(cfg);
	localpeer.addEventListener('track', (e) => { });
	localPeer.addEventListener('icecandidate', async (e) => {	});
	localStream.getTracks().forEach(track => localPeer.addTrack(track, localStream));
	const offer = await peer.createOffer();
	await peer.setLocalDescription(offer);

	socket.emit('webrtc_offer', {
		sdp: peer.localDescription,
		roomId: roomId
	});
});

socket.on('webrtc_offer2', async (sdp) => {
	console.log('Socket event callback: webrtc_offer');
	peer.setRemoteDescription(sdp);
    await createAnswer(rtcPeerConnection)

})
*/
/*
socket.on('start_call', async () => {
	console.log('Socket event callback: start_call');
	if (isRoomCreator) {
		rtcPeerConnection = new RTCPeerConnection(iceServers)
		addLocalTracks(rtcPeerConnection)
		rtcPeerConnection.ontrack = setRemoteStream
		rtcPeerConnection.onicecandidate = sendIceCandidate
		await createOffer(rtcPeerConnection)
	}
})
*/


async function setLocalStream() {
	const constraints = {
		"audio": true,
		"video": true
		/*
		"video": {			
			"width": {  "max": "500" },
			"height": { "max": "500" },
			"frameRate": { "max": "5" }			
		}
		*/
	}
	try {
  		localStream = await navigator.mediaDevices.getUserMedia(constraints);
  		//localStream = await navigator.mediaDevices.getDisplayMedia();
  		//videoTracks = localStream.getVideoTracks();
  		//audioTracks = localStream.getAudioTracks();
		localVideo.srcObject = localStream;

	} catch (e) {
		alert(`getUserMedia() error: ${e.name}`);
	}
}

async function start2() {	
	const cfg = {'iceServers': [{urls: 'stun:stun.l.google.com:19302'}]}
	//const cfg = {};
	pc1 = new RTCPeerConnection(cfg);
	pc2 = new RTCPeerConnection(cfg);
	
	pc1.addEventListener('connectionstatechange', async (e) => {
		//console.log(e);
    	if (pc1.connectionState === 'connected') {
        // Peers connected!
        let stats = await pc1.getStats();
			let values = stats.values();
			for (const value of stats.values()) {
				if(value.type=="local-candidate" || value.type=="remote-candidate")
					console.log(value);
			}
    	}
    console.log(e);
    console.log(pc1.iceConnectionState);
    console.log(pc1.connectionState);
	});

	pc1.addEventListener('iceconnectionstatechange', (e) => {
		//console.log(e);
		//console.log('pc1 ice cs:'+pc1.iceConnectionState);
	});
	pc1.addEventListener('icecandidate', async (e) => {		
		console.log(e);
		let ice = await pc2.addIceCandidate(e.candidate);
		console.log('pc1 ice:'+ice);
		//onIceCandidate(pc1, e)
		/*
		let stats = await pc1.getStats();
		let values = stats.values();
		for (const value of stats.values()) {
			console.log(value);
		}
		*/
	});
	pc2.addEventListener('icecandidate', async (e) => {		
		console.log(e);
		let ice = await pc1.addIceCandidate(e.candidate);
		console.log('pc2 ice: '+ice);
	});

	pc2.addEventListener('track', (e) => {
		console.log(e);
		if (remoteVideo.srcObject !== e.streams[0]) {
		    remoteVideo.srcObject = e.streams[0];
		    console.log('pc2 received remote stream');
		  }
	});

	

	const offer = await pc1.createOffer();
	await pc1.setLocalDescription(offer);	
	await pc2.setRemoteDescription(pc1.localDescription);
	
	const answer = await pc2.createAnswer();
	await pc2.setLocalDescription(answer);
	await pc1.setRemoteDescription(answer);


}

function mute() {
	audioTracks.forEach(track => track.enabled = false);
	//videoTracks.forEach(track => track.enabled = false);
}

function hangup() {
  console.log('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  bt3.disabled = true;
  bt2.disabled = false;
}


/*
      let msgDiv;
      window.onload = () => {
         msgDiv = document.querySelector("#chat");
         let btn = document.querySelector("#go");
         let input = document.getElementById("enter");
         btn.addEventListener("click", () => {
            //alert('Hola');
            if (input.value) {
               socket.emit('chat', {val:input.value, id:socket.id});
               input.value = '';
            }
         })
      }
      const socket = io();
      //const socket = io("ws://test.telytec.com:3000");

      socket.on("hello", (arg) => {
         //console.log(arg); // world
      });
      socket.on("connect", () => {
        // either with send()
        socket.send("Hello!");

        // or with emit() and custom event names
        socket.emit("salutations", "Hello!", { "mr": "john" }, Uint8Array.from([1, 2, 3, 4]));
      });
      socket.on("chat", (arg) => {
         console.log(arg.id);
         msgDiv.innerHTML += JSON.stringify(arg)+' '+arg.id+'<br>';
      });
*/