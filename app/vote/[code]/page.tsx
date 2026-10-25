"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Button, ErrorText, Input, Logo } from "@/components/ui";
import { useNow } from "@/components/useNow";
import { call, errorMessage, getSocket, getVoterId, onConnect, saveNickname, savedNickname } from "@/lib/client";
import { optionColor, optionLabel, optionLetter } from "@/lib/palette";
import { LIMITS, defaultMaxEntries, isQuiz } from "@/lib/slides";
import type { AudienceState, PublicSlide } from "@/lib/types";

export default function VotePage() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<AudienceState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");

  const apply = useCallback((s: AudienceState) => {
    setOffset(s.serverNow - Date.now());
    setState(s);
  }, []);

  useEffect(() => {
    const voterId = getVoterId();
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
  }, [code, apply]);

  if (!state) {
    return (
      <Screen>
        {error ? (
          <Notice title="That code didn't work" action={<LinkButton href="/">Try another code</LinkButton>}>
            {error}. Check the number on the presenter&apos;s screen.
          </Notice>
        ) : (
          <Notice title="Joining…" />
        )}
      </Screen>
    );
  }

  if (state.status === "draft") {
    return (
      <Screen title={state.title}>
        <Notice title="You're in" pulse>
          The questions will appear here as soon as the presenter starts. Keep this page open.
        </Notice>
      </Screen>
    );
  }

  if (state.status === "closed") {
    return (
      <Screen title={state.title}>
        <Notice title="This session has ended">Thanks for taking part.</Notice>
      </Screen>
    );
  }

  if (!state.slides.length) {
    return (
      <Screen title={state.title}>
        <Notice title="No questions yet" pulse>
          Keep this page open. Questions will appear here when they&apos;re added.
        </Notice>
      </Screen>
    );
  }

  return state.pacing === "self" ? (
    <SelfPaced state={state} offset={offset} onState={apply} />
  ) : (
    <PresenterPaced state={state} offset={offset} onState={apply} />
  );
}

function Screen({ title, top, children }: { title?: string; top?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-6 pt-5">
      <header className="mb-7 flex items-center justify-between gap-4">
        <Logo />
        {title && <span className="min-w-0 truncate text-sm font-bold text-muted">{title}</span>}
      </header>
      {top}
      {children}
    </main>
  );
}

