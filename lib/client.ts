"use client";

import { io, type Socket } from "socket.io-client";
import { uid } from "./slides";

let socket: Socket | undefined;

export function getSocket() {
  socket ??= io();
  return socket;
}

/** Emits an event and resolves with the server's ack, throwing on `{ error }`. */
export async function call<T = { ok: true }>(event: string, payload: object = {}): Promise<T> {
  const res = (await getSocket().timeout(10_000).emitWithAck(event, payload)) as T | { error: string };
  if (res && typeof res === "object" && "error" in res) throw new Error(res.error);
  return res as T;
}

/** Runs `fn` now and after every reconnect, since rooms don't survive a reconnect. */
export function onConnect(fn: () => void) {
  const s = getSocket();
  s.on("connect", fn);
  if (s.connected) fn();
  return () => {
    s.off("connect", fn);
  };
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage disabled: the app still works for this page view.
  }
}

let memoryVoterId: string | undefined;

export function getVoterId() {
  let id = read<string | null>("lp:voter", null);
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    id = memoryVoterId ?? uid();
    write("lp:voter", id);
  }
  memoryVoterId = id;
  return id;
}

export interface SavedPresentation {
  id: string;
  title: string;
  code: string;
  token: string;
}

export const savedPresentations = () => read<SavedPresentation[]>("lp:presentations", []);

export function savePresentation(p: SavedPresentation) {
  write("lp:presentations", [p, ...savedPresentations().filter((x) => x.id !== p.id)]);
}

export function forgetPresentation(id: string) {
  write("lp:presentations", savedPresentations().filter((x) => x.id !== id));
}

export const tokenFor = (id: string) => savedPresentations().find((p) => p.id === id)?.token ?? null;

export const savedNickname = () => read<string>("lp:nickname", "");
export const saveNickname = (name: string) => write("lp:nickname", name);
