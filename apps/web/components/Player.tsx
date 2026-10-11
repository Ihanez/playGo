"use client";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { EV, SYNC, type PlaybackState } from "@cinejuntos/shared";
import { fingerprint } from "../lib/fingerprint";

export default function Player({ socket, match }: { socket: Socket; match: boolean | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const offset = useRef(0);                       // reloj servidor - reloj local (ms)
  const state = useRef<PlaybackState | null>(null);
  const quiet = useRef(0);                        // ignora eventos locales causados por nosotros
  const [src, setSrc] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const [drift, setDrift] = useState(0);

  const target = (s: PlaybackState) =>
    s.playing ? s.mediaTime + ((Date.now() + offset.current - s.serverTime) / 1000) * s.rate : s.mediaTime;

  const apply = (s: PlaybackState | null) => {
    const el = video.current;
    if (!s) return;
    state.current = s;
    if (!el || !el.src) return;
    quiet.current = Date.now() + 500;
    const t = target(s);
    if (!s.playing || Math.abs(el.currentTime - t) > SYNC.SEEK_THRESHOLD) el.currentTime = t;
    el.playbackRate = s.rate;
    if (s.playing) el.play().catch(() => setError("El navegador bloqueó la reproducción automática: pulsa play."));
    else el.pause();
  };

  useEffect(() => {
    const samples: number[] = [];
    const ping = () => {
      const t0 = Date.now();
      socket.emit(EV.PING, (srv: number) => {
        const t1 = Date.now();
        samples.push(srv - (t0 + (t1 - t0) / 2)); if (samples.length > 9) samples.shift();
        offset.current = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
      });
    };
    ping(); const t = setInterval(ping, 5000);
    const onState = (s: PlaybackState) => apply(s);
    socket.on(EV.STATE, onState);
    socket.emit(EV.GET, apply);
    const drifter = setInterval(() => {
      const el = video.current, s = state.current;
      if (!el || !s?.playing || el.paused) return;
      const d = el.currentTime - target(s); setDrift(d);
      quiet.current = Date.now() + 500;
      if (Math.abs(d) > SYNC.SEEK_THRESHOLD) el.currentTime = target(s);
      else if (Math.abs(d) > SYNC.DEADZONE) el.playbackRate = s.rate * (d > 0 ? 1 - SYNC.RATE_NUDGE : 1 + SYNC.RATE_NUDGE);
      else el.playbackRate = s.rate;
    }, 1000);
    return () => { clearInterval(t); clearInterval(drifter); socket.off(EV.STATE, onState); };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const send = (action: "play" | "pause" | "seek" | "rate") => {
    const el = video.current;
    if (!el || Date.now() < quiet.current) return;
    socket.emit(EV.CMD, { action, mediaTime: el.currentTime, rate: el.playbackRate });
  };

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(undefined); setFileName(file.name);
    setSrc(URL.createObjectURL(file));
    try {
      const fp = await fingerprint(file);
      const probe = document.createElement("video");
      const url = URL.createObjectURL(file); probe.preload = "metadata"; probe.src = url;
      probe.onloadedmetadata = () => {
        socket.emit(EV.FILE, { name: file.name, size: file.size, duration: probe.duration || 0, fingerprint: fp });
        URL.revokeObjectURL(url);
      };
      probe.onerror = () => URL.revokeObjectURL(url);
    } catch { setError("No se pudo calcular la huella del archivo (¿HTTPS?)."); }
  }

  const status = match === null ? "Esperando el archivo de ambos participantes."
    : match ? "Ambos tienen el mismo archivo." : "Los archivos NO coinciden: elijan el mismo.";

  return (
    <section className="mt-6">
      <div className="overflow-hidden rounded-xl border border-violet-500/30 bg-black shadow-[0_0_40px_-10px_#7c3aed]">
        <video ref={video} src={src} controls playsInline className="aspect-video w-full"
          onLoadedMetadata={() => apply(state.current)}
          onError={() => setError("Este archivo no es compatible con tu navegador (prueba MP4 H.264/AAC o WebM).")}
          onPlay={() => send("play")} onPause={() => send("pause")} onSeeked={() => send("seek")} onRateChange={() => send("rate")} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">
          Elegir archivo<input type="file" accept="video/*" onChange={pick} className="sr-only" />
        </label>
        <span className="truncate text-sm text-zinc-400">{fileName ?? "Ningún archivo"}</span>
        <span className={`text-sm ${match === false ? "text-red-400" : match ? "text-emerald-400" : "text-zinc-400"}`} role="status">{status}</span>
        <span className="ml-auto text-xs text-zinc-500">desfase: {drift.toFixed(2)} s</span>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}
