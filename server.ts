import { createServer } from "node:http";
import os from "node:os";
import next from "next";
import { Server, type Socket } from "socket.io";
import { resultsCsv, resultsFilename } from "./lib/export";
import { aggregate, byQaOrder, evaluate, publicSlide, quizWindow } from "./lib/logic";
import { LIMITS, defaultSlide, isQuiz, sanitizeSlide, sanitizeText } from "./lib/slides";
import * as store from "./lib/store";
import type {
  AudienceState,
  HostState,
  Pacing,
  PresentationSummary,
  QuizOutcome,
  QuizWindow,
  Results,
  SessionStatus,
  Slide,
} from "./lib/types";

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

// Where participants join: an explicit PUBLIC_URL, the host's own public URL, or this machine on the LAN.
const publicUrl = (
  process.env.PUBLIC_URL ??
  process.env.RENDER_EXTERNAL_URL ??
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
    presentation: {
      id: p.id,
      title: p.title,
      code: p.code,
      currentIndex: p.currentIndex,
      slides: p.slides,
      pacing: p.pacing,
      status: p.status,
      showResults: p.showResults,
    },
    results,
    quiz,
    leaderboard: store.leaderboard(p.id),
    participants: io.sockets.adapter.rooms.get(audienceRoom(p.id))?.size ?? 0,
    progress: store.progress(p.id),
    respondents: store.respondentsBySlide(p.id),
    joinUrl: `${publicUrl}/vote/${p.code}`,
    joinHost,
    serverNow: Date.now(),
  };
}

const currentSlide = (p: store.StoredPresentation): Slide | undefined =>
  p.slides[Math.min(p.currentIndex, p.slides.length - 1)];

const outcome = (score: number): QuizOutcome => ({ correct: score > 0, points: score });

