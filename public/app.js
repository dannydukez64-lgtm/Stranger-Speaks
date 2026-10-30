const socket = io();
const $ = (id) => document.getElementById(id);
const gender = $("gender"), adult = $("adult"), continueBtn = $("continueBtn");
const startBtn = $("startBtn"), nextBtn = $("nextBtn"), endBtn = $("endBtn");
const micBtn = $("micBtn"), cameraBtn = $("cameraBtn"), reportBtn = $("reportBtn");
const statusEl = $("status"), localVideo = $("localVideo"), remoteVideo = $("remoteVideo");
const localPlaceholder = $("localPlaceholder"), remotePlaceholder = $("remotePlaceholder");
const messages = $("messages"), chatForm = $("chatForm"), messageInput = $("messageInput"), sendBtn = $("sendBtn");

let localStream = null, peer = null, peerId = null, profileReady = false, active = false;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function setStatus(s){statusEl.textContent=s}
function addMessage(s,kind="them"){const p=document.createElement("p");p.textContent=kind==="you"?`You: ${s}`:kind==="system"?s:`Stranger: ${s}`;if(kind==="system")p.className="system-message";messages.appendChild(p);messages.scrollTop=messages.scrollHeight}
function clearMessages(){messages.replaceChildren();addMessage("You are not connected yet.","system")}
function updateChat(connected){messageInput.disabled=!connected;sendBtn.disabled=!connected;reportBtn.disabled=!connected}
function closePeer(){if(peer){peer.onicecandidate=null;peer.ontrack=null;peer.close()}peer=null;peerId=null;remoteVideo.srcObject=null;remotePlaceholder.style.display="flex";updateChat(false)}
async function ensureMedia(){if(localStream)return;if(!navigator.mediaDevices?.getUserMedia)throw Error("Camera needs HTTPS or localhost and a supported browser.");localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});localVideo.srcObject=localStream;localPlaceholder.style.display="none";micBtn.disabled=false;cameraBtn.disabled=false}
function createPeer(){peer=new RTCPeerConnection(rtcConfig);localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));peer.ontrack=e=>{remoteVideo.srcObject=e.streams[0];remotePlaceholder.style.display="none"};peer.onicecandidate=e=>{if(e.candidate&&peerId)socket.emit("signal",{to:peerId,data:{candidate:e.candidate}})}}
async function matched({peerId:id,initiator}){closePeer();peerId=id;createPeer();setStatus("Match found! Connecting...");updateChat(true);if(initiator){const offer=await peer.createOffer();await peer.setLocalDescription(offer);socket.emit("signal",{to:peerId,data:{description:peer.localDescription}})}}
continueBtn.addEventListener("click",()=>{if(!gender.value||!adult.checked){setStatus("Select your gender and confirm you are 18+.");return}socket.emit("set-profile",{gender:gender.value,adultConfirmed:true})});
socket.on("profile-ready",()=>{profileReady=true;$("setup").style.display="none";startBtn.disabled=false;setStatus("You're ready. Start your free chat.")});
socket.on("profile-error",m=>setStatus(m));
socket.on("waiting",()=>setStatus("Searching across India for an opposite-gender match..."));
socket.on("matched",data=>matched(data).catch(e=>{console.error(e);setStatus("Could not connect. Tap Next to retry.")}));
socket.on("signal",async({data})=>{if(!peer)return;try{if(data.description){await peer.setRemoteDescription(data.description);if(data.description.type==="offer"){const answer=await peer.createAnswer();await peer.setLocalDescription(answer);socket.emit("signal",{to:peerId,data:{description:peer.localDescription}})}}else if(data.candidate)await peer.addIceCandidate(data.candidate)}catch(e){console.error(e)}});
socket.on("partner-left",()=>{closePeer();setStatus("The other person left. Tap Next to find another match.");addMessage("The other person disconnected.","system");active=true;nextBtn.disabled=false;endBtn.disabled=false;startBtn.disabled=true});
socket.on("chat-message",m=>addMessage(m));
socket.on("report-received",()=>{closePeer();active=false;setStatus("Report received. Chat ended.");nextBtn.disabled=true;endBtn.disabled=true;startBtn.disabled=false});
startBtn.addEventListener("click",async()=>{try{if(!profileReady)return;await ensureMedia();active=true;clearMessages();setStatus("Joining free chat...");socket.emit("find-partner");startBtn.disabled=true;nextBtn.disabled=false;endBtn.disabled=false}catch(e){setStatus(e.message)}});
nextBtn.addEventListener("click",()=>{closePeer();clearMessages();setStatus("Finding another opposite-gender user...");socket.emit("next-partner")});
endBtn.addEventListener("click",()=>{socket.emit("next-partner");closePeer();active=false;setStatus("Call ended. Start another chat whenever you're ready.");nextBtn.disabled=true;endBtn.disabled=true;startBtn.disabled=false});
micBtn.addEventListener("click",()=>{const t=localStream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;micBtn.textContent=t.enabled?"Mute mic":"Unmute mic"}});
cameraBtn.addEventListener("click",()=>{const t=localStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;cameraBtn.textContent=t.enabled?"Turn camera off":"Turn camera on"}});
reportBtn.addEventListener("click",()=>{if(confirm("Report this person and end the chat?"))socket.emit("report-user")});
chatForm.addEventListener("submit",e=>{e.preventDefault();const m=messageInput.value.trim();if(m&&peerId){addMessage(m,"you");socket.emit("chat-message",m);messageInput.value=""}});
socket.on("disconnect",()=>setStatus("Connection lost. Refresh to reconnect."));
clearMessages();
