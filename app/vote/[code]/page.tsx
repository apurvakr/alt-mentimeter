"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { optionLabel } from "@/components/Results";
import { Button, ErrorText, Input } from "@/components/ui";
import { useNow } from "@/components/useNow";
import { call, errorMessage, getSocket, getVoterId, onConnect, saveNickname, savedNickname } from "@/lib/client";
import { LIMITS, defaultMaxEntries, isQuiz } from "@/lib/slides";
import type { AudienceState, PublicSlide } from "@/lib/types";

export default function VotePage() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<AudienceState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const voterId = getVoterId();
    const apply = (s: AudienceState) => {
      setOffset(s.serverNow - Date.now());
      setState(s);
    };
    const join = () =>
      call<AudienceState>("audience:join", { code, voterId })
        .then((s) => {
          setError("");
          apply(s);
        })
        .catch((e) => setError(errorMessage(e)));
    const socket = getSocket();
    socket.on("audience:state", apply);
    const stop = onConnect(join);
    return () => {
      socket.off("audience:state", apply);
      stop();
    };
  }, [code]);

  if (!state) {
    return (
      <Shell>
        {error ? (
          <Notice title="Couldn't join">
            <p>{error}</p>
            <Link href="/" className="mt-4 inline-block font-semibold text-indigo-600">
              Try another code
            </Link>
          </Notice>
        ) : (
          <Notice title="Joining…" />
        )}
      </Shell>
    );
  }

  return (
    <Shell title={state.title} progress={state.slide ? `${state.index + 1} / ${state.total}` : undefined}>
      {state.slide ? (
        <SlideView key={state.slide.id} slide={state.slide} state={state} offset={offset} onState={setState} />
      ) : (
        <Notice title="Hang tight">The presenter hasn't added any questions yet.</Notice>
      )}
    </Shell>
  );
}

function Shell({ title, progress, children }: { title?: string; progress?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4 text-sm text-slate-500">
        <span className="truncate font-medium">{title ?? "Live Poll"}</span>
        {progress && <span className="tabular-nums">{progress}</span>}
      </header>
      {children}
    </main>
  );
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="my-auto rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <div className="mt-2 text-slate-600">{children}</div>}
    </div>
  );
}

interface ViewProps {
  slide: PublicSlide;
  state: AudienceState;
  offset: number;
  onState: (s: AudienceState) => void;
  /** Shown once they've answered, so they know what happens next. */
  hint: string;
}

