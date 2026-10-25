"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Leaderboard, Results } from "@/components/Results";
import { Button, ErrorText, StatusPill } from "@/components/ui";
import { useNow } from "@/components/useNow";
import { call, downloadResults, errorMessage, getSocket, onConnect, tokenFor } from "@/lib/client";
import { optionColor, optionLabel, optionLetter } from "@/lib/palette";
import { formatCode, isQuiz, slideLabel } from "@/lib/slides";
import type { HostState } from "@/lib/types";

type Send = (event: string, extra?: object) => void;

export default function PresentPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<HostState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // Which question the self-paced results view is showing; local to this screen.
  const [resultIndex, setResultIndex] = useState(0);

  useEffect(() => setToken(tokenFor(id)), [id]);

  useEffect(() => {
    if (!token) return;
    const apply = (s: HostState) => {
      setOffset(s.serverNow - Date.now());
      setState(s);
    };
    const join = () =>
      call<HostState>("host:join", { id, token })
        .then(apply)
        .catch((e) => setError(errorMessage(e)));
    const socket = getSocket();
    socket.on("host:state", apply);
    const stop = onConnect(join);
    return () => {
      socket.off("host:state", apply);
      stop();
    };
  }, [id, token]);

  const send: Send = useCallback(
    (event, extra = {}) => {
      setError("");
      call(event, { id, token, ...extra }).catch((e) => setError(errorMessage(e)));
    },
    [id, token],
  );

  const p = state?.presentation;
  const count = p?.slides.length ?? 0;
  const selfResults = p?.pacing === "self" && p.showResults;
  // Arrow keys step through questions (presenter-paced) or through the results view (self-paced).
  const position = p ? (selfResults ? Math.min(resultIndex, count - 1) : p.currentIndex) : 0;
  const steppable = Boolean(p && p.status !== "draft" && (p.pacing === "presenter" || selfResults));
  const go = useCallback(
    (to: number) => {
      if (!p || to < 0 || to >= count) return;
      if (p.pacing === "presenter") send("host:goto", { index: to });
      else setResultIndex(to);
    },
    [p, count, send],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "f") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
        return;
      }
      if (!steppable) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(position + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(position - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steppable, go, position]);

  if (token === null) {
    return (
      <Stage>
        <div className="m-auto max-w-md text-center">
          <h1 className="font-display text-3xl font-extrabold">This browser can&apos;t present it</h1>
          <p className="mt-3 text-lg text-haze">Open the presenter screen from the browser you used to create the presentation.</p>
          <Link href="/host" className="mt-8 inline-flex rounded-full bg-marigold px-6 py-3 font-bold text-night">
            Go to the dashboard
          </Link>
        </div>
      </Stage>
    );
  }

  if (!state || !p) {
    return (
      <Stage>
        <div className="m-auto text-haze">{error ? <ErrorText onNight>{error}</ErrorText> : "Loading…"}</div>
      </Stage>
    );
  }

  let body: ReactNode;
  if (p.status === "draft") body = <ReadyToPublish state={state} onPublish={() => send("host:settings", { status: "open" })} />;
  else if (p.pacing === "self") body = p.showResults ? <ResultsView state={state} index={position} send={send} /> : <Progress state={state} />;
  else body = <LiveQuestion state={state} offset={offset} send={send} />;

  const slide = p.slides[position];
  const results = slide ? state.results[slide.id] : undefined;
  const quizWindow = slide ? state.quiz[slide.id] : undefined;

  return (
    <Stage>
      <JoinBar state={state} />
      <section className="flex min-h-0 flex-1 flex-col px-6 py-7 sm:px-12">{body}</section>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-night-line px-6 py-3">
        <div className="flex items-center gap-2">
          {steppable && (
            <>
              <Button variant="onNight" disabled={position <= 0} onClick={() => go(position - 1)}>
                Previous
              </Button>
              <span className="w-16 text-center text-sm tabular-nums text-haze">
                {count ? position + 1 : 0} of {count}
              </span>
              <Button variant="onNight" disabled={position >= count - 1} onClick={() => go(position + 1)}>
                Next
              </Button>
            </>
          )}
        </div>
        <ErrorText onNight>{error}</ErrorText>
        <div className="flex flex-wrap items-center gap-2">
          {p.status !== "draft" && (
            <Button variant={p.showResults ? "onNight" : "primary"} onClick={() => send("host:settings", { showResults: !p.showResults })}>
              {p.showResults ? "Hide results" : "Show results"}
            </Button>
          )}
          {p.pacing === "presenter" && slide && isQuiz(slide.type) && quizWindow && (
            <Button variant="onNight" onClick={() => send("host:startQuiz", { slideId: slide.id })}>
              Restart question
            </Button>
          )}
          {p.pacing === "presenter" && slide && results && results.total > 0 && (
            <Button variant="onNight" onClick={() => send("host:reset", { slideId: slide.id })}>
              Clear answers
            </Button>
          )}
          {count > 0 && (
            <Button
              variant="onNight"
              onClick={() => {
                setError("");
                downloadResults(id, token).catch((e) => setError(errorMessage(e)));
              }}
            >
              Download CSV
            </Button>
          )}
          {p.status === "open" && (
            <Button variant="onNight" onClick={() => send("host:settings", { status: "closed" })}>
              Close voting
            </Button>
          )}
          {p.status === "closed" && (
            <Button variant="onNight" onClick={() => send("host:settings", { status: "open" })}>
              Reopen voting
            </Button>
          )}
          <Link href={`/edit/${id}`} className="rounded-full px-4 py-2.5 text-sm font-bold text-haze hover:text-white">
            Edit
          </Link>
        </div>
      </footer>
    </Stage>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return <main className="flex h-dvh flex-col bg-night text-white [color-scheme:dark]">{children}</main>;
}

