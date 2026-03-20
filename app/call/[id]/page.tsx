"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db, realtimeDB } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { ref, onValue, set, remove, push } from "firebase/database";
import { Mic, MicOff, Video, VideoOff, Monitor, MessageCircle, Users, LogOut } from "lucide-react";

export default function CallRoom() {
  const { id } = useParams();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const router = useRouter();

  // Login e stream local
  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/");
      setUser(u);
    });

    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
      .then((stream) => {
        localStream.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
      });

    // Verifica se é admin
    const roomRef = doc(db, "rooms", id as string);
    onSnapshot(roomRef, (snap) => {
      if (snap.exists()) setIsAdmin(snap.data().admins.includes(user?.email));
    });
  }, [id, user, router]);

  // WebRTC Signaling (1-to-1 funcional – troca offer/answer via Realtime DB)
  useEffect(() => {
    if (!user) return;

    const signalingRef = ref(realtimeDB, `rooms/${id}/signaling/${user.uid}`);

    // Escuta offers e answers
    onValue(ref(realtimeDB, `rooms/${id}/signaling`), (snapshot) => {
      const data = snapshot.val();
      if (!data || !peerConnection.current) return;

      if (data.offer && !peerConnection.current.remoteDescription) {
        peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        peerConnection.current.createAnswer().then(answer => {
          peerConnection.current!.setLocalDescription(answer);
          set(ref(realtimeDB, `rooms/${id}/signaling/${user.uid}/answer`), answer);
        });
      }

      if (data.answer && !peerConnection.current.remoteDescription) {
        peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }

      if (data.iceCandidate) {
        peerConnection.current.addIceCandidate(new RTCIceCandidate(data.iceCandidate));
      }
    });

    // Cria Peer Connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peerConnection.current = pc;

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current!));
    }

    pc.ontrack = (event) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        set(ref(realtimeDB, `rooms/${id}/signaling/${user.uid}/iceCandidate`), event.candidate);
      }
    };

    // Cria offer automaticamente (um cria, o outro responde)
    setTimeout(() => {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        set(ref(realtimeDB, `rooms/${id}/signaling/${user.uid}/offer`), offer);
      });
    }, 1500);

    return () => {
      pc.close();
      localStream.current?.getTracks().forEach(t => t.stop());
    };
  }, [id, user]);

  // Chat em tempo real (Firestore)
  // (adicione depois se quiser – por enquanto foco no vídeo)

  const toggleMic = () => {
    if (localStream.current) {
      const track = localStream.current.getAudioTracks()[0];
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  const toggleCam = () => {
    if (localStream.current) {
      const track = localStream.current.getVideoTracks()[0];
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };

  const shareScreen = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    if (peerConnection.current && screenStream.getTracks().length > 0) {
      peerConnection.current.getSenders().find(s => s.track?.kind === "video")?.replaceTrack(screenStream.getVideoTracks()[0]);
    }
  };

  const muteAll = () => {
    if (isAdmin) alert("Mute all enviado (em produção envia sinal para todos)");
  };

  return (
    <div className="h-screen bg-zinc-950 flex flex-col">
      <header className="bg-zinc-900 p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">2.0 Call • Sala {id}</h1>
        <div className="flex gap-4">
          {isAdmin && <button onClick={muteAll} className="bg-red-600 px-6 py-2 rounded-xl flex items-center gap-2"><Users size={20} /> Mute Todos</button>}
          <button onClick={() => router.push("/")} className="bg-zinc-800 px-6 py-2 rounded-xl flex items-center gap-2"><LogOut size={20} /> Sair</button>
        </div>
      </header>

      <div className="flex-1 video-grid">
        {/* Seu vídeo */}
        <div className="relative bg-black rounded-3xl overflow-hidden shadow-2xl">
          <video ref={localVideo} autoPlay muted playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-4 left-4 bg-black/70 px-4 py-1 rounded-full text-sm">Você</div>
        </div>

        {/* Vídeo da outra pessoa */}
        <div className="relative bg-black rounded-3xl overflow-hidden shadow-2xl">
          <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-4 left-4 bg-black/70 px-4 py-1 rounded-full text-sm">Outro participante</div>
        </div>
      </div>

      {/* Controles inferiores (igual ao Meet) */}
      <div className="bg-zinc-900 p-6 flex justify-center gap-8">
        <button onClick={toggleMic} className="p-5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition">
          {micOn ? <Mic size={32} /> : <MicOff size={32} className="text-red-500" />}
        </button>
        <button onClick={toggleCam} className="p-5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition">
          {camOn ? <Video size={32} /> : <VideoOff size={32} className="text-red-500" />}
        </button>
        <button onClick={shareScreen} className="p-5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition">
          <Monitor size={32} />
        </button>
        <button className="p-5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition">
          <MessageCircle size={32} />
        </button>
      </div>
    </div>
  );
}
