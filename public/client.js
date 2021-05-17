'use strict';

//const peerConfig = {iceServers: [{urls: "stun:stun.l.google.com:19302"}]};	// No need to announce icecandidates. Only server do it
const socket = io();
const constraints = {
	audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: false}, 
	video: {width:{max: "150"}, frameRate:{max:"20"} }
	}
const maxBitrate = 45000
//const maxBitrate2 = 35

let localVideo, remoteVideo;
let localStream, localScreen;
let userName, roomId, peer;
let clients = new Map();
let streamIds = new Set();

window.onload = async () => {
	// DOM elements
	localVideo = document.getElementById('localVideo');
	remoteVideo = document.getElementById('remoteVideo');

	// DOM elements listeners
	document.getElementById('muteAudio').addEventListener('click', (e) => {
		if(localStream)
			localStream.getAudioTracks()[0].enabled ^= true
		document.getElementById('muteAudio').innerHTML = (localStream.getAudioTracks()[0].enabled) ? 'Mute Audio' : 'Unmute Audio'
	})
	document.getElementById('muteVideo').addEventListener('click', (e) => {
		if(localStream)
			localStream.getVideoTracks()[0].enabled ^= true
		document.getElementById('muteVideo').innerHTML = (localStream.getVideoTracks()[0].enabled) ? 'Mute Video' : 'Unmute Video'
	})	
	document.getElementById('start').addEventListener('click', async (e) => {
		userName = document.getElementById('userName').value;
		roomId = document.getElementById('roomId').value;

		socket.emit('join', userName, roomId);
	})
	document.getElementById('share').addEventListener('click', async (e) => {
		localScreen = await navigator.mediaDevices.getDisplayMedia({video: true, audio: true})
		console.log(localScreen.id)
		localScreen.getTracks().forEach(track => peer.addTransceiver( track, {direction:'sendonly', streams:[localScreen]}))
		//localScreen.getAudioTracks().forEach(track => peer.addTrack(track, localScreen))
		//localScreen.getVideoTracks().forEach(track => peer.addTrack(track, localScreen))
		localScreen.getVideoTracks()[0].addEventListener('ended', () => {					
			localScreen.getTracks().forEach(track => track.enabled = false)
			console.log('ended')
			socket.emit('endScreen', localScreen.id)		
		})
		
	})
}


// SOCKET EVENT CALLBACKS =====================================================

socket.on('join_answer', async (res) => {	
		console.log(`Socket event callback: join_answer. msg: ${res.joined}`);
		if(res.joined) {
			console.log(`This peer has been joined to the room: ${res.roomId}. SocketId: ${socket.id}`)
			peer = await newPeer(socket.id)
			console.log(localStream.id)	
			localVideo.srcObject = localStream;
			localVideo.style.width = 'auto';
			//localVideo.style.width = '100%';
		}	
		else {
			alert(`Room is full`)
		}
})
socket.on('webrtc_offer', async (msg) => {				// Acting as remote responser
	const offer = new RTCSessionDescription(msg.offer);	
	peer.setRemoteDescription(offer);

	const answer = await peer.createAnswer();
	//answer.sdp = updateBandwidthRestriction(answer.sdp, 'video', maxBitrate2)
	await peer.setLocalDescription(answer);
	socket.emit('webrtc_answer', {
		answer: answer,
	});
})
socket.on('webrtc_answer', (msg) => {					// Acting as offerer initiator
	const sdp = new RTCSessionDescription(msg.answer)
	peer.setRemoteDescription(sdp)
})
socket.on('webrtc_icecandidate', async (msg) => {	
	const candidate = (msg.candidate) ? new RTCIceCandidate(msg.candidate) : msg.candidate;
	await peer.addIceCandidate(candidate);
})
socket.on('webrtc_disconnection', (msg) => {
	msg.forEach(streamId => {
		document.getElementById(streamId).remove();
	})
})
socket.on('removeStream', (msg) => {
	msg.forEach(streamId => {
		document.getElementById(streamId).remove();
	})
})

