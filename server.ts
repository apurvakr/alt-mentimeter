import { createServer } from "node:http";
import os from "node:os";
import next from "next";
import { Server, type Socket } from "socket.io";
import { aggregate, evaluate, publicSlide, quizWindow } from "./lib/logic";
import { LIMITS, defaultSlide, isQuiz, sanitizeSlide, sanitizeText } from "./lib/slides";
import * as store from "./lib/store";
import type { AudienceState, HostState, QuizWindow, Results, Slide } from "./lib/types";

const dev = !process.argv.includes("--prod");
const port = Number(process.env.PORT) || 3000;

function lanAddress() {
  return Object.values(os.networkInterfaces())
    .flat()
    .find((a) => a && a.family === "IPv4" && !a.internal)?.address;
}

const app = next({ dev });
const handle = app.getRequestHandler();
await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(httpServer);

// Where participants join: an explicit PUBLIC_URL, Railway's generated domain, or this machine on the LAN.
const publicUrl = (
  process.env.PUBLIC_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://${lanAddress() ?? "localhost"}:${port}`)
).replace(/\/+$/, "");
const joinHost = publicUrl.replace(/^https?:\/\//, "");

const hostRoom = (id: string) => `host:${id}`;
const audienceRoom = (id: string) => `audience:${id}`;

function hostState(p: store.StoredPresentation): HostState {
  const results: Record<string, Results> = {};
  const quiz: Record<string, QuizWindow> = {};
  for (const slide of p.slides) {
    results[slide.id] = aggregate(slide, store.responsesFor(slide.id));
    const window = quizWindow(slide, p.quizStartedAt[slide.id]);
    if (window) quiz[slide.id] = window;
  }
  return {
    presentation: { id: p.id, title: p.title, code: p.code, currentIndex: p.currentIndex, slides: p.slides },
    results,
    quiz,
    leaderboard: store.leaderboard(p.id),
    participants: io.sockets.adapter.rooms.get(audienceRoom(p.id))?.size ?? 0,
    joinUrl: `${publicUrl}/vote/${p.code}`,
    joinHost,
    serverNow: Date.now(),
  };
}

const currentSlide = (p: store.StoredPresentation): Slide | undefined =>
  p.slides[Math.min(p.currentIndex, p.slides.length - 1)];

function audienceState(p: store.StoredPresentation, voterId: string): AudienceState {
  const slide = currentSlide(p);
  const base = { title: p.title, total: p.slides.length, name: store.voterName(p.id, voterId), serverNow: Date.now() };
  if (!slide) return { ...base, index: 0, slide: null, mine: 0, quiz: null, quizResult: null };

  const mine = store.responsesByVoter(slide.id, voterId);
  const window = isQuiz(slide.type) ? quizWindow(slide, p.quizStartedAt[slide.id]) : null;
  const ended = window !== null && Date.now() > window.endsAt;
  return {
    ...base,
    index: p.slides.indexOf(slide),
    slide: publicSlide(slide),
    mine: mine.length,
    quiz: window,
    quizResult: ended && mine.length ? { correct: mine[0].score > 0, points: mine[0].score } : null,
  };
}

// Votes can arrive in bursts, so presenter updates are batched.
const hostTimers = new Map<string, NodeJS.Timeout>();
function pushHost(id: string) {
  if (hostTimers.has(id)) return;
  hostTimers.set(
    id,
    setTimeout(() => {
      hostTimers.delete(id);
      const p = store.getPresentation(id);
      if (p) io.to(hostRoom(id)).emit("host:state", hostState(p));
    }, 150),
  );
}

/** Each participant gets their own state, since it includes what they've already answered. */
function pushAudience(id: string) {
  const p = store.getPresentation(id);
  if (!p) return;
  for (const socketId of io.sockets.adapter.rooms.get(audienceRoom(id)) ?? []) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.emit("audience:state", audienceState(p, socket.data.voterId));
  }
}

function refresh(id: string) {
  pushHost(id);
  pushAudience(id);
}

const quizTimers = new Map<string, NodeJS.Timeout>();

type Payload = Record<string, unknown>;

function on(socket: Socket, event: string, fn: (payload: Payload) => unknown) {
  socket.on(event, (payload: unknown, ack?: (response: unknown) => void) => {
    try {
      const result = fn(payload && typeof payload === "object" ? (payload as Payload) : {});
      ack?.(result ?? { ok: true });
    } catch (e) {
      ack?.({ error: e instanceof Error ? e.message : "Something went wrong" });
    }
  });
}

