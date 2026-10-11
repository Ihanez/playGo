import { EV, type Signal } from "@cinejuntos/shared";
import type { Socket } from "socket.io-client";

/** RTCPeerConnection con "perfect negotiation": tolera ofertas simultáneas y reinicia ICE si falla. */
export class Peer {
  readonly pc: RTCPeerConnection;
  private making = false;
  private ignore = false;

  constructor(
    private socket: Socket, iceServers: RTCIceServer[], private polite: boolean,
    onTrack: (s: MediaStream) => void, onState: (s: RTCPeerConnectionState) => void,
  ) {
    const pc = (this.pc = new RTCPeerConnection({ iceServers }));
    pc.ontrack = (e) => onTrack(e.streams[0] ?? new MediaStream([e.track]));
    pc.onicecandidate = (e) => e.candidate && this.send({ kind: "candidate", candidate: e.candidate.toJSON() } as Signal);
    pc.onnegotiationneeded = async () => {
      try {
        this.making = true;
        await pc.setLocalDescription();
        this.send({ kind: "description", description: pc.localDescription!.toJSON() } as Signal);
      } catch (e) { console.error("negociación", e); } finally { this.making = false; }
    };
    pc.onconnectionstatechange = () => onState(pc.connectionState);
    pc.oniceconnectionstatechange = () => { if (pc.iceConnectionState === "failed") pc.restartIce(); };
  }

  private send(m: Signal) { this.socket.emit(EV.SIGNAL, m); }

  async handle(m: Signal) {
    const pc = this.pc;
    try {
      if (m.kind === "description") {
        const d = m.description;
        const collision = d.type === "offer" && (this.making || pc.signalingState !== "stable");
        this.ignore = !this.polite && collision;
        if (this.ignore) return;
        await pc.setRemoteDescription(d);
        if (d.type === "offer") {
          await pc.setLocalDescription();
          this.send({ kind: "description", description: pc.localDescription!.toJSON() } as Signal);
        }
      } else {
        try { await pc.addIceCandidate(m.candidate); } catch (e) { if (!this.ignore) throw e; }
      }
    } catch (e) { console.error("señalización", e); }
  }

  close() { this.pc.close(); }
}