function audienceState(p: store.StoredPresentation, voterId: string): AudienceState {
  const state: AudienceState = {
    title: p.title,
    status: p.status,
    pacing: p.pacing,
    slides: [],
    currentIndex: 0,
    total: p.slides.length,
    mine: {},
    quiz: {},
    quizResults: {},
    qa: {},
    name: store.voterName(p.id, voterId),
    serverNow: Date.now(),
  };
  if (p.status !== "open") return state;

  const current = currentSlide(p);
  const visible = p.pacing === "self" ? p.slides : current ? [current] : [];
  const answered = new Map(store.voterResponses(p.id, voterId).map((r) => [r.slideId, r]));
  for (const slide of visible) {
    const mine = answered.get(slide.id);
    state.mine[slide.id] = mine?.count ?? 0;
    if (slide.type === "qa") state.qa[slide.id] = store.qaQuestions(slide.id, voterId).sort(byQaOrder).slice(0, 100);
    if (!isQuiz(slide.type)) continue;
    // Self-paced quizzes show the outcome straight away; timed ones once the timer ends.
    if (p.pacing === "self") {
      if (mine) state.quizResults[slide.id] = outcome(mine.score);
      continue;
    }
    const window = quizWindow(slide, p.quizStartedAt[slide.id]);
    if (!window) continue;
    state.quiz[slide.id] = window;
    if (mine && Date.now() > window.endsAt) state.quizResults[slide.id] = outcome(mine.score);
  }
  state.slides = visible.map(publicSlide);
  if (current && p.pacing === "presenter") state.currentIndex = p.slides.indexOf(current);
  return state;
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

// Q&A questions and upvotes go to every phone, so those pushes are batched too.
const audienceTimers = new Map<string, NodeJS.Timeout>();
function pushAudienceSoon(id: string) {
  if (audienceTimers.has(id)) return;
  audienceTimers.set(
    id,
    setTimeout(() => {
      audienceTimers.delete(id);
      pushAudience(id);
    }, 150),
  );
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

const asPacing = (value: unknown): Pacing | undefined => (value === "self" || value === "presenter" ? value : undefined);
const asStatus = (value: unknown): SessionStatus | undefined =>
  value === "draft" || value === "open" || value === "closed" ? value : undefined;

/** The presentation this participant joined, if it's taking answers. */
function participant(socket: Socket) {
  const { presentationId, voterId } = socket.data as { presentationId?: string; voterId?: string };
  const p = presentationId && voterId ? store.getPresentation(presentationId) : null;
  if (!p || !voterId) throw new Error("Join a presentation first");
  if (p.status !== "open") throw new Error(p.status === "closed" ? "This session has ended" : "This session hasn't started yet");
  return { p, voterId };
}

/** A slide participants can answer right now: any slide when self-paced, otherwise the current one. */
function openSlide(p: store.StoredPresentation, slideId: unknown) {
  const slide = p.pacing === "self" ? p.slides.find((s) => s.id === slideId) : currentSlide(p);
  if (!slide || slide.id !== slideId) throw new Error("That question is no longer open");
  return slide;
}

function findSlide(p: store.StoredPresentation, slideId: unknown) {
  const slide = p.slides.find((s) => s.id === slideId);
  if (!slide) throw new Error("Slide not found");
  return slide;
}

io.on("connection", (socket) => {
  on(socket, "presentation:create", ({ title, pacing }) =>
    store.createPresentation(
      sanitizeText(title, LIMITS.title) || "Untitled presentation",
      asPacing(pacing) ?? "self",
      defaultSlide("multiple_choice"),
    ),
  );

  // The host dashboard lists presentations saved in this browser; check each still exists.
  on(socket, "host:summaries", ({ items }) =>
    (Array.isArray(items) ? items : []).slice(0, 100).map((item): PresentationSummary => {
      const { id, token } = (item ?? {}) as Record<string, unknown>;
      const p = typeof id === "string" ? store.getPresentation(id) : null;
      if (!p || p.token !== token) return { id: String(id), missing: true };
      return {
        id: p.id,
        title: p.title,
        code: p.code,
        status: p.status,
        pacing: p.pacing,
        slides: p.slides.length,
        started: store.progress(p.id).started,
      };
    }),
  );

  on(socket, "host:settings", (payload) => {
    const p = authorize(payload);
    store.updateSettings(p.id, {
      pacing: asPacing(payload.pacing),
      status: asStatus(payload.status),
      showResults: typeof payload.showResults === "boolean" ? payload.showResults : undefined,
    });
    refresh(p.id);
  });

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
    if (p.pacing === "self") throw new Error("Quizzes in a self-paced survey aren't timed");
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

  on(socket, "host:qaAnswered", (payload) => {
    const p = authorize(payload);
    const question = store.responseInfo(Number(payload.responseId));
    const slide = question && p.slides.find((s) => s.id === question.slideId);
    if (!question || slide?.type !== "qa") throw new Error("Question not found");
    store.setAnswered(question.id, payload.answered === true);
    pushHost(p.id);
    pushAudienceSoon(p.id);
  });

  on(socket, "host:export", (payload) => {
    const p = authorize(payload);
    return { filename: resultsFilename(p.title), csv: resultsCsv(p) };
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
    const { p, voterId } = participant(socket);
    const slide = openSlide(p, slideId);

    if (isQuiz(slide.type)) {
      const nickname = sanitizeText(name, LIMITS.nickname) || store.voterName(p.id, voterId);
      if (!nickname) throw new Error("Pick a nickname first");
      store.setVoterName(p.id, voterId, nickname);
    }

    const result = evaluate(slide, value, {
      mine: store.responsesByVoter(slide.id, voterId),
      window: quizWindow(slide, p.quizStartedAt[slide.id]),
      now: Date.now(),
      selfPaced: p.pacing === "self",
    });
    if ("error" in result) throw new Error(result.error);
    store.addResponse(slide.id, voterId, result.value, result.score, result.replace);
    pushHost(p.id);
    // Everyone sees everyone's Q&A questions.
    if (slide.type === "qa") pushAudienceSoon(p.id);
    return audienceState(p, voterId);
  });

  on(socket, "audience:upvote", ({ responseId }) => {
    const { p, voterId } = participant(socket);
    const question = store.responseInfo(Number(responseId));
    if (!question) throw new Error("That question was removed");
    const slide = openSlide(p, question.slideId);
    if (slide.type !== "qa") throw new Error("Only Q&A questions can be upvoted");
    if (question.voterId === voterId) throw new Error("You can't upvote your own question");
    store.toggleUpvote(question.id, voterId);
    pushHost(p.id);
    pushAudienceSoon(p.id);
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