function Notice({ title, children, action, pulse }: { title: string; children?: ReactNode; action?: ReactNode; pulse?: boolean }) {
  return (
    <div className="my-auto rounded-3xl bg-white p-8 text-center ring-1 ring-line">
      {pulse && (
        <span className="relative mx-auto mb-5 flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-3 rounded-full bg-teal" />
        </span>
      )}
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
      {children && <p className="mt-3 text-lg text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex rounded-full bg-night px-6 py-3 font-bold text-white hover:bg-night-raised">
      {children}
    </Link>
  );
}

interface FlowProps {
  state: AudienceState;
  offset: number;
  onState: (s: AudienceState) => void;
}

function PresenterPaced({ state, offset, onState }: FlowProps) {
  const slide = state.slides[0];
  const last = state.currentIndex >= state.total - 1;
  return (
    <Screen
      title={state.title}
      top={
        <p className="mb-3 text-sm font-bold text-muted">
          Question {state.currentIndex + 1} of {state.total}
        </p>
      }
    >
      <Question
        key={slide.id}
        slide={slide}
        state={state}
        offset={offset}
        onState={onState}
        after={
          <p className="text-center text-muted" aria-live="polite">
            {last ? "That was the last question. Thanks for taking part!" : "The next question will appear when the presenter moves on."}
          </p>
        }
      />
    </Screen>
  );
}

function SelfPaced({ state, offset, onState }: FlowProps) {
  const { slides } = state;
  const answered = (s: PublicSlide) => (state.mine[s.id] ?? 0) > 0;
  const firstUnanswered = () => {
    const i = slides.findIndex((s) => !answered(s));
    return i === -1 ? slides.length : i;
  };
  const [index, setIndex] = useState(firstUnanswered);
  const at = Math.min(index, slides.length);
  const slide = slides[at];
  const doneCount = slides.filter(answered).length;

  const top = (
    <div className="mb-7">
      <div className="mb-2 flex justify-between text-sm font-bold text-muted">
        <span>{slide ? `Question ${at + 1} of ${slides.length}` : "Finished"}</span>
        <span>{doneCount} answered</span>
      </div>
      <ol className="flex gap-1.5">
        {slides.map((s, i) => (
          <li key={s.id} className="flex-1">
            <button
              onClick={() => setIndex(i)}
              aria-label={`Question ${i + 1}${answered(s) ? ", answered" : ""}`}
              aria-current={i === at ? "step" : undefined}
              className={`block h-2 w-full rounded-full transition-colors ${i === at ? "bg-night" : answered(s) ? "bg-teal" : "bg-line"}`}
            />
          </li>
        ))}
      </ol>
    </div>
  );

  if (!slide) {
    const skipped = slides.length - doneCount;
    return (
      <Screen title={state.title} top={top}>
        <div className="my-auto text-center">
          <h1 className="font-display text-5xl font-extrabold tracking-tight">All done</h1>
          <p className="mt-3 text-lg text-muted">
            You answered {doneCount} of {slides.length} questions. Thanks for taking part!
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            {skipped > 0 && (
              <Button onClick={() => setIndex(firstUnanswered())} className="px-6 py-3">
                Answer the {skipped} you skipped
              </Button>
            )}
            <Button variant="secondary" onClick={() => setIndex(0)} className="px-6 py-3">
              Review my answers
            </Button>
          </div>
        </div>
      </Screen>
    );
  }

  const isLast = at === slides.length - 1;
  return (
    <Screen title={state.title} top={top}>
      <Question key={slide.id} slide={slide} state={state} offset={offset} onState={onState} selfPaced />
      <nav className="mt-auto flex gap-3 pt-10">
        <Button variant="secondary" className="flex-1 py-3" disabled={at === 0} onClick={() => setIndex(at - 1)}>
          Back
        </Button>
        <Button variant={answered(slide) ? "primary" : "secondary"} className="flex-1 py-3" onClick={() => setIndex(at + 1)}>
          {isLast ? "Finish" : answered(slide) ? "Next question" : "Skip"}
        </Button>
      </nav>
    </Screen>
  );
}

interface QuestionProps extends FlowProps {
  slide: PublicSlide;
  selfPaced?: boolean;
  /** Shown under the confirmation once they've answered. */
  after?: ReactNode;
}

function Question(props: QuestionProps) {
  const { slide } = props;
  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">{slide.question || "Untitled question"}</h1>
      {slide.type === "multiple_choice" && <ChoiceVote {...props} />}
      {(slide.type === "word_cloud" || slide.type === "open_ended") && <TextVote {...props} />}
      {slide.type === "scales" && <ScalesVote {...props} />}
      {isQuiz(slide.type) && <QuizVote {...props} />}
    </section>
  );
}

/** Sends a response; resolves true on success. */
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

function Answered({ children, onChange, after, tone = "good" }: { children: ReactNode; onChange?: () => void; after?: ReactNode; tone?: "good" | "bad" | "wait" }) {
  const styles = {
    good: "bg-teal/10 ring-teal/30 text-[#0d5c57]",
    bad: "bg-rose/10 ring-rose/30 text-[#9c1c39]",
    wait: "bg-white ring-line text-night",
  }[tone];
  return (
    <>
      <div className={`rounded-3xl p-6 text-center ring-1 ${styles}`} role="status">
        <p className="font-display text-xl font-bold">{children}</p>
        {onChange && (
          <button className="mt-2 text-sm font-bold underline underline-offset-4" onClick={onChange}>
            Change my answer
          </button>
        )}
      </div>
      {after}
    </>
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
          className={`flex items-center gap-4 rounded-2xl bg-white p-2.5 pr-5 text-left text-lg font-bold transition-shadow disabled:opacity-60 ${
            selected === i ? "ring-[3px] ring-night" : "ring-1 ring-line hover:ring-night/40"
          }`}
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl font-display text-xl font-extrabold text-night" style={{ background: optionColor(i) }}>
            {optionLetter(i)}
          </span>
          <span>{optionLabel(o, i)}</span>
        </button>
      ))}
    </div>
  );
}

