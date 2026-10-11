export interface Stats { kbps: number; fps: number; width: number; height: number; lost: number; rtt: number | null; limited: string | null }

export function makeStatsReader(pc: RTCPeerConnection) {
  let lastBytes = 0, lastT = 0;
  return async (): Promise<Stats> => {
    const out: Stats = { kbps: 0, fps: 0, width: 0, height: 0, lost: 0, rtt: null, limited: null };
    let bytes = 0, t = 0;
    (await pc.getStats()).forEach((r) => {
      if (r.type === "inbound-rtp" && r.kind === "video") {
        bytes = r.bytesReceived; t = r.timestamp; out.fps = r.framesPerSecond ?? 0;
        out.width = r.frameWidth ?? 0; out.height = r.frameHeight ?? 0; out.lost = r.packetsLost ?? 0;
      }
      if (r.type === "outbound-rtp" && r.kind === "video") {
        bytes = r.bytesSent; t = r.timestamp; out.fps = r.framesPerSecond ?? 0;
        out.width = r.frameWidth ?? 0; out.height = r.frameHeight ?? 0;
        out.limited = r.qualityLimitationReason && r.qualityLimitationReason !== "none" ? r.qualityLimitationReason : null;
      }
      if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated && r.currentRoundTripTime != null)
        out.rtt = r.currentRoundTripTime * 1000;
    });
    if (lastT && t > lastT) out.kbps = ((bytes - lastBytes) * 8) / (t - lastT); // bits/ms = kbit/s
    lastBytes = bytes; lastT = t;
    return out;
  };
}
