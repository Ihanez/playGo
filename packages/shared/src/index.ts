import { z } from "zod";

export const MAX_PARTICIPANTS = 2;
export const SYNC = { DEADZONE: 0.2, SEEK_THRESHOLD: 2, RATE_NUDGE: 0.05 };
export const EV = {
  CREATE: "room:create", JOIN: "room:join", ROOM: "room:update",
  CMD: "playback:cmd", GET: "playback:get", STATE: "playback:state",
  FILE: "file:info", PING: "time:ping", SIGNAL: "webrtc:signal", SHARE: "share:set",
} as const;

export const joinSchema = z.object({
  code: z.string().regex(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/),
  secret: z.string().regex(/^[0-9a-f]{32}$/),
  name: z.string().trim().min(1).max(24),
  token: z.string().max(64).optional(),
});
export const cmdSchema = z.object({
  action: z.enum(["play", "pause", "seek", "rate"]),
  mediaTime: z.number().min(0).max(1_000_000),
  rate: z.number().min(0.25).max(2).default(1),
});
export const fileInfoSchema = z.object({
  name: z.string().max(200),
  size: z.number().int().nonnegative(),
  duration: z.number().nonnegative(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});

export type FileInfo = z.infer<typeof fileInfoSchema>;
export type PlaybackCmd = z.infer<typeof cmdSchema>;
export interface PlaybackState { seq: number; playing: boolean; mediaTime: number; rate: number; serverTime: number }
export interface RoomView {
  code: string; you: string; match: boolean | null; sharer: string | null;
  seats: { id: string; name: string; connected: boolean; hasFile: boolean }[];
}

export const signalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("description"), description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(100_000) }) }),
  z.object({ kind: z.literal("candidate"), candidate: z.object({
    candidate: z.string().max(2000), sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().int().nullable().optional(), usernameFragment: z.string().nullable().optional() }) }),
]);
export type Signal = z.infer<typeof signalSchema>;
export const shareSchema = z.object({ on: z.boolean() });
