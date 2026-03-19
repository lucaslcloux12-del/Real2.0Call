"use client";
import { useState, useEffect } from "react";
import { auth, googleProvider } from "../lib/firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { db } from "../lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [senha, setSenha] = useState("");
  const router = useRouter();

  useEffect(() => {
    onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const loginGoogle = () => signInWithPopup(auth, googleProvider);

  const criarChamada = async () => {
    if (!user) return;

    const docRef = doc(db, "approved_creators", user.email!);
    const aprovado = await getDoc(docRef);

    if (user.email !== "lucaslcloux12@gmail.com" && !aprovado.exists()) {
      setShowModal(true);
      return;
    }

    const roomId = uuidv4();
    await setDoc(doc(db, "rooms", roomId), {
      creator: user.email,
      admins: [user.email],
      participants: [],
      createdAt: new Date().toISOString(),
    });

    router.push(`/call/${roomId}`);
  };

  const autorizar = () => {
    if (senha === "753951") {
      alert("✅ Senha OK! Agora vá no Firebase Console → Firestore → crie a coleção 'approved_creators' e adicione o documento com o ID sendo o email da conta que você quer liberar. (Depois posso te ajudar a fazer email automático com Cloud Function)");
      setShowModal(false);
    } else {
      alert("Senha errada! Use 753951");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-7xl font-bold tracking-tighter mb-3">2.0 Call</h1>
      <p className="text-2xl text-zinc-400 mb-12">Reuniões em tempo real. Mais nítido, mais seguro, só seu.</p>

      {!user ? (
        <button onClick={loginGoogle} className="bg-white text-black px-10 py-5 rounded-2xl text-xl font-medium hover:bg-zinc-100 transition-all">
          Entrar com Google (login só uma vez)
        </button>
      ) : (
        <>
          <p className="mb-8 text-xl">Olá, {user.email} 👋</p>
          <button onClick={criarChamada} className="bg-blue-600 hover:bg-blue-700 px-12 py-6 rounded-2xl text-2xl font-medium transition-all">
            Nova Chamada
          </button>
          <button onClick={() => signOut(auth)} className="mt-8 text-zinc-500 underline">Sair</button>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-10 rounded-3xl w-full max-w-md">
            <h2 className="text-3xl mb-6">Autorização necessária</h2>
            <p className="mb-4 text-zinc-400">Digite a senha para criar chamadas:</p>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full bg-zinc-800 p-5 rounded-2xl text-lg mb-6" placeholder="753951" />
            <button onClick={autorizar} className="w-full bg-green-600 py-5 rounded-2xl text-xl hover:bg-green-700">Confirmar</button>
          </div>
        </div>
      )}
    </div>
  );
}
