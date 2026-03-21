"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db, realtimeDB } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, collection, addDoc, onSnapshot as chatSnapshot } from "firebase/firestore";
import { ref, onValue, set } from "firebase/database";
import { Mic, MicOff, Video, VideoOff, Monitor, MessageCircle, Users, LogOut, Copy } from "lucide-react";

export default function CallRoom() {
  const { id } = useParams();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [showChat, setShowChat] = useState(false);

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const router = useRouter();

  // Login + stream + admin
  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/");
      setUser(u);
    });

    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }).then(stream => {
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;

      // Detecção de fala
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.current.createMediaStreamSource(stream);
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 256;
      source.connect(analyser.current);

      setInterval(() => {
        if (!analyser.current) return;
        const data = new Uint8Array(analyser.current.frequencyBinCount);
        analyser.current.getByteFrequencyData(data);
        const volume = data.reduce((a, b) => a + b) / data.length;
        setIsSpeaking(volume > 25);
      }, 200);
    });

    const roomRef = doc(db, "rooms", id as string);
    onSnapshot(roomRef, (snap) => {
      if (snap.exists()) setIsAdmin(snap.data().admins.includes(user?.email));
    });

    // Chat em tempo real
    const chatRef = collection(db, "rooms", id as string, "chat");
    chatSnapshot(chatRef, (snap) => {
      setMessages(snap.docs.map(d => d.data()));
    });
  }, [id, user, router]);

  // WebRTC melhorado + screen share real
  useEffect(() => {
    if (!user) return;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnection.current = pc;

    localStream.current?.getTracks().forEach(track => pc.addTrack(track, localStream.current!));

    pc.ontrack = (e) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
    };

    // Signaling
    const signalingRef = ref(realtimeDB, `rooms/${id}/signaling`);
    onValue(signalingRef, (snap) => {
      const data = snap.val();
      if (!data || !pc) return;
      if (data.offer) pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      if (data.answer) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      if (data.ice) pc.addIceCandidate(new RTCIceCandidate(data.ice));
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) set(ref(realtimeDB, `rooms/${id}/signaling/ice`), e.candidate);
    };

    setTimeout(() => pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      set(ref(realtimeDB, `rooms/${id}/signaling/offer`), offer);
    }), 800);

    return () => pc.close();
  }, [id, user]);

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

  const shareScreen = async () => {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const videoTrack = screen.getVideoTracks()[0];
    const sender = peerConnection.current?.getSenders().find(s => s.track?.kind === "video");
    if (sender) sender.replaceTrack(videoTrack);
  };

  const sendMessage = async () => {
    if (!newMessage) return;
    await addDoc(collection(db, "rooms", id as string, "chat"), {
      text: newMessage,
      user: user.email,
      time: new Date().toISOString(),
    });
    setNewMessage("");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("✅ Link copiado!");
  };

  return (
    <div className="h-screen bg-gradient-to-br from-zinc-950 to-black flex flex-col overflow-hidden">
      {/* Header futurista */}
      <header className="bg-zinc-900/90 backdrop-blur-xl p-4 flex items-center justify-between border-b border-blue-500/20">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-blue-400">2.0 Call</h1>
          <span className="text-sm text-zinc-400">Sala {id}</span>
        </div>
        <div className="flex gap-4">
          <button onClick={copyLink} className="bg-zinc-800 hover:bg-zinc-700 px-6 py-3 rounded-2xl flex items-center gap-2"><Copy size={20} /> Copiar link</button>
          <button onClick={() => router.push("/")} className="bg-red-600/80 hover:bg-red-600 px-6 py-3 rounded-2xl">Sair</button>
        </div>
      </header>

      {/* Grid de vídeos */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-8 video-grid">
        {/* Seu vídeo */}
        <div className="relative rounded-3xl overflow-hidden bg-black shadow-2xl border border-blue-500/30">
          {camOn ? (
            <video ref={localVideo} autoPlay muted playsInline className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-950">
              <img src={user?.photoURL} className="w-48 h-48 rounded-full border-4 border-blue-500" alt="Você" />
            </div>
          )}
          <div className="absolute bottom-6 left-6 bg-black/70 px-5 py-2 rounded-2xl flex items-center gap-3">
            <span>Você</span>
            {!micOn && <MicOff size={22} className="text-red-500" />}
            {isSpeaking && <div className="w-4 h-4 bg-green-400 rounded-full animate-pulse" />}
          </div>
        </div>

        {/* Vídeo remoto */}
        <div className="relative rounded-3xl overflow-hidden bg-black shadow-2xl border border-blue-500/30">
          <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Barra de controles futurista */}
      <div className="bg-zinc-900/95 backdrop-blur-2xl p-6 flex justify-center gap-8 border-t border-blue-500/20">
        <button onClick={toggleMic} className="p-6 bg-zinc-800 hover:bg-zinc-700 rounded-3xl transition-all">{micOn ? <Mic size={36} /> : <MicOff size={36} className="text-red-500" />}</button>
        <button onClick={toggleCam} className="p-6 bg-zinc-800 hover:bg-zinc-700 rounded-3xl transition-all">{camOn ? <Video size={36} /> : <VideoOff size={36} className="text-red-500" />}</button>
        <button onClick={shareScreen} className="p-6 bg-blue-600 hover:bg-blue-500 rounded-3xl transition-all"><Monitor size={36} /></button>
        <button onClick={() => setShowChat(!showChat)} className="p-6 bg-zinc-800 hover:bg-zinc-700 rounded-3xl transition-all"><MessageCircle size={36} /></button>
      </div>

      {/* Chat lateral */}
      {showChat && (
        <div className="absolute right-0 top-16 bottom-0 w-96 bg-zinc-900/95 backdrop-blur-xl border-l border-blue-500/30 p-6 flex flex-col">
          <div className="flex-1 overflow-y-auto mb-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className="bg-zinc-800 p-4 rounded-2xl">
                <span className="text-blue-400 text-sm">{m.user}</span>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyPress={e => e.key === "Enter" && sendMessage()} className="flex-1 bg-zinc-800 p-5 rounded-3xl" placeholder="Digite uma mensagem..." />
            <button onClick={sendMessage} className="bg-blue-600 px-8 rounded-3xl">Enviar</button>
          </div>
        </div>
      )}
    </div>
  );
}
