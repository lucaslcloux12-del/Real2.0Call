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
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const router = useRouter();

  useEffect(() => {
    onAuthStateChanged(auth, (u) => { if (!u) router.push("/"); setUser(u); });

    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }).then(stream => {
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
    });

    // Multi-pessoa signaling melhorado
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnection.current = pc;

    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));

    pc.ontrack = e => { if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0]; };

    const signalingRef = ref(realtimeDB, `rooms/${id}/signaling`);
    onValue(signalingRef, snap => {
      const data = snap.val();
      if (!data || !pc) return;
      if (data.offer) pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      if (data.answer) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      if (data.ice) pc.addIceCandidate(new RTCIceCandidate(data.ice));
    });

    pc.onicecandidate = e => { if (e.candidate) set(ref(realtimeDB, `rooms/${id}/signaling/ice`), e.candidate); };

    setTimeout(() => {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        set(ref(realtimeDB, `rooms/${id}/signaling/offer`), offer);
      });
    }, 1000);

  }, [id, router]);

  const shareScreen = async () => {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const sender = peerConnection.current?.getSenders().find(s => s.track?.kind === "video");
    if (sender) sender.replaceTrack(screen.getVideoTracks()[0]);
  };

  const toggleMic = () => { const t = localStream.current?.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; setMicOn(!micOn); };
  const toggleCam = () => { const t = localStream.current?.getVideoTracks()[0]; if (t) t.enabled = !t.enabled; setCamOn(!camOn); };

  return (
    <div className="h-screen bg-gradient-to-br from-zinc-950 to-black flex flex-col">
      <header className="p-4 bg-zinc-900/90 flex justify-between">
        <h1 className="text-3xl font-bold text-blue-400">2.0 Call • {id}</h1>
        <button onClick={() => { navigator.clipboard.writeText(window.location.href); alert("Link copiado!"); }} className="bg-zinc-800 px-6 py-3 rounded-2xl flex gap-2"><Copy /> Copiar</button>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
        <div className="relative rounded-3xl overflow-hidden bg-black">
          {camOn ? <video ref={localVideo} autoPlay muted className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><img src={user?.photoURL} className="w-52 h-52 rounded-full border-4 border-blue-500" /></div>}
          <div className="absolute bottom-6 left-6 flex gap-3 bg-black/70 px-6 py-3 rounded-2xl">
            <span>Você</span>
            {!micOn && <MicOff className="text-red-500" />}
            {isSpeaking && <div className="w-4 h-4 bg-green-400 rounded-full animate-ping" />}
          </div>
        </div>

        <div className="relative rounded-3xl overflow-hidden bg-black">
          <video ref={remoteVideo} autoPlay className="w-full h-full object-cover" />
        </div>
      </div>

      <div className="p-6 bg-zinc-900/95 flex justify-center gap-8">
        <button onClick={toggleMic} className="p-5 bg-zinc-800 rounded-3xl">{micOn ? <Mic size={36} /> : <MicOff size={36} className="text-red-500" />}</button>
        <button onClick={toggleCam} className="p-5 bg-zinc-800 rounded-3xl">{camOn ? <Video size={36} /> : <VideoOff size={36} className="text-red-500" />}</button>
        <button onClick={shareScreen} className="p-5 bg-blue-600 rounded-3xl"><Monitor size={36} /></button>
      </div>
    </div>
  );
}