// FUNCTIONS ==================================================================
async function newPeer(socketId) {
	const peer = new RTCPeerConnection()
	// Needed to send a correct offer
	
	localStream = await navigator.mediaDevices.getUserMedia(constraints);  	
	//localStream.getTracks().forEach(track => peer.addTrack(track, localStream));	// (addTrack() looks for unused transceivers to usurp) https://blog.mozilla.org/webrtc/rtcrtptransceiver-explored/
	localStream.getTracks().forEach(track => {
		const transceiver = peer.addTransceiver( track, {direction:'sendonly', streams:[localStream]})	// Same as previous line without usurpation
	})

	peer.addEventListener('negotiationneeded', async (e) => {
		console.log('Negotiation Needed')
		const offer = await peer.createOffer();		// Acting as offerer initiator
		//offer.sdp = updateBandwidthRestriction(offer.sdp, 'video', maxBitrate2)
		await peer.setLocalDescription(offer);
		socket.emit('webrtc_offer', {
			offer: offer,
		})
	})
	peer.addEventListener('icecandidate', (e) => {})		// Never used because remote peer should be always at public ip (remote peer is the one that announces candidates)
	peer.addEventListener('connectionstatechange', async (e) => {
		if (peer.connectionState === 'connected') {					
			peer.getSenders().forEach( sender => {				
				if (sender.track && sender.track.kind === 'video') {
					console.log('recoding with maxbitrate: '+maxBitrate)
					let params = sender.getParameters();
					params.encodings.forEach(encoding => {
						encoding.maxBitrate = maxBitrate;
					})
					sender.setParameters(params);
				}
			})    	
		}
		else if(peer.connectionState === 'failed') {
			console.log(`peer.connectionState='failed'. It should never reach here`)
		}
	})	
	peer.addEventListener('track', ({transceiver, receiver, streams: [stream], track}) => {
		console.log('Received a track !!!!. Stream: '+stream.id)	
		if(!streamIds.has(stream.id)) {
			const newVideo = document.createElement('video');
			newVideo.id = stream.id
			newVideo.autoplay = true;
			newVideo.srcObject = stream
			const container = document.getElementById('container');
			container.appendChild(newVideo);
			streamIds.add(stream.id)
		}	
	})
	return peer
}


// FUNCTIONS NOT NEEDED =========================================================

function updateBandwidthRestriction(sdp, media, bitrate) {
  var lines = sdp.split("\n");
  var line = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("m="+media) === 0) {
      line = i;
      break;
    }
  }
  if (line === -1) {
    console.debug("Could not find the m line for", media);
    return sdp;
  }
  console.debug("Found the m line for", media, "at line", line);
 
  // Pass the m line
  line++;
 
  // Skip i and c lines
  while(lines[line].indexOf("i=") === 0 || lines[line].indexOf("c=") === 0) {
    line++;
  }
 
  // If we're on a b line, replace it
  if (lines[line].indexOf("b") === 0) {
    console.debug("Replaced b line at line", line);
    lines[line] = "b=AS:"+bitrate;
    return lines.join("\n");
  }
  
  // Add a new b line
  console.debug("Adding new b line before line", line);
  var newLines = lines.slice(0, line)
  newLines.push("b=AS:"+bitrate)
  newLines = newLines.concat(lines.slice(line, lines.length))
  return newLines.join("\n")
}

function updateBandwidthRestriction2(sdp, media, bandwidth) {
  let modifier = 'AS';
  /*
  if (adapter.browserDetails.browser === 'firefox') {
    bandwidth = (bandwidth >>> 0) * 1000;
    modifier = 'TIAS';
  }
  */
  
  if (sdp.indexOf('b=' + modifier + ':') === -1) {
    // insert b= after c= line.
    sdp = sdp.replace(/c=IN (.*)\r\n/, 'c=IN $1\r\nb=' + modifier + ':' + bandwidth + '\r\n');
  } else {
    sdp = sdp.replace(new RegExp('b=' + modifier + ':.*\r\n'), 'b=' + modifier + ':' + bandwidth + '\r\n');
  }
  return sdp;
}

function removeBandwidthRestriction(sdp) {
  return sdp.replace(/b=AS:.*\r\n/, '').replace(/b=TIAS:.*\r\n/, '');
}