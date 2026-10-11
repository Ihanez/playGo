import { createServer } from "node:http";
import { Server } from "socket.io";
import { EV, joinSchema, cmdSchema, fileInfoSchema } from "@cinejuntos/shared";
import { RoomManager, type Room } from "./rooms";

const PORT = Number(process.env.PORT ?? 4000);
const origins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((o) => o.trim());
const rooms = new RoomManager();
const http = createServer((req, res) => { res.writeHead(req.url === "/health" ? 200 : 404).end(); });
const io = new Server(http, { cors: { origin: origins } });

// Limitador por socket: máx. `max` eventos por `perMs`.
const limiter = (max: number, perMs: number) => {
  let n = max, t = Date.now();
  return () => { const now = Date.now(); n = Math.min(max, n + ((now - t) / perMs) * max); t = now; if (n < 1) return false; n--; return true; };
};
const broadcast = (room: Room) =>
  room.seats.forEach((s) => s.socketId && io.to(s.socketId).emit(EV.ROOM, rooms.view(room, s.id)));

io.on("connection", (socket) => {
  const allow = limiter(20, 1000);
  const createAllow = limiter(3, 60_000);

  socket.on(EV.PING, (ack) => typeof ack === "function" && ack(Date.now()));
  socket.on(EV.CREATE, (ack) => { if (typeof ack === "function" && createAllow()) ack(rooms.create()); });

  socket.on(EV.JOIN, (raw, ack) => {
    if (typeof ack !== "function" || !allow()) return;
    const p = joinSchema.safeParse(raw);
    if (!p.success) return ack({ ok: false, error: "INVALID" });
    const r = rooms.join(p.data.code, p.data.secret, p.data.name, socket.id, p.data.token);
    if (!r.ok) return ack(r);
    socket.data.code = p.data.code;
    socket.join(p.data.code);
    ack({ ok: true, token: r.seat.token });
    broadcast(r.room);
  });

  socket.on(EV.GET, (ack) => { if (typeof ack === "function") ack(rooms.get(socket.data.code)?.state ?? null); });

  socket.on(EV.CMD, (raw) => {
    const p = cmdSchema.safeParse(raw);
    if (!allow() || !p.success || !socket.data.code) return;
    const state = rooms.applyPlayback(socket.data.code, socket.id, p.data);
    if (state) io.to(socket.data.code).emit(EV.STATE, state);
  });

  socket.on(EV.FILE, (raw) => {
    const p = fileInfoSchema.safeParse(raw);
    if (!allow() || !p.success || !socket.data.code) return;
    const room = rooms.setFile(socket.data.code, socket.id, p.data);
    if (room) broadcast(room);
  });

  socket.on("disconnect", () => { const room = rooms.leave(socket.id); if (room) broadcast(room); });
});

setInterval(() => rooms.sweep(), 60_000).unref();
http.listen(PORT, () => console.log(`CineJuntos server en :${PORT}`));
