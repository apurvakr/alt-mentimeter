"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis } from "recharts";
import type { LeaderboardEntry, Results as ResultsData, Slide } from "@/lib/types";
import { normalize } from "@/lib/slides";
import { WordCloud } from "./WordCloud";

const BAR_COLORS = ["#4f46e5", "#0891b2", "#db2777", "#ea580c", "#16a34a", "#7c3aed", "#ca8a04", "#475569"];

export const optionLabel = (option: string, i: number) => option || `Option ${i + 1}`;

/** Live results for one slide. `reveal` shows quiz answers. */
export function Results({ slide, results, reveal = false }: { slide: Slide; results: ResultsData; reveal?: boolean }) {
  switch (results.kind) {
    case "choices": {
      const data = slide.options.map((o, i) => ({ label: optionLabel(o, i), count: results.counts[i] ?? 0 }));
      const correct = slide.settings.correctIndex;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 36, right: 8, left: 8, bottom: 8 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#cbd5e1" }} interval={0} tick={{ fontSize: 18, fill: "#334155" }} />
            <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={160} animationDuration={400}>
              {data.map((_, i) => (
                <Cell key={i} fill={reveal ? (i === correct ? "#16a34a" : "#cbd5e1") : BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
              <LabelList dataKey="count" position="top" style={{ fontSize: 24, fontWeight: 700, fill: "#0f172a" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "words":
      return <WordCloud words={results.words} />;

    case "texts":
      if (!results.entries.length) return <Waiting />;
      return (
        <div className="grid h-full auto-rows-min grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {results.entries.map((e) => (
            <p key={e.id} className="rounded-xl bg-white p-4 text-lg shadow-sm ring-1 ring-slate-200">
              {e.text}
            </p>
          ))}
        </div>
      );

    case "scales": {
      const max = slide.settings.scaleMax ?? 5;
      return (
        <div className="flex h-full flex-col justify-center gap-8 px-2">
          {slide.options.map((statement, i) => {
            const avg = results.averages[i];
            const pct = avg == null ? 0 : ((avg - 1) / (max - 1)) * 100;
            return (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-xl font-medium">{optionLabel(statement, i)}</p>
                  <p className="text-2xl font-bold tabular-nums text-indigo-600">{avg == null ? "–" : avg.toFixed(1)}</p>
                </div>
                <div className="relative mt-3 h-3 rounded-full bg-slate-200">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex justify-between text-sm text-slate-500">
            <span>1 · {slide.settings.minLabel}</span>
            <span>
              {slide.settings.maxLabel} · {max}
            </span>
          </div>
        </div>
      );
    }

    case "quizText": {
      const accepted = new Set((slide.settings.acceptedAnswers ?? []).filter(Boolean).map(normalize));
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6">
          <p className="text-5xl font-bold tabular-nums">
            {results.correct}
            <span className="text-slate-400"> / {results.total}</span>
          </p>
          <p className="text-lg text-slate-600">answered correctly</p>
          {reveal && (
            <>
              <p className="text-xl">
                Answer: <strong>{[...(slide.settings.acceptedAnswers ?? [])].filter(Boolean).join(" / ")}</strong>
              </p>
              <ul className="flex flex-wrap justify-center gap-2">
                {results.answers.map((a) => (
                  <li
                    key={a.text}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${accepted.has(normalize(a.text)) ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"}`}
                  >
                    {a.text} · {a.count}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      );
    }
  }
}

function Waiting() {
  return <div className="flex h-full items-center justify-center text-xl text-slate-400">Waiting for answers…</div>;
}

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Leaderboard</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-slate-400">No points yet</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {entries.slice(0, 5).map((e, i) => (
            <li key={`${e.name}-${i}`} className="flex items-center gap-3 text-lg">
              <span className="w-6 text-right font-bold text-slate-400">{i + 1}</span>
              <span className="flex-1 truncate font-medium">{e.name}</span>
              <span className="font-bold tabular-nums">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