function ChoiceVote({ slide, state, onState, after }: QuestionProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const { submit, busy, error } = useSubmit(slide, onState);

  if (state.mine[slide.id] && !editing) {
    return (
      <Answered onChange={() => setEditing(true)} after={after}>
        Your vote is in
      </Answered>
    );
  }

  return (
    <>
      <OptionButtons options={slide.options} selected={selected} onSelect={setSelected} />
      <Button className="py-3.5 text-base" disabled={selected === null || busy} onClick={async () => (await submit({ choice: selected })) && setEditing(false)}>
        Submit vote
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function TextVote({ slide, state, onState, after }: QuestionProps) {
  const [text, setText] = useState("");
  const { submit, busy, error } = useSubmit(slide, onState);
  const max = slide.settings.maxEntries ?? defaultMaxEntries(slide.type);
  const limit = slide.type === "word_cloud" ? LIMITS.wordCloud : LIMITS.openEnded;
  const left = max - (state.mine[slide.id] ?? 0);

  if (left <= 0) return <Answered after={after}>Thanks, your {max === 1 ? "answer is" : "answers are"} in</Answered>;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (await submit({ text })) setText("");
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      {slide.type === "word_cloud" ? (
        <Input value={text} maxLength={limit} placeholder="A word or two" onChange={(e) => setText(e.target.value)} className="py-4 text-lg" />
      ) : (
        <textarea
          value={text}
          maxLength={limit}
          rows={4}
          placeholder="Type your answer"
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-lg focus:border-night focus:outline-none"
        />
      )}
      <div className="flex justify-between text-sm text-muted">
        <span>{max > 1 ? `You can send ${left} more` : ""}</span>
        <span className="tabular-nums">
          {text.length}/{limit}
        </span>
      </div>
      <Button type="submit" className="py-3.5 text-base" disabled={!text.trim() || busy}>
        Send
      </Button>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function ScalesVote({ slide, state, onState, after }: QuestionProps) {
  const max = slide.settings.scaleMax ?? 5;
  const [ratings, setRatings] = useState(() => slide.options.map(() => Math.ceil(max / 2)));
  const [editing, setEditing] = useState(false);
  const { submit, busy, error } = useSubmit(slide, onState);

  if (state.mine[slide.id] && !editing) {
    return (
      <Answered onChange={() => setEditing(true)} after={after}>
        Thanks for rating
      </Answered>
    );
  }

  return (
    <>
      {slide.options.map((statement, i) => (
        <label key={i} className="block rounded-2xl bg-white p-5 ring-1 ring-line">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-bold">{optionLabel(statement, i)}</span>
            <span className="font-display text-2xl font-extrabold tabular-nums">{ratings[i]}</span>
          </span>
          <input
            type="range"
            min={1}
            max={max}
            step={1}
            value={ratings[i]}
            onChange={(e) => setRatings(ratings.map((r, j) => (j === i ? Number(e.target.value) : r)))}
            className="mt-4 w-full"
          />
          <span className="mt-1 flex justify-between text-sm text-muted">
            <span>{slide.settings.minLabel}</span>
            <span>{slide.settings.maxLabel}</span>
          </span>
        </label>
      ))}
      <Button className="py-3.5 text-base" disabled={busy} onClick={async () => (await submit({ ratings })) && setEditing(false)}>
        Submit ratings
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function QuizVote({ slide, state, offset, onState, selfPaced, after }: QuestionProps) {
  const [name, setName] = useState(() => state.name ?? savedNickname());
  const [confirmedName, setConfirmedName] = useState(Boolean(state.name));
  const [text, setText] = useState("");
  const { submit, busy, error } = useSubmit(slide, onState);
  const window = state.quiz[slide.id];
  const result = state.quizResults[slide.id];
  const answered = (state.mine[slide.id] ?? 0) > 0;
  const now = useNow(offset, !selfPaced && window !== undefined && !result);

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
        <p className="text-lg text-muted">This is a quiz. Pick a nickname for the leaderboard.</p>
        <Input value={name} maxLength={LIMITS.nickname} placeholder="Nickname" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" className="py-3.5 text-base" disabled={!name.trim()}>
          Continue
        </Button>
      </form>
    );
  }

  if (result) {
    return result.correct ? (
      <Answered after={after}>Correct! +{result.points} points</Answered>
    ) : (
      <Answered tone="bad" after={after}>
        Not this time
      </Answered>
    );
  }

  let timer: ReactNode = null;
  if (!selfPaced) {
    if (!window) return <Answered tone="wait">Get ready, {name}. The question starts soon.</Answered>;
    const secondsLeft = Math.max(0, Math.ceil((window.endsAt - now) / 1000));
    if (secondsLeft === 0) return <Answered tone="wait">Time&apos;s up! Results coming…</Answered>;
    if (answered) return <Answered tone="wait">Answer locked in. {secondsLeft}s left</Answered>;
    timer = (
      <p className="text-center font-display text-5xl font-extrabold tabular-nums" aria-live="polite">
        {secondsLeft}
      </p>
    );
  }

  return (
    <>
      {timer}
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
          <Input value={text} maxLength={LIMITS.quizText} placeholder="Your answer" onChange={(e) => setText(e.target.value)} className="py-4 text-lg" />
          <Button type="submit" className="py-3.5 text-base" disabled={!text.trim() || busy}>
            Lock in answer
          </Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}
