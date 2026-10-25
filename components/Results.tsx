"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis } from "recharts";
import { optionColor, optionLabel, optionLetter } from "@/lib/palette";
import { normalize } from "@/lib/slides";
import type { LeaderboardEntry, Results as ResultsData, Slide } from "@/lib/types";
import { Button } from "./ui";
import { WordCloud } from "./WordCloud";

const LINE = "#2c3e68";

/** Splits a label into at most two lines of roughly `max` characters. */
function wrap(text: string, max = 18) {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  let first = "";
  while (words.length && (first + " " + words[0]).trim().length <= max) first = (first + " " + words.shift()).trim();
  if (!first) first = words.shift() ?? "";
  const rest = words.join(" ");
  return [first, rest.length > max ? `${rest.slice(0, max - 1)}…` : rest].filter(Boolean);
}

function OptionTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string; index: number } }) {
  if (!payload) return null;
  const lines = wrap(payload.value);
  return (
    <g transform={`translate(${x},${y + 14})`}>
      <text textAnchor="middle" fill="#e6eaf5" fontSize={18}>
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 8 : 22}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** Live results for one slide, styled for the dark presenter screen. `reveal` shows quiz answers; `onAnswered` lets the presenter tick off Q&A questions. */
export function Results({
  slide,
  results,
  reveal = false,
  onAnswered,
}: {
  slide: Slide;
  results: ResultsData;
  reveal?: boolean;
  onAnswered?: (questionId: number, answered: boolean) => void;
}) {
  switch (results.kind) {
    case "choices": {
      const data = slide.options.map((o, i) => ({ label: `${optionLetter(i)}  ${optionLabel(o, i)}`, count: results.counts[i] ?? 0 }));
      const correct = slide.settings.correctIndex;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 44, right: 8, left: 8, bottom: 30 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: LINE }} interval={0} tick={<OptionTick />} />
            <Bar dataKey="count" radius={[12, 12, 0, 0]} maxBarSize={170} animationDuration={500}>
              {data.map((_, i) => (
                <Cell key={i} fill={reveal ? (i === correct ? "#1fa39a" : LINE) : optionColor(i)} />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                style={{ fontSize: 30, fontWeight: 800, fill: "#ffffff", fontFamily: "var(--font-heading)" }}
              />
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
        <div className="grid h-full auto-rows-min grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {results.entries.map((e) => (
            <p key={e.id} className="rounded-2xl bg-night-raised p-5 text-xl leading-snug text-white">
              {e.text}
            </p>
          ))}
        </div>
      );

    case "scales": {
      const max = slide.settings.scaleMax ?? 5;
      return (
        <div className="flex h-full flex-col justify-center gap-9">
          {slide.options.map((statement, i) => {
            const avg = results.averages[i];
            const pct = avg == null ? 0 : ((avg - 1) / (max - 1)) * 100;
            return (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-6">
                  <p className="text-2xl text-white">{optionLabel(statement, i)}</p>
                  <p className="font-display text-4xl font-extrabold tabular-nums text-marigold">{avg == null ? "–" : avg.toFixed(1)}</p>
                </div>
                <div className="relative mt-3 h-3 rounded-full bg-night-line">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-marigold transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex justify-between text-base text-haze">
            <span>1 = {slide.settings.minLabel || "lowest"}</span>
            <span>
              {max} = {slide.settings.maxLabel || "highest"}
            </span>
          </div>
        </div>
      );
    }

    case "ranking": {
      if (!results.total) return <Waiting />;
      const n = slide.options.length;
      const ranked = slide.options
        .map((o, i) => ({ i, label: optionLabel(o, i), avg: results.averages[i] }))
        .sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity));
      return (
        <ol className="flex h-full flex-col justify-center gap-5 overflow-y-auto pr-1">
          {ranked.map((r, position) => {
            // Ranked first by everyone fills the bar; ranked last by everyone leaves it empty.
            const pct = r.avg == null || n < 2 ? 0 : ((n - r.avg) / (n - 1)) * 100;
            return (
              <li key={r.i} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-5">
                <span
                  className={`grid size-14 place-items-center rounded-2xl font-display text-2xl font-extrabold ${
                    position === 0 ? "bg-marigold text-night" : "bg-night-raised text-white"
                  }`}
                >
                  {position + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-2xl text-white">{r.label}</p>
                  <div className="mt-2 h-3 rounded-full bg-night-line">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, 2)}%`, background: optionColor(r.i) }} />
                  </div>
                </div>
                <p className="w-32 text-right text-base text-haze">
                  average place{" "}
                  <strong className="block font-display text-2xl font-bold tabular-nums text-white">{r.avg == null ? "–" : r.avg.toFixed(1)}</strong>
                </p>
              </li>
            );
          })}
        </ol>
      );
    }

    case "qa":
      if (!results.questions.length) return <Waiting>No questions yet</Waiting>;
      return (
        <ol className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
          {results.questions.map((q) => (
            <li key={q.id} className={`flex items-center gap-5 rounded-2xl p-5 ${q.answered ? "bg-night-raised/40" : "bg-night-raised"}`}>
              <div className="w-16 shrink-0 text-center">
                <p className={`font-display text-3xl font-extrabold tabular-nums ${q.answered ? "text-haze" : "text-marigold"}`}>{q.votes}</p>
                <p className="text-sm text-haze">{q.votes === 1 ? "upvote" : "upvotes"}</p>
              </div>
              <p className={`min-w-0 flex-1 break-words text-2xl leading-snug ${q.answered ? "text-haze" : "text-white"}`}>{q.text}</p>
              {q.answered && <span className="shrink-0 rounded-full bg-teal/20 px-3 py-1 text-sm font-bold text-[#7fe0d8]">Answered</span>}
              {onAnswered && (
                <Button variant="onNight" className="shrink-0" onClick={() => onAnswered(q.id, !q.answered)}>
                  {q.answered ? "Undo" : "Mark answered"}
                </Button>
              )}
            </li>
          ))}
        </ol>
      );

    case "quizText": {
      const accepted = new Set((slide.settings.acceptedAnswers ?? []).filter(Boolean).map(normalize));
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
          <p className="font-display text-7xl font-extrabold tabular-nums text-white">
            {results.correct}
            <span className="text-haze"> / {results.total}</span>
          </p>
          <p className="text-xl text-haze">got it right</p>
          {reveal && (
            <>
              <p className="text-2xl text-white">
                The answer: <strong className="text-marigold">{(slide.settings.acceptedAnswers ?? []).filter(Boolean).join(" or ")}</strong>
              </p>
              <ul className="flex max-w-3xl flex-wrap justify-center gap-2">
                {results.answers.map((a) => (
                  <li
                    key={a.text}
                    className={`rounded-full px-4 py-1.5 text-base font-bold ${
                      accepted.has(normalize(a.text)) ? "bg-teal/25 text-[#9ff0e8]" : "bg-night-raised text-haze"
                    }`}
                  >
                    {a.text} ({a.count})
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

function Waiting({ children = "No answers yet" }: { children?: string }) {
  return <div className="flex h-full items-center justify-center text-2xl text-haze">{children}</div>;
}

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="rounded-3xl bg-night-raised p-6">
      <h3 className="font-display text-xl font-bold text-white">Leaderboard</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-haze">No points yet</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.slice(0, 5).map((e, i) => (
            <li key={`${e.name}-${i}`} className="flex items-center gap-3 text-lg text-white">
              <span className={`grid size-8 place-items-center rounded-full font-display font-extrabold ${i === 0 ? "bg-marigold text-night" : "bg-night-line"}`}>
                {i + 1}
              </span>
              <span className="flex-1 truncate">{e.name}</span>
              <span className="font-display font-bold tabular-nums">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
