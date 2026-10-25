"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { call, errorMessage, savePresentation, tokenFor } from "@/lib/client";
import { LIMITS, SLIDE_TYPES, defaultSlide, formatCode, slideLabel } from "@/lib/slides";
import type { HostState, Slide, SlideType } from "@/lib/types";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selected, setSelected] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("saved");
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
        setLoaded(true);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id, token]);

  // Autosave shortly after the last edit.
  useEffect(() => {
    if (!dirty.current || !token) return;
    setStatus("unsaved");
    const timer = setTimeout(async () => {
      setStatus("saving");
      try {
        await call("host:save", { id, token, title, slides });
        savePresentation({ id, token, code, title: title.trim() || "Untitled presentation" });
        dirty.current = false;
        setStatus("saved");
      } catch (e) {
        setError(errorMessage(e));
        setStatus("error");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, slides, id, token, code]);

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
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Can&apos;t edit from this browser</h1>
        <p className="mt-2 text-slate-600">Editing needs the browser that created the presentation.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-indigo-600">
          Back home
        </Link>
      </main>
    );
  }

  if (!loaded) {
    return <main className="flex min-h-dvh items-center justify-center text-slate-500">{error ? <ErrorText>{error}</ErrorText> : "Loading…"}</main>;
  }

  const current = slides[selected];
  const statusText = { saved: "All changes saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Couldn't save" }[status];

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-900">
          ← Home
        </Link>
        <input
          value={title}
          maxLength={LIMITS.title}
          aria-label="Presentation title"
          onChange={(e) => {
            dirty.current = true;
            setTitle(e.target.value);
          }}
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-lg font-semibold outline-none hover:bg-slate-100 focus:bg-slate-100"
        />
        <span className={`text-sm ${status === "error" ? "text-red-600" : "text-slate-500"}`}>{statusText}</span>
        <span className="text-sm text-slate-500">Code {formatCode(code)}</span>
        <Link href={`/present/${id}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Present
        </Link>
      </header>
      <p className="border-b border-slate-200 bg-white px-4 pb-3 text-sm text-slate-600 sm:px-6">
        To run it, click <strong>Present</strong> and show that screen to your audience. You move between questions there with{" "}
        <strong>Next →</strong> or the arrow keys; everyone&apos;s phone follows automatically.
      </p>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-slate-200 bg-white p-3 md:w-72 md:border-b-0 md:border-r">
          <ol className="flex flex-col gap-1">
            {slides.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(i)}
                  className={`w-full rounded-lg px-3 py-2 text-left ${i === selected ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"}`}
                >
                  <span className="block text-xs font-medium text-slate-500">
                    {i + 1}. {slideLabel(s.type)}
                  </span>
                  <span className="block truncate text-sm font-medium">{s.question || "Untitled question"}</span>
                </button>
              </li>
            ))}
          </ol>

          {adding ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
              {SLIDE_TYPES.map((t) => (
                <button key={t.type} onClick={() => addSlide(t.type)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-white">
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-slate-500">{t.hint}</span>
                </button>
              ))}
              <Button variant="ghost" className="mt-1 w-full" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="mt-3 w-full" disabled={slides.length >= LIMITS.maxSlides} onClick={() => setAdding(true)}>
              + Add slide
            </Button>
          )}
        </aside>

        <section className="flex-1 p-4 sm:p-8">
          {current ? (
            <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{slideLabel(current.type)}</h2>
                <div className="flex gap-1">
                  <Button variant="ghost" disabled={selected === 0} onClick={() => move(selected, selected - 1)} aria-label="Move slide up">
                    ↑
                  </Button>
                  <Button variant="ghost" disabled={selected === slides.length - 1} onClick={() => move(selected, selected + 1)} aria-label="Move slide down">
                    ↓
                  </Button>
                  <Button variant="danger" onClick={() => remove(selected)}>
                    Delete
                  </Button>
                </div>
              </div>
              <SlideEditor slide={current} onChange={(s) => edit(slides.map((x, i) => (i === selected ? s : x)))} />
            </div>
          ) : (
            <p className="text-center text-slate-500">No slides yet. Add one to get started.</p>
          )}
          <div className="mx-auto mt-3 max-w-2xl">
            <ErrorText>{error}</ErrorText>
          </div>
        </section>
      </div>
    </main>
  );
}

function SlideEditor({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  const set = (patch: Partial<Slide>) => onChange({ ...slide, ...patch });
  const setSettings = (patch: Slide["settings"]) => set({ settings: { ...slide.settings, ...patch } });

  return (
    <div className="flex flex-col gap-5">
      <label>
        <Label>Question</Label>
        <textarea
          value={slide.question}
          maxLength={LIMITS.question}
          rows={2}
          placeholder="Ask your audience something"
          onChange={(e) => set({ question: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </label>

      {(slide.type === "multiple_choice" || slide.type === "quiz_select") && (
        <ListEditor
          label={slide.type === "quiz_select" ? "Answers (select the correct one)" : "Options"}
          items={slide.options}
          addLabel="Add option"
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
          <ListEditor label="Statements" items={slide.options} addLabel="Add statement" onChange={(options) => set({ options })} min={1} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label>
              <Label>Scale</Label>
              <select
                value={slide.settings.scaleMax ?? 5}
                onChange={(e) => setSettings({ scaleMax: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>
                    1 to {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>Low label</Label>
              <Input value={slide.settings.minLabel ?? ""} maxLength={40} onChange={(e) => setSettings({ minLabel: e.target.value })} />
            </label>
            <label>
              <Label>High label</Label>
              <Input value={slide.settings.maxLabel ?? ""} maxLength={40} onChange={(e) => setSettings({ maxLabel: e.target.value })} />
            </label>
          </div>
        </>
      )}

      {slide.type === "quiz_type" && (
        <ListEditor
          label="Accepted answers (not case-sensitive)"
          items={slide.settings.acceptedAnswers ?? []}
          addLabel="Add accepted answer"
          onChange={(acceptedAnswers) => setSettings({ acceptedAnswers })}
          min={1}
        />
      )}

      {(slide.type === "quiz_select" || slide.type === "quiz_type") && (
        <label className="max-w-48">
          <Label>Time limit</Label>
          <select
            value={slide.settings.timeLimit ?? 20}
            onChange={(e) => setSettings({ timeLimit: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            {[10, 15, 20, 30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
      )}

      {(slide.type === "word_cloud" || slide.type === "open_ended") && (
        <label className="max-w-60">
          <Label>Answers per participant</Label>
          <select
            value={slide.settings.maxEntries ?? 1}
            onChange={(e) => setSettings({ maxEntries: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
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
  correctIndex,
  onCorrect,
}: {
  label: string;
  items: string[];
  addLabel: string;
  onChange: (items: string[]) => void;
  min: number;
  correctIndex?: number;
  onCorrect?: (i: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            {correctIndex !== undefined && (
              <input
                type="radio"
                name="correct"
                checked={correctIndex === i}
                onChange={() => onCorrect?.(i)}
                aria-label={`Mark answer ${i + 1} as correct`}
                className="size-5 accent-green-600"
              />
            )}
            <Input value={item} maxLength={LIMITS.option} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button variant="ghost" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${i + 1}`}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      {items.length < LIMITS.maxOptions && (
        <Button variant="ghost" className="mt-2 text-indigo-600" onClick={() => onChange([...items, ""])}>
          + {addLabel}
        </Button>
      )}
    </fieldset>
  );
}
