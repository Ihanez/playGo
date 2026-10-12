"use client";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { EV, type RoomView, type Signal } from "@cinejuntos/shared";
import { Peer } from "../lib/webrtc/peer";
import { makeStatsReader, type Stats } from "../lib/webrtc/stats";

const PRESETS = {
  estable: { label: "Estabilidad · 720p30", height: 720, fps: 30, bitrate: 2_500_000 },
  equilibrado: { label: "Equilibrado · 1080p30", height: 1080, fps: 30, bitrate: 5_000_000 },
  maxima: { label: "Máxima · 1080p60", height: 1080, fps: 60, bitrate: 8_000_000 },
} as const;
type PresetKey = keyof typeof PRESETS;

async function applyQuality(pc: RTCPeerConnection, key: PresetKey) {
  const p = PRESETS[key];
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    try { await sender.track.applyConstraints({ frameRate: p.fps, height: p.height }); } catch { /* la fuente puede no admitirlo */ }
    const params = sender.getParameters();
    params.encodings = params.encodings?.length ? params.encodings : [{}];
    params.encodings[0].maxBitrate = p.bitrate;
    params.encodings[0].maxFramerate = p.fps;
    (params as { degradationPreference?: string }).degradationPreference = key === "maxima" ? "balanced" : "maintain-framerate";
    try { await sender.setParameters(params); } catch { /* no soportado */ }
  }
}

export default function ScreenShare({ socket, room, iceServers }: { socket: Socket; room: RoomView; iceServers: RTCIceServer[] }) {
  const sharing = room.sharer === room.you;
  const remoteSharing = !!room.sharer && !sharing;
  const peer = useRef<Peer | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const roomRef = useRef(room); roomRef.current = room;
  const iceRef = useRef(iceServers); iceRef.current = iceServers;
  const [preset, setPreset] = useState<PresetKey>("equilibrado");
  const [conn, setConn] = useState("sin conexión");
  const [error, setError] = useState<string>();
  const [hasAudio, setHasAudio] = useState<boolean>();
  const [stats, setStats] = useState<Stats>();
  const [needPlay, setNeedPlay] = useState(false);

  const makePeer = () => {
    const r = roomRef.current;
    const other = r.seats.find((s) => s.id !== r.you);
    const polite = !!other && r.you < other.id;
    peer.current = new Peer(socket, iceRef.current, polite, (s) => {
      if (!video.current) return;
      video.current.srcObject = s;
      video.current.play().then(() => setNeedPlay(false), () => setNeedPlay(true));
    }, setConn);
    return peer.current;
  };
  const teardown = () => {
    peer.current?.close(); peer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setStats(undefined); setConn("sin conexión"); setNeedPlay(false);
  };

  useEffect(() => {
    const onSignal = (m: Signal) => {
      // Quien comparte YA tiene su peer y debe recibir la respuesta y los candidatos del otro.
      // Quien mira crea el peer al llegar la oferta (sin depender de que React ya haya
      // actualizado room.sharer, que puede ir un paso por detrás de la señal).
      const isOffer = m.kind === "description" && m.description.type === "offer";
      const p = peer.current ?? (isOffer ? makePeer() : null);
      p?.handle(m);
    };
    socket.on(EV.SIGNAL, onSignal);
    return () => { socket.off(EV.SIGNAL, onSignal); teardown(); };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!room.sharer && (peer.current || stream.current)) teardown(); }, [room.sharer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sharing && !remoteSharing) return;
    let pc: RTCPeerConnection | undefined, read: (() => Promise<Stats>) | undefined;
    const id = setInterval(async () => {
      const cur = peer.current?.pc;
      if (!cur) return;
      if (cur !== pc) { pc = cur; read = makeStatsReader(cur); }
      try { setStats(await read!()); } catch { /* conexión cerrada */ }
    }, 2000);
    return () => clearInterval(id);
  }, [sharing, remoteSharing]);

  async function start() {
    setError(undefined);
    if (!navigator.mediaDevices?.getDisplayMedia)
      return setError("Este navegador o dispositivo no puede compartir pantalla (los celulares solo pueden ver).");
    const p = PRESETS[preset];
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: p.fps }, height: { ideal: p.height } }, audio: true,
        ...({ systemAudio: "include" } as object),
      });
    } catch (e) {
      return setError((e as DOMException).name === "NotAllowedError" ? "Cancelaste o no diste permiso para compartir." : "No se pudo iniciar la captura.");
    }
    const ok = await new Promise<boolean>((res) => socket.emit(EV.SHARE, { on: true }, (r: { ok: boolean }) => res(r.ok)));
    if (!ok) { s.getTracks().forEach((t) => t.stop()); return setError("Ya hay alguien compartiendo o la sala no está lista."); }
    stream.current = s; setHasAudio(s.getAudioTracks().length > 0);
    const v = s.getVideoTracks()[0]; v.contentHint = "motion"; v.onended = stop;
    const pr = makePeer();
    s.getTracks().forEach((t) => pr.pc.addTrack(t, s));
    applyQuality(pr.pc, preset);
  }
  function stop() { socket.emit(EV.SHARE, { on: false }, () => {}); teardown(); }
  function changePreset(k: PresetKey) { setPreset(k); if (peer.current && sharing) applyQuality(peer.current.pc, k); }

  const select = (
    <select value={preset} onChange={(e) => changePreset(e.target.value as PresetKey)} aria-label="Calidad"
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">
      {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
    </select>
  );

  return (
    <section className="mt-6">
      <div className="relative overflow-hidden rounded-xl border border-violet-500/30 bg-black shadow-[0_0_40px_-10px_#7c3aed]">
        <video ref={video} autoPlay playsInline controls className="aspect-video w-full" />
        {!remoteSharing && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-zinc-400">
            {sharing ? "Estás compartiendo tu pantalla." : "Nadie está compartiendo."}
          </p>
        )}
        {needPlay && (
          <button onClick={() => video.current?.play().then(() => setNeedPlay(false))}
            className="absolute inset-0 grid place-items-center bg-black/60 text-lg font-medium">▶ Toca para reproducir</button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {sharing ? (
          <button onClick={stop} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500">Dejar de compartir</button>
        ) : (
          <button onClick={start} disabled={remoteSharing || room.seats.length < 2}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-40">Compartir pantalla</button>
        )}
        {!remoteSharing && select}
        <span role="status" className="text-sm text-zinc-400">Conexión: {conn}</span>
      </div>
      {sharing && hasAudio === false && <p className="mt-3 text-sm text-amber-400">Se comparte sin audio. En Chrome/Edge de escritorio marca «compartir audio» al elegir la fuente (el audio del sistema completo solo en Windows).</p>}
      {stats && (
        <p className="mt-3 text-xs text-zinc-500">
          {stats.width}×{stats.height} · {stats.fps.toFixed(0)} fps · {stats.kbps.toFixed(0)} kbps
          {stats.rtt !== null && ` · RTT ${stats.rtt.toFixed(0)} ms`} · paquetes perdidos {stats.lost}
          {stats.limited && ` · limitado por ${stats.limited}`}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}
