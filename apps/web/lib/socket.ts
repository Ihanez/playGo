import { io, type Socket } from "socket.io-client";
let socket: Socket | undefined;
export function getSocket() {
  socket ??= io(process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000", { autoConnect: false });
  return socket;
}
