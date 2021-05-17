// Constants ===========================================================
const port=3000
const maxClientsPerRoom = 15
//const maxBitrate2 = 35
const peerConfig = {} //{'iceServers': [{urls: "stun:stun.l.google.com:19302"}]}		// No need to stun cause it is assumed the server is at public ip

// Express and Sockets Server ==========================================
const fs = require('fs')
const express = require('express')
const app = express()
const https = require('httpolyglot').createServer({
	key:  fs.readFileSync('key.pem',  'utf8'),
	cert: fs.readFileSync('cert.pem', 'utf8'),
}, function(req, res) {
	if (!req.socket.encrypted) {
		console.log(req.headers['host']);
		res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url })
		res.end()
	} else {		
		app.apply(app, arguments);
	}
});
const io = require('socket.io')(https)
https.listen(port, () => {
    console.log('listening https ' + port)
})
app.use('/', express.static(__dirname + '/public'))

const {RTCPeerConnection, RTCSessionDescription} = require('wrtc');		// Destructuring object

// Variables ===========================================================
let clients = new Map()		// peerId, socketId

// Sockets Messages ====================================================
io.on('connection', (socket) => {
	// First Join
	socket.on('join', async (userName, roomId) => {		
	    const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set()
	    const numberOfClients = roomClients.size	    
	    // These events are emitted only to the sender socket.
	    let joined
	    if (numberOfClients > maxClientsPerRoom) {	    	
	    	joined = false      
	    } else {	      
			joined = true
			if(clients.has(socket.id)) {
				socket.leave(roomId)
			}
			else {
				const client = newClient(userName, roomId, socket.id)
			}			
			socket.join(roomId)
	    }
	    
	    socket.emit('join_answer', {roomId:roomId, joined:joined, clients:numberOfClients})
	})
	
	socket.on('webrtc_offer', async (msg) => {		// Acting as remote responser
		const peer = clients.get(socket.id).peer
		const offer = new RTCSessionDescription(msg.offer)
		peer.setRemoteDescription(offer)
		const answer = await peer.createAnswer()
		//answer.sdp = updateBandwidthRestriction(answer.sdp, 'video', maxBitrate2)
		await peer.setLocalDescription(answer)
		
		socket.emit('webrtc_answer', {
			answer: answer,
		})
	})

	socket.on('webrtc_answer', (msg) => {			// Acting as offerer initiator
		const peer = clients.get(socket.id).peer;
		const answer = new RTCSessionDescription(msg.answer)		
		peer.setRemoteDescription(answer)
	})

	socket.on("disconnect", (reason) => {
		removeClient(socket.id)
  	})
  	socket.on("endScreen", (streamId) => {
  		console.log('endScreen')
		removeStream(streamId, socket.id)
  	})
})

// Peer Function ====================================================
async function newClient(userName, roomId, socketId) {    
    const peer = new RTCPeerConnection()

	peer.addEventListener('negotiationneeded', async (e) => {		
		// The negotiation should be carried out as the offerer. See: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onnegotiationneeded
		const offer = await peer.createOffer()		// Acting as offerer initiator
		//offer.sdp = updateBandwidthRestriction(offer.sdp, 'video', maxBitrate2)		// Not working !!!!!!!
		await peer.setLocalDescription(offer)

		io.to(socketId).emit('webrtc_offer', {
			offer: offer
		})
	})
	peer.addEventListener('icecandidate', (e) => {		
		io.to(socketId).emit('webrtc_icecandidate', {
			candidate: e.candidate
		})
	})
	peer.addEventListener('connectionstatechange', async (e) => {
		console.log(peer.connectionState)
			if (peer.connectionState === 'connected') {
				if (peer.connectionState === 'connected') {					

			}
			getExistingStreams(socketId)
		}
		else if(peer.connectionState === 'failed') {
			console.log(`peer.connectioState='failed'. It should never reach here`)
		}
	})	
	peer.addEventListener('track', ({transceiver, receiver, streams:[stream], track}) => {
		const in_streams = clients.get(socketId).in_streams
		if(!in_streams.find( mediaStream => mediaStream.id == stream.id )) {
			in_streams.push(stream)
			broadcastNewStream(stream, socketId)
		}
	})
	const client = { userName:userName, roomId:roomId, peer:peer, in_streams:[], out_streams:[] }
	clients.set(socketId, client)
	return client
}

// Rest of Functions ====================================================
function getExistingStreams(toSocketId) {
	const to_client = clients.get(toSocketId)
	clients.forEach( (client, socketId, map) => {
		if(socketId != toSocketId && client.roomId == to_client.roomId) {			
			client.in_streams.forEach( stream => {		// Each stream of each different client	
				if(!to_client.out_streams.find( mediaStream => mediaStream.id == stream.id )) {
					to_client.out_streams.push(stream)
					stream.getTracks().forEach( track => {
						to_client.peer.addTransceiver( track, {direction:'sendonly', streams:[stream]} )						
						//peer.addTrack(track, stream);		// addTrack() looks for unused transceivers to usurp) https://blog.mozilla.org/webrtc/rtcrtptransceiver-explored/
					})
				}
			})
		}
	})
}

function broadcastNewStream(stream, fromSocketId) {
	const from_client = clients.get(fromSocketId)
	clients.forEach( (client, socketId, map) => {
		if(socketId != fromSocketId && client.roomId == from_client.roomId) {
			const out_streams = client.out_streams
			if(!out_streams.find( mediaStream => mediaStream.id == stream.id )) {
				out_streams.push(stream)				
				stream.getTracks().forEach( track => {					
					client.peer.addTransceiver( track, {direction:'sendonly', streams:[stream]} )					
					//peer.addTrack(track, stream);		// addTrack() looks for unused transceivers to usurp) https://blog.mozilla.org/webrtc/rtcrtptransceiver-explored/
				})
			}	
		}
	})
}

function removeClient(socketId) {
	if(clients.has(socketId)) {
		const client_to_remove = clients.get(socketId)
		const roomId = client_to_remove.roomId
		const ids_to_remove = client_to_remove.in_streams.map( mediaStream => mediaStream.id)
		
		io.in(roomId).emit('webrtc_disconnection', ids_to_remove)
    	client_to_remove.peer.close()
		clients.delete(socketId)
		
		clients.forEach( client => {
			client.out_streams = client.out_streams.filter( mediaStream => !ids_to_remove.includes(mediaStream.id))
		})
	}
}

function removeStream(streamId, fromSocketId) {
	const ids_to_remove = [streamId]
	const from_client = clients.get(fromSocketId)
	const roomId = from_client.roomId
	// remove client.in_streams
	from_client.in_streams = from_client.in_streams.filter( mediaStream => mediaStream.id != streamId)
	
	clients.forEach( (client, socketId, map) => {
		if(socketId != fromSocketId && client.roomId == from_client.roomId) {			
			client.out_streams = client.out_streams.filter( mediaStream => mediaStream.id != streamId)
			io.to(socketId).emit('removeStream', ids_to_remove)
		}
	})
}


// Not working Functions for me ==========================================
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