function JoinBar({ state }: { state: HostState }) {
  const { presentation: p } = state;
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-night-line px-6 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-lg text-haze">
          Join at <strong className="text-white">{state.joinHost}</strong> with code
        </p>
        <p className="whitespace-nowrap font-display text-4xl font-extrabold tracking-[0.12em] text-marigold tabular-nums">{formatCode(p.code)}</p>
      </div>
      <div className="flex items-center gap-4">
        <StatusPill status={p.status} onNight />
        <p className="text-sm text-haze">
          {state.participants} {state.participants === 1 ? "phone" : "phones"} connected
        </p>
        <div className="rounded-lg bg-white p-1.5">
          <QRCodeSVG value={state.joinUrl} size={52} aria-label={`QR code for ${state.joinUrl}`} />
        </div>
      </div>
    </header>
  );
}

function ReadyToPublish({ state, onPublish }: { state: HostState; onPublish: () => void }) {
  const { slides, pacing, title } = state.presentation;
  const n = `${slides.length} ${slides.length === 1 ? "question" : "questions"}`;
  return (
    <div className="m-auto max-w-2xl text-center">
      <p className="text-xl text-haze">{title}</p>
      <h1 className="mt-2 font-display text-6xl font-extrabold tracking-tight">Ready when you are</h1>
      <p className="mx-auto mt-5 max-w-xl text-xl text-haze">
        {pacing === "self"
          ? `Publishing sends all ${n} to everyone who joins. They answer at their own pace while you watch the responses come in.`
          : `Publishing lets people join. You then reveal the ${n} one at a time from this screen.`}
      </p>
      <Button className="mt-10 px-10 py-4 text-lg" onClick={onPublish} disabled={!slides.length}>
        Publish
      </Button>
      {!slides.length && <p className="mt-4 text-haze">Add a question in the editor first.</p>}
    </div>
  );
}

