"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EV } from "@cinejuntos/shared";
import { getSocket } from "../lib/socket";

export default function Home() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function create() {
    const socket = getSocket();
    setBusy(true); setError(undefined);
    const timer = setTimeout(() => { setBusy(false); setError("No se pudo conectar con el servidor."); }, 6000);
    const go = () => socket.emit(EV.CREATE, (r: { code: string; secret: string }) => {
      clearTimeout(timer); router.push(`/room/${r.code}#${r.secret}`);
    });
    socket.connected ? go() : (socket.once("connect", go), socket.connect());
  }
  function enter() {
    try { const u = new URL(link.trim()); router.push(u.pathname + u.hash); }
    catch { setError("Pega el enlace completo de la sala."); }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Cine<span className="text-violet-400">Juntos</span></h1>
      <p className="mt-3 text-sm text-zinc-400">Salas privadas para dos personas.</p>
      <button onClick={create} disabled={busy} className="mt-10 w-full rounded-lg bg-violet-600 py-3 font-medium hover:bg-violet-500 disabled:opacity-50">
        {busy ? "Creando…" : "Crear sala"}
      </button>
      <div className="mt-6 flex gap-2">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Pega el enlace de una sala"
          aria-label="Enlace de la sala" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
        <button onClick={enter} disabled={!link} className="rounded-lg border border-violet-500 px-4 text-sm disabled:opacity-40">Entrar</button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </main>
  );
}
