"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { Leaderboard, Results } from "@/components/Results";
import { Button, ErrorText } from "@/components/ui";
import { useNow } from "@/components/useNow";
import { call, errorMessage, getSocket, onConnect, tokenFor } from "@/lib/client";
import { formatCode, isQuiz, slideLabel } from "@/lib/slides";
import type { HostState } from "@/lib/types";

export default function PresentPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<HostState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null | undefined>(undefined);

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

  const send = useCallback(
    (event: string, extra: object = {}) => {
      setError("");
      call(event, { id, token, ...extra }).catch((e) => setError(errorMessage(e)));
    },
    [id, token],
  );

  const index = state?.presentation.currentIndex ?? 0;
  const count = state?.presentation.slides.length ?? 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key) && index < count - 1) {
        e.preventDefault();
        send("host:goto", { index: index + 1 });
      } else if (["ArrowLeft", "PageUp"].includes(e.key) && index > 0) {
        e.preventDefault();
        send("host:goto", { index: index - 1 });
      } else if (e.key === "f") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, send]);

  const slide = state?.presentation.slides[index];
  const window_ = slide ? state?.quiz[slide.id] : undefined;
  const now = useNow(offset, Boolean(window_));

  if (token === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Can&apos;t present from this browser</h1>
        <p className="mt-2 text-slate-600">Presenting needs the browser that created the presentation.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-indigo-600">
          Back home
        </Link>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-slate-500">{error ? <ErrorText>{error}</ErrorText> : "Loading…"}</main>
    );
  }

  const { presentation } = state;
  const results = slide ? state.results[slide.id] : undefined;
  const quizEnded = window_ ? now >= window_.endsAt : false;
  const secondsLeft = window_ ? Math.max(0, Math.ceil((window_.endsAt - now) / 1000)) : 0;

  return (
    <main className="flex h-dvh flex-col bg-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
        <p className="text-lg">
          Go to <strong>{state.joinHost}</strong> and use code{" "}
          <strong className="tabular-nums tracking-wider text-indigo-600">{formatCode(presentation.code)}</strong>
        </p>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">
            {state.participants} {state.participants === 1 ? "person" : "people"} joined
          </span>
          <QRCodeSVG value={state.joinUrl} size={56} aria-label={`QR code for ${state.joinUrl}`} />
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col px-6 py-6 sm:px-12">
        {!slide || !results ? (
          <div className="m-auto text-center text-slate-500">
            This presentation has no slides.{" "}
            <Link href={`/edit/${id}`} className="font-semibold text-indigo-600">
              Add some
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{slideLabel(slide.type)}</p>
                <h1 className="mt-1 text-3xl font-bold leading-tight sm:text-4xl">{slide.question || "Untitled question"}</h1>
              </div>
              {isQuiz(slide.type) && window_ && !quizEnded && (
                <p className="text-6xl font-bold tabular-nums text-indigo-600" aria-live="polite">
                  {secondsLeft}
                </p>
              )}
            </div>

            <div className="mt-6 flex min-h-0 flex-1 gap-6">
              <div className="min-h-0 min-w-0 flex-1">
                {isQuiz(slide.type) && !window_ ? (
                  <div className="flex h-full flex-col items-center justify-center gap-6">
                    {slide.type === "quiz_select" && (
                      <ol className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                        {slide.options.map((o, i) => (
                          <li key={i} className="rounded-xl bg-white px-5 py-4 text-xl font-medium ring-1 ring-slate-200">
                            {o || `Option ${i + 1}`}
                          </li>
                        ))}
                      </ol>
                    )}
                    <Button className="px-8 py-4 text-lg" onClick={() => send("host:startQuiz", { slideId: slide.id })}>
                      Start question ({slide.settings.timeLimit}s)
                    </Button>
                  </div>
                ) : isQuiz(slide.type) && !quizEnded ? (
                  <div className="flex h-full flex-col items-center justify-center">
                    <p className="text-7xl font-bold tabular-nums">{results.total}</p>
                    <p className="mt-2 text-xl text-slate-500">answers so far</p>
                  </div>
                ) : (
                  <Results slide={slide} results={results} reveal={quizEnded} />
                )}
              </div>
              {isQuiz(slide.type) && quizEnded && (
                <div className="hidden w-72 shrink-0 md:block">
                  <Leaderboard entries={state.leaderboard} />
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={index === 0} onClick={() => send("host:goto", { index: index - 1 })} aria-label="Previous slide">
            ← Prev
          </Button>
          <span className="w-16 text-center text-sm tabular-nums text-slate-500">
            {count ? index + 1 : 0} / {count}
          </span>
          <Button variant="secondary" disabled={index >= count - 1} onClick={() => send("host:goto", { index: index + 1 })} aria-label="Next slide">
            Next →
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center gap-1">
          {slide && results && results.total > 0 && (
            <Button variant="ghost" onClick={() => send("host:reset", { slideId: slide.id })}>
              Clear results
            </Button>
          )}
          {slide && isQuiz(slide.type) && quizEnded && (
            <Button variant="ghost" onClick={() => send("host:startQuiz", { slideId: slide.id })}>
              Restart question
            </Button>
          )}
          <Link href={`/edit/${id}`} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Edit
          </Link>
        </div>
      </footer>
    </main>
  );
}