/** Sends a response and returns an error message, or "" on success. */
function useSubmit(slide: PublicSlide, onState: (s: AudienceState) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(value: unknown, name?: string) {
    setBusy(true);
    setError("");
    try {
      onState(await call<AudienceState>("audience:respond", { slideId: slide.id, value, name }));
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error };
}

function SlideView(viewProps: Omit<ViewProps, "hint">) {
  const { slide, state } = viewProps;
  const hint =
    state.index < state.total - 1
      ? "Waiting for the presenter to move on to the next question…"
      : "That was the last question. Thanks for taking part!";
  const props = { ...viewProps, hint };
  return (
    <section className="flex flex-1 flex-col gap-6">
      <h1 className="text-2xl font-bold leading-snug">{slide.question || "Untitled question"}</h1>
      {slide.type === "multiple_choice" && <ChoiceVote {...props} />}
      {(slide.type === "word_cloud" || slide.type === "open_ended") && <TextVote {...props} />}
      {slide.type === "scales" && <ScalesVote {...props} />}
      {isQuiz(slide.type) && <QuizVote {...props} />}
    </section>
  );
}

function Thanks({ children, onChange, hint }: { children: ReactNode; onChange?: () => void; hint?: string }) {
  return (
    <>
      <div className="rounded-2xl bg-green-50 p-6 text-center ring-1 ring-green-200">
        <p className="text-lg font-semibold text-green-900">{children}</p>
        {onChange && (
          <button className="mt-3 text-sm font-semibold text-green-800 underline" onClick={onChange}>
            Change my answer
          </button>
        )}
      </div>
      <Hint>{hint}</Hint>
    </>
  );
}

function Hint({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="text-center text-sm text-slate-500" aria-live="polite">
      {children}
    </p>
  );
}

function OptionButtons({ options, selected, onSelect, disabled }: { options: string[]; selected: number | null; onSelect: (i: number) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-3" role="radiogroup">
      {options.map((o, i) => (
        <button
          key={i}
          role="radio"
          aria-checked={selected === i}
          disabled={disabled}
          onClick={() => onSelect(i)}
          className={`rounded-xl px-4 py-4 text-left text-lg font-medium ring-1 transition-colors ${
            selected === i ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-900 ring-slate-300 hover:ring-indigo-400"
          }`}
        >
          {optionLabel(o, i)}
        </button>
      ))}
    </div>
  );
}

function ChoiceVote({ slide, state, onState, hint }: ViewProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const { submit, busy, error } = useSubmit(slide, onState);

  if (state.mine > 0 && !editing) {
    return (
      <Thanks onChange={() => setEditing(true)} hint={hint}>
        Your vote is in. Watch the screen!
      </Thanks>
    );
  }

  return (
    <>
      <OptionButtons options={slide.options} selected={selected} onSelect={setSelected} />
      <Button disabled={selected === null || busy} onClick={async () => (await submit({ choice: selected })) && setEditing(false)}>
        Submit
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function TextVote({ slide, state, onState, hint }: ViewProps) {
  const [text, setText] = useState("");
  const { submit, busy, error } = useSubmit(slide, onState);
  const max = slide.settings.maxEntries ?? defaultMaxEntries(slide.type);
  const limit = slide.type === "word_cloud" ? LIMITS.wordCloud : LIMITS.openEnded;
  const left = max - state.mine;

  if (left <= 0) return <Thanks hint={hint}>Thanks! Your {max === 1 ? "answer is" : "answers are"} on the screen.</Thanks>;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (await submit({ text })) setText("");
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      {slide.type === "word_cloud" ? (
        <Input value={text} maxLength={limit} placeholder="Type a word or two" onChange={(e) => setText(e.target.value)} autoFocus />
      ) : (
        <textarea
          value={text}
          maxLength={limit}
          rows={4}
          placeholder="Type your answer"
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      )}
      <div className="flex justify-between text-sm text-slate-500">
        <span>{max > 1 ? `${left} of ${max} answers left` : ""}</span>
        <span className="tabular-nums">
          {text.length}/{limit}
        </span>
      </div>
      <Button type="submit" disabled={!text.trim() || busy}>
        Submit
      </Button>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function ScalesVote({ slide, state, onState, hint }: ViewProps) {
  const max = slide.settings.scaleMax ?? 5;
  const [ratings, setRatings] = useState(() => slide.options.map(() => Math.ceil(max / 2)));
  const [editing, setEditing] = useState(false);
  const { submit, busy, error } = useSubmit(slide, onState);

  if (state.mine > 0 && !editing) {
    return (
      <Thanks onChange={() => setEditing(true)} hint={hint}>
        Thanks for rating!
      </Thanks>
    );
  }

  return (
    <>
      {slide.options.map((statement, i) => (
        <label key={i} className="block rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{optionLabel(statement, i)}</span>
            <span className="text-xl font-bold tabular-nums text-indigo-600">{ratings[i]}</span>
          </span>
          <input
            type="range"
            min={1}
            max={max}
            step={1}
            value={ratings[i]}
            onChange={(e) => setRatings(ratings.map((r, j) => (j === i ? Number(e.target.value) : r)))}
            className="mt-3 w-full"
          />
          <span className="flex justify-between text-xs text-slate-500">
            <span>{slide.settings.minLabel}</span>
            <span>{slide.settings.maxLabel}</span>
          </span>
        </label>
      ))}
      <Button disabled={busy} onClick={async () => (await submit({ ratings })) && setEditing(false)}>
        Submit
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function QuizVote({ slide, state, offset, onState, hint }: ViewProps) {
  const [name, setName] = useState(() => state.name ?? savedNickname());
  const [confirmedName, setConfirmedName] = useState(Boolean(state.name));
  const [text, setText] = useState("");
  const { submit, busy, error } = useSubmit(slide, onState);
  const running = state.quiz !== null && state.quizResult === null;
  const now = useNow(offset, running);

  if (!confirmedName) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveNickname(name.trim());
          setConfirmedName(true);
        }}
      >
        <p className="text-slate-600">Pick a nickname for the leaderboard.</p>
        <Input value={name} maxLength={LIMITS.nickname} placeholder="Nickname" onChange={(e) => setName(e.target.value)} autoFocus />
        <Button type="submit" disabled={!name.trim()}>
          Continue
        </Button>
      </form>
    );
  }

  if (!state.quiz) return <Thanks>Get ready, {name}! The question starts soon.</Thanks>;

  if (state.quizResult) {
    return state.quizResult.correct ? (
      <Thanks hint={hint}>Correct! +{state.quizResult.points} points</Thanks>
    ) : (
      <>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-lg font-semibold text-red-900 ring-1 ring-red-200">Not this time. Next one!</div>
        <Hint>{hint}</Hint>
      </>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((state.quiz.endsAt - now) / 1000));
  if (secondsLeft === 0) return <Thanks>Time&apos;s up! Results coming…</Thanks>;
  if (state.mine > 0) return <Thanks>Answer locked in. {secondsLeft}s left</Thanks>;

  return (
    <>
      <p className="text-center text-4xl font-bold tabular-nums text-indigo-600" aria-live="polite">
        {secondsLeft}
      </p>
      {slide.type === "quiz_select" ? (
        <OptionButtons options={slide.options} selected={null} disabled={busy} onSelect={(i) => submit({ choice: i }, name)} />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ text }, name);
          }}
        >
          <Input value={text} maxLength={LIMITS.quizText} placeholder="Your answer" onChange={(e) => setText(e.target.value)} autoFocus />
          <Button type="submit" disabled={!text.trim() || busy}>
            Submit
          </Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}
