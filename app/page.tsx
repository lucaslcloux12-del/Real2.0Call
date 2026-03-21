"use client";
import { useState, useEffect } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [senha, setSenha] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const router = useRouter();

  useEffect(() => {
    onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const loginGoogle = () => signInWithPopup(auth, googleProvider);

  const criarChamada = async () => {
    if (!user) return alert("Faça login primeiro");
    const docRef = doc(db, "approved_creators", user.email!);
    const aprovado = await getDoc(docRef);

    if (user.email !== "lucaslcloux12@gmail.com" && !aprovado.exists()) {
      setShowModal(true);
      return;
    }

    const roomId = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2,6).toUpperCase()).join("-");
    await setDoc(doc(db, "rooms", roomId), { creator: user.email, admins: [user.email] });
    router.push(`/call/${roomId}`);
  };

  const entrarComCodigo = () => {
    if (joinCode.length >= 8) router.push(`/call/${joinCode.toUpperCase().replace(/-/g, '')}`);
    else alert("Código inválido (ex: ABCD-EFGH)");
  };

  const autorizar = async () => {
    if (senha === "753951") {
      await setDoc(doc(db, "approved_creators", user.email!), { approved: true });
      alert("✅ Autorizado! Agora você pode criar chamadas pra sempre.");
      setShowModal(false);
    } else alert("Senha incorreta");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-black flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-8xl font-black tracking-tighter bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-4">2.0 CALL</h1>
      <p className="text-2xl text-zinc-400 mb-12">Reuniões futuristas. Mais bonito que o Meet.</p>

      {!user ? (
        <button onClick={loginGoogle} className="bg-white text-black px-14 py-6 rounded-3xl text-2xl font-medium">Entrar com Google</button>
      ) : (
        <>
          <p className="mb-8 text-xl">Olá, {user.email}</p>
          <button onClick={criarChamada} className="bg-blue-600 hover:bg-blue-500 px-14 py-6 rounded-3xl text-2xl mb-8">Nova Chamada</button>

          <div className="max-w-md w-full">
            <p className="text-zinc-400 mb-3">Ou digite o código da chamada:</p>
            <div className="flex gap-3">
              <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="ABCD-EFGH" className="flex-1 bg-zinc-900 border border-zinc-700 p-6 rounded-3xl text-2xl text-center focus:border-blue-500" />
              <button onClick={entrarComCodigo} className="bg-zinc-800 hover:bg-zinc-700 px-10 rounded-3xl">Entrar</button>
            </div>
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-10 rounded-3xl w-full max-w-sm">
            <h2 className="text-3xl mb-8 text-center">Autorização necessária</h2>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} className="w-full bg-black p-6 rounded-2xl text-3xl text-center tracking-widest" placeholder="••••••••" />
            <button onClick={autorizar} className="mt-8 w-full bg-gradient-to-r from-blue-600 to-cyan-500 py-6 rounded-3xl text-2xl">Confirmar</button>
          </div>
        </div>
      )}
    </div>
  );
}
