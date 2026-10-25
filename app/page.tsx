"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { type SavedPresentation, call, errorMessage, forgetPresentation, savePresentation, savedPresentations } from "@/lib/client";
import { LIMITS, formatCode } from "@/lib/slides";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [mine, setMine] = useState<SavedPresentation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMine(savedPresentations()), []);

  const digits = code.replace(/\D/g, "");

  function join(e: FormEvent) {
    e.preventDefault();
    if (digits.length === 6) router.push(`/vote/${digits}`);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await call<{ id: string; code: string; token: string }>("presentation:create", { title });
      savePresentation({ ...p, title: title.trim() || "Untitled presentation" });
      router.push(`/edit/${p.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:py-20">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Live Poll</h1>
        <p className="mt-2 text-slate-600">Polls, word clouds and quizzes your audience answers from their phones.</p>
      </header>

      <form onSubmit={join} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold">Join a presentation</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="123 456"
            aria-label="Presentation code"
            value={formatCode(digits)}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl font-semibold tracking-widest sm:text-left"
          />
          <Button type="submit" disabled={digits.length !== 6} className="sm:w-32">
            Join
          </Button>
        </div>
      </form>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold">Create a presentation</h2>
        <form onSubmit={create} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <Label>Title</Label>
            <Input value={title} maxLength={LIMITS.title} placeholder="Team retro" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy} className="sm:w-32">
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>

        {mine.length > 0 && (
          <>
            <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Your presentations</h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {mine.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-sm text-slate-500">Code {formatCode(p.code)}</p>
                  </div>
                  <Link href={`/edit/${p.id}`} className="text-sm font-semibold text-indigo-600 hover:underline">
                    Edit
                  </Link>
                  <Link href={`/present/${p.id}`} className="text-sm font-semibold text-indigo-600 hover:underline">
                    Present
                  </Link>
                  <button
                    className="text-sm text-slate-400 hover:text-red-600"
                    onClick={() => {
                      forgetPresentation(p.id);
                      setMine(savedPresentations());
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-400">Saved in this browser. Removing hides it here; it stays on the server.</p>
          </>
        )}
      </section>
    </main>
  );
}
