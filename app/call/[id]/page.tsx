"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db, realtimeDB } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { ref, onValue, set } from "firebase/database";
import { Mic, MicOff, Video, VideoOff, Monitor, MessageCircle, Copy, LogOut } from "lucide-react";

export default function CallRoom() {
  const { id } = useParams();
  const [user, setUser] = useState<any>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const router = useRouter();

  useEffect(() => {
    onAuthStateChanged(auth, (u) => { if (!u) router.push("/"); setUser(u); });

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
    });
  }, [router]);

  // WebRTC + renegociação pra tela
  useEffect(() => {
    if (!user) return;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnection.current = pc;

    localStream.current?.getTracks().forEach(track => pc.addTrack(track));

    pc.ontrack = (e) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
    };

    const signalingRef = ref(realtimeDB, `rooms/${id}/signaling`);
    onValue(signalingRef, (snap) => {
      const data = snap.val();
      if (!data) return;
      if (data.offer) pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      if (data.answer) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      if (data.ice) pc.addIceCandidate(new RTCIceCandidate(data.ice));
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) set(ref(realtimeDB, `rooms/${id}/signaling/ice`), e.candidate);
    };

    setTimeout(() => {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        set(ref(realtimeDB, `rooms/${id}/signaling/offer`), offer);
      });
    }, 800);

  }, [id, user]);

  const shareScreen = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    const sender = peerConnection.current?.getSenders().find(s => s.track?.kind === "video");
    if (sender) sender.replaceTrack(screenTrack);

    // Renegociação automática (isso faz a tela aparecer pro outro)
    peerConnection.current?.createOffer().then(offer => {
      peerConnection.current?.setLocalDescription(offer);
      set(ref(realtimeDB, `rooms/${id}/signaling/offer`), offer);
    });
  };

  const toggleMic = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
    setMicOn(!micOn);
  };

  const toggleCam = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) track.enabled = !track.enabled;
    setCamOn(!camOn);
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    // (chat via Firestore - adicione collection se quiser persistente)
    setMessages([...messages, { text: newMessage, user: user.email }]);
    setNewMessage("");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("✅ Link copiado! Compartilhe com quem quiser entrar.");
  };

  return (
    <div className="h-screen bg-gradient-to-br from-zinc-950 to-black flex flex-col">
      <header className="p-5 bg-zinc-900/90 flex justify-between">
        <h1 className="text-4xl font-black text-blue-400">2.0 CALL • {id}</h1>
        <button onClick={copyLink} className="bg-zinc-800 px-6 py-3 rounded-2xl flex gap-2"><Copy size={24} /> Copiar</button>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
        <div className="relative rounded-3xl overflow-hidden bg-black border border-blue-500">
          {camOn ? <video ref={localVideo} autoPlay muted className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full"><img src={user?.photoURL} className="w-52 h-52 rounded-full border-4 border-blue-500" /></div>}
          <div className="absolute bottom-6 left-6 bg-black/70 px-6 py-3 rounded-2xl flex gap-3">
            Você {!micOn && <MicOff className="text-red-500" />} {isSpeaking && <div className="w-5 h-5 bg-green-400 rounded-full animate-ping" />}
          </div>
        </div>

        <div className="relative rounded-3xl overflow-hidden bg-black border border-zinc-700">
          <video ref={remoteVideo} autoPlay className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Controles + Chat */}
      <div className="bg-zinc-900/95 p-6 flex justify-center gap-8">
        <button onClick={toggleMic} className="p-6 bg-zinc-800 rounded-3xl">{micOn ? <Mic size={36} /> : <MicOff size={36} className="text-red-500" />}</button>
        <button onClick={toggleCam} className="p-6 bg-zinc-800 rounded-3xl">{camOn ? <Video size={36} /> : <VideoOff size={36} className="text-red-500" />}</button>
        <button onClick={shareScreen} className="p-6 bg-blue-600 rounded-3xl"><Monitor size={36} /></button>
        <button onClick={() => setShowChat(!showChat)} className="p-6 bg-zinc-800 rounded-3xl"><MessageCircle size={36} /></button>
      </div>

      {showChat && (
        <div className="absolute right-0 top-16 bottom-0 w-96 bg-zinc-900/95 border-l border-blue-500 p-6 flex flex-col">
          <div className="flex-1 overflow-y-auto mb-4 space-y-3">
            {messages.map((m, i) => <div key={i} className="bg-zinc-800 p-4 rounded-2xl"><span className="text-blue-400">{m.user}</span>: {m.text}</div>)}
          </div>
          <div className="flex gap-3">
            <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} className="flex-1 bg-zinc-800 p-5 rounded-3xl" placeholder="Digite uma mensagem..." />
            <button onClick={sendMessage} className="bg-blue-600 px-8 rounded-3xl">Enviar</button>
          </div>
        </div>
      )}
    </div>
  );
}
