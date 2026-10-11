import { describe, it, expect } from "vitest";
import { RoomManager } from "../src/rooms";

const setup = () => { const m = new RoomManager(); return { m, ...m.create() }; };
const file = (fp: string) => ({ name: "a.mp4", size: 10, duration: 100, fingerprint: fp.repeat(64).slice(0, 64) });

describe("RoomManager", () => {
  it("admite dos participantes y rechaza el tercero", () => {
    const { m, code, secret } = setup();
    expect(m.join(code, secret, "A", "s1").ok).toBe(true);
    expect(m.join(code, secret, "B", "s2").ok).toBe(true);
    expect(m.join(code, secret, "C", "s3")).toEqual({ ok: false, error: "FULL" });
  });
  it("rechaza secreto incorrecto y sala inexistente", () => {
    const { m, code } = setup();
    expect(m.join(code, "0".repeat(32), "A", "s1")).toEqual({ ok: false, error: "BAD_SECRET" });
    expect(m.join("AAA-AAA", "0".repeat(32), "A", "s1")).toEqual({ ok: false, error: "NOT_FOUND" });
  });
  it("reconecta con token sin ocupar otro asiento", () => {
    const { m, code, secret } = setup();
    const a = m.join(code, secret, "A", "s1"); m.join(code, secret, "B", "s2");
    if (!a.ok) throw new Error();
    m.leave("s1");
    const again = m.join(code, secret, "A", "s9", a.seat.token);
    expect(again.ok && again.seat.id).toBe(a.seat.id);
    expect(m.get(code)!.seats).toHaveLength(2);
  });
  it("libera asientos desconectados tras el periodo de gracia", () => {
    const { m, code, secret } = setup();
    m.join(code, secret, "A", "s1"); m.join(code, secret, "B", "s2");
    m.leave("s1", 1000);
    expect(m.join(code, secret, "C", "s3", undefined, 1000 + 130_000).ok).toBe(true);
  });
  it("aplica comandos de reproducción e incrementa seq", () => {
    const { m, code, secret } = setup();
    m.join(code, secret, "A", "s1");
    const s = m.applyPlayback(code, "s1", { action: "play", mediaTime: 5, rate: 1 }, 5000)!;
    expect(s).toMatchObject({ playing: true, mediaTime: 5, serverTime: 5000, seq: 1 });
    expect(m.applyPlayback(code, "intruso", { action: "pause", mediaTime: 6, rate: 1 })).toBeUndefined();
  });
  it("compara los archivos de ambos participantes", () => {
    const { m, code, secret } = setup();
    const a = m.join(code, secret, "A", "s1"); m.join(code, secret, "B", "s2");
    if (!a.ok) throw new Error();
    m.setFile(code, "s1", file("a"));
    expect(m.view(m.get(code)!, a.seat.id).match).toBeNull();
    m.setFile(code, "s2", file("a"));
    expect(m.view(m.get(code)!, a.seat.id).match).toBe(true);
    m.setFile(code, "s2", file("b"));
    expect(m.view(m.get(code)!, a.seat.id).match).toBe(false);
  });
});

describe("compartir pantalla y señalización", () => {
  it("permite un solo sharer y lo libera al desconectarse", () => {
    const { m, code, secret } = setup();
    const a = m.join(code, secret, "A", "s1"); const b = m.join(code, secret, "B", "s2");
    if (!a.ok || !b.ok) throw new Error();
    expect(m.setSharer(code, "s1", true)?.sharer).toBe(a.seat.id);
    expect(m.setSharer(code, "s2", true)).toBeUndefined();
    expect(m.setSharer(code, "s2", false)?.sharer).toBe(a.seat.id);
    m.leave("s1");
    expect(m.get(code)!.sharer).toBeNull();
    expect(m.setSharer(code, "s2", true)?.sharer).toBe(b.seat.id);
  });
  it("la señalización solo llega al otro participante de la misma sala", () => {
    const { m, code, secret } = setup();
    m.join(code, secret, "A", "s1"); m.join(code, secret, "B", "s2");
    expect(m.peerSocket(code, "s1")).toBe("s2");
    expect(m.peerSocket(code, "intruso")).toBeUndefined();
    m.leave("s2");
    expect(m.peerSocket(code, "s1")).toBeUndefined();
  });
});
