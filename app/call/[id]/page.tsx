"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db, realtimeDB } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { ref, onValue, set } from "firebase/database";
import { Mic, MicOff, Video, VideoOff, Monitor, Copy, LogOut } from "lucide-react";

export default function CallRoom() {
  const { id } = useParams();
  const [user, setUser] = useState<any>(null);
  const [streams, setStreams] = useState<Map<string, MediaStream>>(new Map());
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const router = useRouter();

  // Login + stream local
  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/");
      setUser(u);
    });

    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }).then(stream => {
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
    });
  }, [router]);

  // Mesh WebRTC (multi-user real)
  useEffect(() => {
    if (!user) return;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "turn:turn.cloudflare.com:3478", username: "user", credential: "pass" }] });
    peers.current.set(user.uid, pc);

    localStream.current?.getTracks().forEach(track => pc.addTrack(track, localStream.current!));

    pc.ontrack = (e) => {
      setStreams(prev => new Map(prev).set(e.streams[0].id, e.streams[0]));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) set(ref(realtimeDB, `rooms/${id}/signaling/${user.uid}/ice`), e.candidate);
    };

    // Signaling mesh
    const signalingRef = ref(realtimeDB, `rooms/${id}/signaling`);
    onValue(signalingRef, (snap) => {
      const data = snap.val();
      if (!data) return;

      Object.keys(data).forEach(peerId => {
        if (peerId === user.uid) return;
        const peerData = data[peerId];
        if (peerData.offer && !pc.remoteDescription) {
          pc.setRemoteDescription(new RTCSessionDescription(peerData.offer)).then(() => pc.createAnswer().then(answer => {
            pc.setLocalDescription(answer);
            set(ref(realtimeDB, `rooms/${id}/signaling/${user.uid}/answer`), answer);
          }));
        }
        if (peerData.answer) pc.setRemoteDescription(new RTCSessionDescription(peerData.answer));
        if (peerData.ice) pc.addIceCandidate(new RTCIceCandidate(peerData.ice));
      });
    });

    // Cria offer inicial
    setTimeout(() => pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      set(ref(realtimeDB, `rooms/${id}/signaling/${user.uid}/offer`), offer);
    }), 1200);

    return () => peers.current.forEach(p => p.close());
  }, [id, user]);

  const shareScreen = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    peers.current.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(screenTrack);
    });

    // Renegociação automática pra todo mundo ver a tela
    peers.current.forEach(pc => pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      set(ref(realtimeDB, `rooms/${id}/signaling/${user.uid}/offer`), offer);
    }));
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

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("✅ Link/código copiado! Compartilhe com quem quiser entrar.");
  };

  return (
    <div className="h-screen bg-gradient-to-br from-zinc-950 to-black flex flex-col">
      <header className="p-5 bg-zinc-900/90 backdrop-blur flex justify-between items-center border-b border-blue-500/30">
        <h1 className="text-4xl font-black text-blue-400">2.0 CALL • {id}</h1>
        <button onClick={copyLink} className="bg-zinc-800 hover:bg-blue-600 px-8 py-3 rounded-3xl flex items-center gap-3"><Copy size={24} /> Copiar link/código</button>
      </header>

      <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-auto">
        {/* Seu vídeo */}
        <div className="relative rounded-3xl overflow-hidden bg-black border-2 border-blue-500 shadow-2xl">
          {camOn ? (
            <video ref={localVideo} autoPlay muted className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-950">
              <img src={user?.photoURL || "https://i.imgur.com/0fXz9zD.png"} className="w-52 h-52 rounded-full border-4 border-blue-500" />
            </div>
          )}
          <div className="absolute bottom-6 left-6 bg-black/70 px-6 py-3 rounded-2xl flex items-center gap-3 text-lg">
            Você
            {!micOn && <MicOff className="text-red-500" />}
            {isSpeaking && <div className="w-5 h-5 bg-green-400 rounded-full animate-ping" />}
          </div>
        </div>

        {/* Vídeos dos outros (multi-user) */}
        {Array.from(streams.values()).map((stream, i) => (
          <div key={i} className="relative rounded-3xl overflow-hidden bg-black border-2 border-zinc-700 shadow-2xl">
            <video autoPlay playsInline srcObject={stream} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>

      {/* Controles futuristas */}
      <div className="bg-zinc-900/95 backdrop-blur-2xl p-6 flex justify-center gap-8">
        <button onClick={toggleMic} className="p-6 bg-zinc-800 hover:bg-zinc-700 rounded-3xl transition">{micOn ? <Mic size={40} /> : <MicOff size={40} className="text-red-500" />}</button>
        <button onClick={toggleCam} className="p-6 bg-zinc-800 hover:bg-zinc-700 rounded-3xl transition">{camOn ? <Video size={40} /> : <VideoOff size={40} className="text-red-500" />}</button>
        <button onClick={shareScreen} className="p-6 bg-blue-600 hover:bg-blue-500 rounded-3xl transition text-white"><Monitor size={40} /></button>
        <button onClick={() => router.push("/")} className="p-6 bg-red-600/80 hover:bg-red-600 rounded-3xl"><LogOut size={40} /></button>
      </div>
    </div>
  );
}
