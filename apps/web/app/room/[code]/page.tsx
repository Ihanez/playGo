"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EV, type RoomView } from "@cinejuntos/shared";
import { getSocket } from "../../../lib/socket";
import Player from "../../../components/Player";

const MSG: Record<string, string> = {
  NOT_FOUND: "La sala no existe o expiró.", BAD_SECRET: "El enlace no es válido.",
  FULL: "La sala ya tiene dos participantes.", INVALID: "Datos no válidos.",
};

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const socket = getSocket();
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(true);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!started) return;
    const key = `cj-${code}`;
    const join = () => socket.emit(EV.JOIN,
      { code, secret: window.location.hash.slice(1), name, token: sessionStorage.getItem(key) ?? undefined },
      (res: { ok: boolean; token?: string; error?: string }) => {
        if (!res.ok) { setError(MSG[res.error ?? ""] ?? "No se pudo entrar."); setStarted(false); return; }
        sessionStorage.setItem(key, res.token!); setJoined(true); setConnected(true);
      });
    const onRoom = (r: RoomView) => setRoom(r);
    const onDown = () => setConnected(false);
    socket.on("connect", join); socket.on("disconnect", onDown); socket.on(EV.ROOM, onRoom);
    socket.connected ? join() : socket.connect();
    return () => { socket.off("connect", join); socket.off("disconnect", onDown); socket.off(EV.ROOM, onRoom); };
  }, [started]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!joined) {
    return (
      <main className="mx-auto max-w-sm px-6 py-24">
        <h1 className="text-2xl font-semibold">Sala <span className="text-violet-400">{code}</span></h1>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Tu nombre" aria-label="Tu nombre"
          className="mt-6 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" />
        <button onClick={() => { setError(undefined); setStarted(true); }} disabled={!name.trim() || started}
          className="mt-3 w-full rounded-lg bg-violet-600 py-2.5 font-medium disabled:opacity-50">
          {started ? "Entrando…" : "Entrar a la sala"}
        </button>
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Cine<span className="text-violet-400">Juntos</span> · {code}</h1>
        <ul className="flex gap-3 text-sm" aria-label="Participantes">
          {room?.seats.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1">
              <span className={`h-2 w-2 rounded-full ${s.connected ? "bg-emerald-400" : "bg-zinc-500"}`} />
              {s.name}{s.id === room.you && " (tú)"}
            </li>
          ))}
        </ul>
      </header>
      {!connected && <p role="status" className="mt-3 text-sm text-amber-400">Reconectando con el servidor…</p>}
      {room && room.seats.length < 2 && <p className="mt-3 text-sm text-zinc-400">Comparte el enlace de esta página con la otra persona.</p>}
      <Player socket={socket} match={room?.match ?? null} />
    </main>
  );
}