/** Self-paced, results hidden: who's joined and how far along everyone is. */
function Progress({ state }: { state: HostState }) {
  const { presentation: p, progress, respondents } = state;
  return (
    <div className="grid min-h-0 flex-1 gap-12 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center justify-center gap-6 text-center lg:items-start lg:text-left">
        <div className="rounded-3xl bg-white p-4">
          <QRCodeSVG value={state.joinUrl} size={230} aria-label={`QR code for ${state.joinUrl}`} />
        </div>
        <p className="max-w-xs text-xl text-haze">
          Scan the code, or go to <strong className="text-white">{state.joinHost}</strong> and enter{" "}
          <strong className="whitespace-nowrap text-marigold">{formatCode(p.code)}</strong>
        </p>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex flex-wrap gap-x-14 gap-y-4">
          <Count value={progress.started} label={progress.started === 1 ? "person has started" : "people have started"} />
          <Count value={progress.completed} label="finished every question" />
        </div>
        <h2 className="mt-10 text-lg font-bold text-haze">People who answered each question</h2>
        <ol className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
          {p.slides.map((s, i) => {
            const n = respondents[s.id] ?? 0;
            const pct = progress.started ? Math.min(100, (n / progress.started) * 100) : 0;
            return (
              <li key={s.id} className="grid grid-cols-[2rem_1fr_3rem] items-center gap-4">
                <span className="font-display text-xl font-bold text-haze">{i + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-lg">{s.question || "Untitled question"}</p>
                  <div className="mt-2 h-2 rounded-full bg-night-line">
                    <div className="h-full rounded-full bg-marigold transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="text-right font-display text-2xl font-bold tabular-nums">{n}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-haze">Results stay hidden from this screen until you choose Show results.</p>
      </div>
    </div>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-7xl font-extrabold leading-none tabular-nums">{value}</p>
      <p className="mt-2 text-lg text-haze">{label}</p>
    </div>
  );
}

/** Self-paced, results shown: one question's results at a time. */
function ResultsView({ state, index, send }: { state: HostState; index: number; send: Send }) {
  const slide = state.presentation.slides[index];
  if (!slide) return <p className="m-auto text-2xl text-haze">There are no questions to show.</p>;
  const results = state.results[slide.id];
  const quiz = isQuiz(slide.type);
  return (
    <>
      <QuestionHeading
        label={`Question ${index + 1} of ${state.presentation.slides.length}`}
        question={slide.question}
        aside={
          <p className="text-lg text-haze">
            {results.total} {slide.type === "qa" ? "question" : "answer"}
            {results.total === 1 ? "" : "s"}
          </p>
        }
      />
      <div className="mt-6 flex min-h-0 flex-1 gap-8">
        <div className="min-h-0 min-w-0 flex-1">
          <Results slide={slide} results={results} reveal={quiz} onAnswered={markAnswered(slide.type, send)} />
        </div>
        {quiz && (
          <div className="hidden w-80 shrink-0 lg:block">
            <Leaderboard entries={state.leaderboard} />
          </div>
        )}
      </div>
    </>
  );
}

/** Q&A slides let the presenter tick off questions as they answer them. */
const markAnswered = (type: string, send: Send) =>
  type === "qa" ? (responseId: number, answered: boolean) => send("host:qaAnswered", { responseId, answered }) : undefined;

function QuestionHeading({ label, question, aside }: { label: string; question: string; aside?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div>
        <p className="text-lg text-haze">{label}</p>
        <h1 className="mt-1 max-w-5xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{question || "Untitled question"}</h1>
      </div>
      {aside}
    </div>
  );
}

/** Presenter-paced: the current question, its timer if it's a quiz, and results when shown. */
function LiveQuestion({ state, offset, send }: { state: HostState; offset: number; send: Send }) {
  const p = state.presentation;
  const slide = p.slides[p.currentIndex];
  const window = slide ? state.quiz[slide.id] : undefined;
  const now = useNow(offset, Boolean(window));
  if (!slide) {
    return <p className="m-auto text-2xl text-haze">This presentation has no questions yet.</p>;
  }

  const results = state.results[slide.id];
  const quiz = isQuiz(slide.type);
  const ended = window ? now >= window.endsAt : false;
  const secondsLeft = window ? Math.max(0, Math.ceil((window.endsAt - now) / 1000)) : 0;

  let content: ReactNode;
  if (quiz && !window) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-8">
        {slide.type === "quiz_select" && (
          <ol className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
            {slide.options.map((o, i) => (
              <li key={i} className="flex items-center gap-4 rounded-2xl bg-night-raised p-3 pr-5 text-2xl">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl font-display font-extrabold text-night" style={{ background: optionColor(i) }}>
                  {optionLetter(i)}
                </span>
                {optionLabel(o, i)}
              </li>
            ))}
          </ol>
        )}
        <Button className="px-10 py-4 text-lg" onClick={() => send("host:startQuiz", { slideId: slide.id })}>
          Start the {slide.settings.timeLimit}-second timer
        </Button>
      </div>
    );
  } else if (quiz && !ended) {
    content = <BigCount value={results.total} label="answers so far" />;
  } else if (!p.showResults && !(quiz && ended) && slide.type !== "qa") {
    // Q&A questions always show: reading them out is the point.
    content = <BigCount value={results.total} label={`${results.total === 1 ? "answer" : "answers"}. Results are hidden until you show them.`} />;
  } else {
    content = (
      <div className="flex h-full gap-8">
        <div className="min-h-0 min-w-0 flex-1">
          <Results slide={slide} results={results} reveal={quiz && ended} onAnswered={markAnswered(slide.type, send)} />
        </div>
        {quiz && ended && (
          <div className="hidden w-80 shrink-0 lg:block">
            <Leaderboard entries={state.leaderboard} />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <QuestionHeading
        label={`${slideLabel(slide.type)}, question ${p.currentIndex + 1} of ${p.slides.length}`}
        question={slide.question}
        aside={
          quiz && window && !ended ? (
            <p className="font-display text-8xl font-extrabold leading-none tabular-nums text-marigold" aria-live="polite">
              {secondsLeft}
            </p>
          ) : undefined
        }
      />
      <div className="mt-6 min-h-0 flex-1">{content}</div>
    </>
  );
}

function BigCount({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="font-display text-9xl font-extrabold leading-none tabular-nums">{value}</p>
      <p className="mt-4 max-w-md text-xl text-haze">{label}</p>
    </div>
  );
}
