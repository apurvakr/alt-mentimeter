"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PacingChoice } from "@/components/PacingChoice";
import { Button, ErrorText, Input, Label, Logo, StatusPill } from "@/components/ui";
import { call, errorMessage, getSocket, savePresentation, tokenFor } from "@/lib/client";
import { optionColor, optionLetter } from "@/lib/palette";
import { LIMITS, SLIDE_TYPES, defaultSlide, formatCode, isQuiz, slideLabel } from "@/lib/slides";
import type { HostState, Pacing, SessionStatus, Slide, SlideType } from "@/lib/types";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [pacing, setPacing] = useState<Pacing>("self");
  const [status, setStatus] = useState<SessionStatus>("draft");
  const [selected, setSelected] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const dirty = useRef(false);

  useEffect(() => setToken(tokenFor(id)), [id]);

  useEffect(() => {
    if (!token) return;
    call<HostState>("host:join", { id, token })
      .then((s) => {
        setTitle(s.presentation.title);
        setCode(s.presentation.code);
        setSlides(s.presentation.slides);
        setPacing(s.presentation.pacing);
        setStatus(s.presentation.status);
        setLoaded(true);
      })
      .catch((e) => setError(errorMessage(e)));
    // Keep publish status in sync if it's changed from the presenter screen.
    const onState = (s: HostState) => {
      setStatus(s.presentation.status);
      setPacing(s.presentation.pacing);
    };
    const socket = getSocket();
    socket.on("host:state", onState);
    return () => {
      socket.off("host:state", onState);
    };
  }, [id, token]);

  // Autosave shortly after the last edit.
  useEffect(() => {
    if (!dirty.current || !token) return;
    setSaveStatus("unsaved");
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await call("host:save", { id, token, title, slides });
        savePresentation({ id, token, code, title: title.trim() || "Untitled presentation" });
        dirty.current = false;
        setSaveStatus("saved");
      } catch (e) {
        setError(errorMessage(e));
        setSaveStatus("error");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, slides, id, token, code]);

  async function updateSettings(settings: { pacing?: Pacing; status?: SessionStatus }) {
    setError("");
    try {
      await call("host:settings", { id, token, ...settings });
      if (settings.pacing) setPacing(settings.pacing);
      if (settings.status) setStatus(settings.status);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function edit(next: Slide[]) {
    dirty.current = true;
    setSlides(next);
  }

  function addSlide(type: SlideType) {
    const at = Math.min(selected + 1, slides.length);
    edit([...slides.slice(0, at), defaultSlide(type), ...slides.slice(at)]);
    setSelected(at);
    setAdding(false);
  }

  function move(from: number, to: number) {
    const next = [...slides];
    const [slide] = next.splice(from, 1);
    next.splice(to, 0, slide);
    edit(next);
    setSelected(to);
  }

  function remove(i: number) {
    edit(slides.filter((_, j) => j !== i));
    setSelected(Math.max(0, Math.min(selected, slides.length - 2)));
  }

  if (token === null) {
    return (
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl font-extrabold">This browser can&apos;t edit it</h1>
        <p className="mt-3 text-lg text-muted">Open the editor from the browser you used to create the presentation.</p>
        <Link href="/host" className="mt-8 inline-flex rounded-full bg-night px-6 py-3 font-bold text-white">
          Go to the dashboard
        </Link>
      </main>
    );
  }

  if (!loaded) {
    return <main className="flex min-h-dvh items-center justify-center text-muted">{error ? <ErrorText>{error}</ErrorText> : "Loading…"}</main>;
  }

  const current = slides[selected];
  const saveText = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Couldn't save" }[saveStatus];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          <Logo href="/host" />
          <span className="hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <input
            value={title}
            maxLength={LIMITS.title}
            aria-label="Presentation title"
            onChange={(e) => {
              dirty.current = true;
              setTitle(e.target.value);
            }}
            className="min-w-0 flex-1 rounded-lg px-2 py-1 font-display text-xl font-bold tracking-tight outline-none hover:bg-mist focus:bg-mist"
          />
          <span className={`text-sm ${saveStatus === "error" ? "font-bold text-[#b3203f]" : "text-muted"}`}>{saveText}</span>
          <StatusPill status={status} />
          <span className="text-sm text-muted">Code {formatCode(code)}</span>
          {status === "draft" && (
            <Button onClick={() => updateSettings({ status: "open" })} disabled={!slides.length}>
              Publish
            </Button>
          )}
          {status === "open" && (
            <Button variant="secondary" onClick={() => updateSettings({ status: "closed" })}>
              Close voting
            </Button>
          )}
          {status === "closed" && (
            <Button variant="secondary" onClick={() => updateSettings({ status: "open" })}>
              Reopen voting
            </Button>
          )}
          <Link href={`/present/${id}`} className="rounded-full bg-night px-5 py-2.5 text-sm font-bold text-white hover:bg-night-raised">
            Present
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-line bg-white p-3 md:w-72 md:border-b-0 md:border-r">
          <ol className="flex flex-col gap-1">
            {slides.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(i)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${i === selected ? "bg-mist ring-1 ring-night/20" : "hover:bg-mist"}`}
                >
                  <span className="mt-0.5 font-display font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-muted">{slideLabel(s.type)}</span>
                    <span className="block truncate font-bold">{s.question || "Untitled question"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {adding ? (
            <div className="mt-3 rounded-2xl bg-mist p-2">
              {SLIDE_TYPES.map((t) => (
                <button key={t.type} onClick={() => addSlide(t.type)} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white">
                  <span className="block text-sm font-bold">{t.label}</span>
                  <span className="block text-xs text-muted">{t.hint}</span>
                </button>
              ))}
              <Button variant="ghost" className="mt-1 w-full" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="mt-3 w-full" disabled={slides.length >= LIMITS.maxSlides} onClick={() => setAdding(true)}>
              Add a question
            </Button>
          )}
        </aside>

        <main className="flex-1 px-4 py-8 sm:px-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            <section className="rounded-3xl bg-white p-6 ring-1 ring-line">
              <PacingChoice value={pacing} onChange={(value) => updateSettings({ pacing: value })} />
              <p className="mt-4 text-sm text-muted">
                {pacing === "self"
                  ? "After you publish, open Present to watch answers come in. Results stay hidden until you choose Show results."
                  : "After you publish, open Present and show that screen. Next or the arrow keys move everyone to the next question."}
              </p>
            </section>

            {current ? (
              <section className="rounded-3xl bg-white p-6 ring-1 ring-line">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-xl font-bold">
                    Question {selected + 1}: {slideLabel(current.type)}
                  </h2>
                  <div className="flex gap-1">
                    <Button variant="ghost" disabled={selected === 0} onClick={() => move(selected, selected - 1)} aria-label="Move question up">
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={selected === slides.length - 1}
                      onClick={() => move(selected, selected + 1)}
                      aria-label="Move question down"
                    >
                      ↓
                    </Button>
                    <Button variant="danger" onClick={() => remove(selected)}>
                      Delete
                    </Button>
                  </div>
                </div>
                <SlideEditor slide={current} pacing={pacing} onChange={(s) => edit(slides.map((x, i) => (i === selected ? s : x)))} />
              </section>
            ) : (
              <p className="text-center text-muted">No questions yet. Add one from the list.</p>
            )}
            <ErrorText>{error}</ErrorText>
          </div>
        </main>
      </div>
    </div>
  );
}

const selectClass = "w-full rounded-xl border border-line bg-white px-4 py-3 focus:border-night focus:outline-none";

function SlideEditor({ slide, pacing, onChange }: { slide: Slide; pacing: Pacing; onChange: (s: Slide) => void }) {
  const set = (patch: Partial<Slide>) => onChange({ ...slide, ...patch });
  const setSettings = (patch: Slide["settings"]) => set({ settings: { ...slide.settings, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <label>
        <Label>Question</Label>
        <textarea
          value={slide.question}
          maxLength={LIMITS.question}
          rows={2}
          placeholder="What do you want to ask?"
          onChange={(e) => set({ question: e.target.value })}
          className="w-full rounded-xl border border-line px-4 py-3 font-display text-xl font-bold focus:border-night focus:outline-none"
        />
      </label>

      {(slide.type === "multiple_choice" || slide.type === "quiz_select") && (
        <ListEditor
          label={slide.type === "quiz_select" ? "Answers (mark the correct one)" : "Options"}
          items={slide.options}
          addLabel="Add an option"
          lettered
          onChange={(options) =>
            set({
              options,
              settings:
                slide.type === "quiz_select"
                  ? { ...slide.settings, correctIndex: Math.min(slide.settings.correctIndex ?? 0, options.length - 1) }
                  : slide.settings,
            })
          }
          correctIndex={slide.type === "quiz_select" ? (slide.settings.correctIndex ?? 0) : undefined}
          onCorrect={(i) => setSettings({ correctIndex: i })}
          min={2}
        />
      )}

      {slide.type === "scales" && (
        <>
          <ListEditor label="Statements to rate" items={slide.options} addLabel="Add a statement" onChange={(options) => set({ options })} min={1} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label>
              <Label>Scale</Label>
              <select value={slide.settings.scaleMax ?? 5} onChange={(e) => setSettings({ scaleMax: Number(e.target.value) })} className={selectClass}>
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>
                    1 to {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>Label for 1</Label>
              <Input value={slide.settings.minLabel ?? ""} maxLength={40} onChange={(e) => setSettings({ minLabel: e.target.value })} />
            </label>
            <label>
              <Label>Label for {slide.settings.scaleMax ?? 5}</Label>
              <Input value={slide.settings.maxLabel ?? ""} maxLength={40} onChange={(e) => setSettings({ maxLabel: e.target.value })} />
            </label>
          </div>
        </>
      )}

      {slide.type === "quiz_type" && (
        <ListEditor
          label="Accepted answers (capitals don't matter)"
          items={slide.settings.acceptedAnswers ?? []}
          addLabel="Add another accepted answer"
          onChange={(acceptedAnswers) => setSettings({ acceptedAnswers })}
          min={1}
        />
      )}

      {isQuiz(slide.type) &&
        (pacing === "presenter" ? (
          <label className="max-w-52">
            <Label>Time to answer</Label>
            <select value={slide.settings.timeLimit ?? 20} onChange={(e) => setSettings({ timeLimit: Number(e.target.value) })} className={selectClass}>
              {[10, 15, 20, 30, 45, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted">In a self-paced survey quizzes aren&apos;t timed. Each correct answer scores 1000 points.</p>
        ))}

      {(slide.type === "word_cloud" || slide.type === "open_ended") && (
        <label className="max-w-60">
          <Label>Answers per person</Label>
          <select value={slide.settings.maxEntries ?? 1} onChange={(e) => setSettings({ maxEntries: Number(e.target.value) })} className={selectClass}>
            {[1, 2, 3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function ListEditor({
  label,
  items,
  addLabel,
  onChange,
  min,
  lettered = false,
  correctIndex,
  onCorrect,
}: {
  label: string;
  items: string[];
  addLabel: string;
  onChange: (items: string[]) => void;
  min: number;
  lettered?: boolean;
  correctIndex?: number;
  onCorrect?: (i: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            {lettered && (
              <span className="grid size-10 shrink-0 place-items-center rounded-xl font-display font-extrabold text-night" style={{ background: optionColor(i) }}>
                {optionLetter(i)}
              </span>
            )}
            <Input value={item} maxLength={LIMITS.option} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            {correctIndex !== undefined && (
              <label className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold ${correctIndex === i ? "bg-teal/15 text-[#0d5c57]" : "text-muted"}`}>
                <input type="radio" name="correct" checked={correctIndex === i} onChange={() => onCorrect?.(i)} className="accent-teal" />
                Correct
              </label>
            )}
            <Button
              variant="ghost"
              className="px-3"
              disabled={items.length <= min}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remove ${lettered ? optionLetter(i) : i + 1}`}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
      {items.length < LIMITS.maxOptions && (
        <Button variant="ghost" className="mt-2 px-3 text-night" onClick={() => onChange([...items, ""])}>
          + {addLabel}
        </Button>
      )}
    </fieldset>
  );
}