function authorize(payload: Payload) {
  const p = store.getPresentation(String(payload.id));
  if (!p || p.token !== payload.token) throw new Error("You don't have access to this presentation");
  return p;
}

function findSlide(p: store.StoredPresentation, slideId: unknown) {
  const slide = p.slides.find((s) => s.id === slideId);
  if (!slide) throw new Error("Slide not found");
  return slide;
}

io.on("connection", (socket) => {
  on(socket, "presentation:create", ({ title }) =>
    store.createPresentation(sanitizeText(title, LIMITS.title) || "Untitled presentation", defaultSlide("multiple_choice")),
  );

  on(socket, "host:join", (payload) => {
    const p = authorize(payload);
    socket.join(hostRoom(p.id));
    return hostState(p);
  });

  on(socket, "host:save", (payload) => {
    const p = authorize(payload);
    const slides = (Array.isArray(payload.slides) ? payload.slides : [])
      .slice(0, LIMITS.maxSlides)
      .map(sanitizeSlide)
      .filter((s): s is Slide => s !== null);
    store.saveSlides(p.id, sanitizeText(payload.title, LIMITS.title) || "Untitled presentation", slides);
    refresh(p.id);
  });

  on(socket, "host:goto", (payload) => {
    const p = authorize(payload);
    const index = Number(payload.index);
    if (!Number.isInteger(index) || index < 0 || index >= p.slides.length) throw new Error("No such slide");
    store.setCurrentIndex(p.id, index);
    refresh(p.id);
  });

  on(socket, "host:startQuiz", (payload) => {
    const p = authorize(payload);
    const slide = findSlide(p, payload.slideId);
    if (!isQuiz(slide.type)) throw new Error("Only quiz slides have a timer");
    const now = Date.now();
    store.startQuiz(slide.id, now);
    clearTimeout(quizTimers.get(slide.id));
    // Tell everyone when time runs out so phones show the result.
    const { endsAt } = quizWindow(slide, now)!;
    quizTimers.set(slide.id, setTimeout(() => refresh(p.id), endsAt - now + 1100));
    refresh(p.id);
  });

  on(socket, "host:reset", (payload) => {
    const p = authorize(payload);
    const slide = findSlide(p, payload.slideId);
    clearTimeout(quizTimers.get(slide.id));
    store.resetSlide(slide.id);
    refresh(p.id);
  });

  on(socket, "audience:join", ({ code, voterId }) => {
    const p = store.getPresentationByCode(String(code).replace(/\D/g, ""));
    if (!p) throw new Error("No presentation uses that code");
    if (typeof voterId !== "string" || !/^[a-f0-9]{32}$/.test(voterId)) throw new Error("Invalid participant id");
    socket.data.voterId = voterId;
    socket.data.presentationId = p.id;
    socket.join(audienceRoom(p.id));
    pushHost(p.id);
    return audienceState(p, voterId);
  });

  on(socket, "audience:respond", ({ slideId, value, name }) => {
    const { presentationId, voterId } = socket.data as { presentationId?: string; voterId?: string };
    const p = presentationId && voterId ? store.getPresentation(presentationId) : null;
    if (!p || !voterId) throw new Error("Join a presentation first");
    const slide = currentSlide(p);
    if (!slide || slide.id !== slideId) throw new Error("That question is no longer open");

    if (isQuiz(slide.type)) {
      const nickname = sanitizeText(name, LIMITS.nickname) || store.voterName(p.id, voterId);
      if (!nickname) throw new Error("Pick a nickname first");
      store.setVoterName(p.id, voterId, nickname);
    }

    const result = evaluate(slide, value, {
      mine: store.responsesByVoter(slide.id, voterId),
      window: quizWindow(slide, p.quizStartedAt[slide.id]),
      now: Date.now(),
    });
    if ("error" in result) throw new Error(result.error);
    store.addResponse(slide.id, voterId, result.value, result.score, result.replace);
    pushHost(p.id);
    return audienceState(p, voterId);
  });

  socket.on("disconnect", () => {
    if (socket.data.presentationId) pushHost(socket.data.presentationId);
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`> Live Poll ready on http://localhost:${port}`);
  console.log(`> Participants join at ${publicUrl}`);
});
