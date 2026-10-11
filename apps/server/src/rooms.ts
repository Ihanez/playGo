import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { MAX_PARTICIPANTS, type FileInfo, type PlaybackCmd, type PlaybackState, type RoomView } from "@cinejuntos/shared";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const hash = (s: string) => createHash("sha256").update(s).digest();
const rnd = (n: number) => Array.from(randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join("");
const SEAT_GRACE_MS = 120_000;
const ROOM_TTL_MS = 600_000;

export interface Seat { id: string; name: string; token: string; socketId: string | null; leftAt: number; file?: FileInfo }
export interface Room { code: string; secretHash: Buffer; seats: Seat[]; state: PlaybackState; lastActive: number; sharer: string | null }
export type JoinResult =
  | { ok: true; room: Room; seat: Seat }
  | { ok: false; error: "NOT_FOUND" | "BAD_SECRET" | "FULL" };

export class RoomManager {
  private rooms = new Map<string, Room>();

  create() {
    let code: string;
    do code = `${rnd(3)}-${rnd(3)}`; while (this.rooms.has(code));
    const secret = randomBytes(16).toString("hex");
    const now = Date.now();
    this.rooms.set(code, {
      code, secretHash: hash(secret), seats: [], lastActive: now, sharer: null,
      state: { seq: 0, playing: false, mediaTime: 0, rate: 1, serverTime: now },
    });
    return { code, secret };
  }

  get(code: string) { return this.rooms.get(code); }

  join(code: string, secret: string, name: string, socketId: string, token?: string, now = Date.now()): JoinResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "NOT_FOUND" };
    if (!timingSafeEqual(room.secretHash, hash(secret))) return { ok: false, error: "BAD_SECRET" };
    room.seats = room.seats.filter((s) => s.socketId || now - s.leftAt < SEAT_GRACE_MS);
    room.lastActive = now;
    const mine = token ? room.seats.find((s) => s.token === token) : undefined;
    if (mine) { mine.socketId = socketId; mine.name = name; return { ok: true, room, seat: mine }; }
    if (room.seats.length >= MAX_PARTICIPANTS) return { ok: false, error: "FULL" };
    const seat: Seat = { id: randomBytes(6).toString("hex"), name, token: randomBytes(24).toString("hex"), socketId, leftAt: 0 };
    room.seats.push(seat);
    return { ok: true, room, seat };
  }

  leave(socketId: string, now = Date.now()) {
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s.socketId === socketId);
      if (seat) { if (room.sharer === seat.id) room.sharer = null; seat.socketId = null; seat.leftAt = now; room.lastActive = now; return room; }
    }
  }

  setFile(code: string, socketId: string, file: FileInfo) {
    const room = this.rooms.get(code);
    const seat = room?.seats.find((s) => s.socketId === socketId);
    if (!room || !seat) return undefined;
    seat.file = file;
    return room;
  }

  applyPlayback(code: string, socketId: string, cmd: PlaybackCmd, now = Date.now()) {
    const room = this.rooms.get(code);
    if (!room || !room.seats.some((s) => s.socketId === socketId)) return undefined;
    const s = room.state;
    if (cmd.action === "play") s.playing = true;
    if (cmd.action === "pause") s.playing = false;
    if (cmd.action === "rate") s.rate = cmd.rate;
    s.mediaTime = cmd.mediaTime; s.serverTime = now; s.seq++;
    room.lastActive = now;
    return { ...s };
  }

  /** Solo una persona comparte a la vez. Devuelve undefined si no es posible. */
  setSharer(code: string, socketId: string, on: boolean) {
    const room = this.rooms.get(code);
    const seat = room?.seats.find((s) => s.socketId === socketId);
    if (!room || !seat) return undefined;
    if (on) { if (room.sharer && room.sharer !== seat.id) return undefined; room.sharer = seat.id; }
    else if (room.sharer === seat.id) room.sharer = null;
    return room;
  }

  /** Socket del otro participante conectado (destino de la señalización). */
  peerSocket(code: string, socketId: string) {
    const room = this.rooms.get(code);
    if (!room?.seats.some((s) => s.socketId === socketId)) return undefined;
    return room.seats.find((s) => s.socketId && s.socketId !== socketId)?.socketId ?? undefined;
  }

  view(room: Room, seatId: string): RoomView {
    const [a, b] = room.seats.map((s) => s.file);
    const match = a && b ? a.fingerprint === b.fingerprint && Math.abs(a.duration - b.duration) < 1 : null;
    return {
      code: room.code, you: seatId, match, sharer: room.sharer,
      seats: room.seats.map((s) => ({ id: s.id, name: s.name, connected: !!s.socketId, hasFile: !!s.file })),
    };
  }

  sweep(now = Date.now()) {
    for (const [code, r] of this.rooms)
      if (!r.seats.some((s) => s.socketId) && now - r.lastActive > ROOM_TTL_MS) this.rooms.delete(code);
  }
}
