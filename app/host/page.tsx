"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { PacingChoice } from "@/components/PacingChoice";
import { Button, ErrorText, Input, Label, Logo, StatusPill } from "@/components/ui";
import { type SavedPresentation, call, errorMessage, forgetPresentation, savePresentation, savedPresentations } from "@/lib/client";
import { LIMITS, formatCode } from "@/lib/slides";
import type { Pacing, PresentationSummary } from "@/lib/types";

type Row = SavedPresentation & { summary?: PresentationSummary };

/** The host's home: create presentations and get back to the ones made in this browser. */
export default function HostDashboard() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pacing, setPacing] = useState<Pacing>("self");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const saved = savedPresentations();
    setRows(saved);
    if (!saved.length) return;
    try {
      const summaries = await call<PresentationSummary[]>("host:summaries", { items: saved.map(({ id, token }) => ({ id, token })) });
      setRows(saved.map((p) => ({ ...p, summary: summaries.find((s) => s.id === p.id) })));
    } catch {
      // The list still works from what this browser remembers.
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await call<{ id: string; code: string; token: string }>("presentation:create", { title, pacing });
      savePresentation({ ...p, title: title.trim() || "Untitled presentation" });
      router.push(`/edit/${p.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Logo href="/host" />
          <Link href="/" className="text-sm font-bold text-muted hover:text-night">
            Join as a participant
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <section aria-labelledby="yours">
          <h1 id="yours" className="font-display text-4xl font-extrabold tracking-tight">
            Your presentations
          </h1>
          {rows === null ? null : rows.length === 0 ? (
            <p className="mt-4 max-w-md text-lg text-muted">Nothing here yet. Create your first presentation and it will show up here.</p>
          ) : (
            <ul className="mt-6 divide-y divide-line overflow-hidden rounded-3xl bg-white ring-1 ring-line">
              {rows.map((p) => (
                <PresentationRow
                  key={p.id}
                  row={p}
                  onRemove={() => {
                    forgetPresentation(p.id);
                    setRows((r) => r?.filter((x) => x.id !== p.id) ?? null);
                  }}
                />
              ))}
            </ul>
          )}
          {rows && rows.length > 0 && <p className="mt-3 text-sm text-muted">Only presentations created in this browser are listed.</p>}
        </section>

        <section aria-labelledby="new" className="rounded-3xl bg-white p-6 ring-1 ring-line">
          <h2 id="new" className="font-display text-2xl font-bold tracking-tight">
            New presentation
          </h2>
          <form onSubmit={create} className="mt-5 flex flex-col gap-5">
            <label>
              <Label>Title</Label>
              <Input value={title} maxLength={LIMITS.title} placeholder="Team offsite feedback" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <PacingChoice value={pacing} onChange={setPacing} stacked />
            <Button type="submit" disabled={busy} className="py-3">
              {busy ? "Creating…" : "Create and add questions"}
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>
        </section>
      </main>
    </div>
  );
}

function PresentationRow({ row, onRemove }: { row: Row; onRemove: () => void }) {
  const s = row.summary;
  if (s?.missing) {
    return (
      <li className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-muted">{row.title}</p>
          <p className="text-sm text-muted">No longer on the server. It was removed when the app restarted.</p>
        </div>
        <Button variant="ghost" onClick={onRemove}>
          Remove from list
        </Button>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="truncate text-lg font-bold">{s?.title ?? row.title}</p>
          {s && <StatusPill status={s.status} />}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          Code {formatCode(row.code)}
          {s && (
            <>
              , {s.slides} {s.slides === 1 ? "question" : "questions"}, {s.pacing === "self" ? "self-paced" : "presenter-paced"}
              {s.started > 0 && `, ${s.started} ${s.started === 1 ? "person has" : "people have"} answered`}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/edit/${row.id}`} className="rounded-full px-4 py-2 text-sm font-bold ring-1 ring-line hover:ring-night/40">
          Edit
        </Link>
        <Link href={`/present/${row.id}`} className="rounded-full bg-night px-4 py-2 text-sm font-bold text-white hover:bg-night-raised">
          Present
        </Link>
        <button onClick={onRemove} className="px-2 py-2 text-sm text-muted hover:text-[#b3203f]" aria-label={`Remove ${row.title} from this list`}>
          Remove
        </button>
      </div>
    </li>
  );
}
