import { DEFAULT_TIME_LIMIT, LIMITS, defaultMaxEntries, normalize } from "./slides";
import type { ResponseRow } from "./store";
import type { PublicSlide, QuizWindow, Results, Slide } from "./types";

/** Answers arriving this soon after the timer ends still count, to absorb network lag. */
const GRACE_MS = 1000;

export function quizWindow(slide: Slide, startedAt: number | undefined): QuizWindow | null {
  if (startedAt == null) return null;
  return { startedAt, endsAt: startedAt + (slide.settings.timeLimit ?? DEFAULT_TIME_LIMIT) * 1000 };
}

export function publicSlide(slide: Slide): PublicSlide {
  const { correctIndex: _c, acceptedAnswers: _a, ...settings } = slide.settings;
  return { ...slide, settings };
}

const isIndex = (value: unknown, length: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length;

type Evaluation = { error: string } | { value: unknown; score: number; replace: boolean };

/** Validates one participant response and scores it. `replace` means it overwrites their earlier answer. */
export function evaluate(slide: Slide, raw: unknown, ctx: { mine: ResponseRow[]; window: QuizWindow | null; now: number }): Evaluation {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = typeof v.text === "string" ? v.text.trim().replace(/\s+/g, " ") : "";

  switch (slide.type) {
    case "multiple_choice":
      if (!isIndex(v.choice, slide.options.length)) return { error: "Pick one of the options" };
      return { value: { choice: v.choice }, score: 0, replace: true };

    case "word_cloud":
    case "open_ended": {
      const limit = slide.type === "word_cloud" ? LIMITS.wordCloud : LIMITS.openEnded;
      if (!text) return { error: "Type something first" };
      if (text.length > limit) return { error: `Keep it to ${limit} characters` };
      if (ctx.mine.length >= (slide.settings.maxEntries ?? defaultMaxEntries(slide.type))) {
        return { error: "You've sent the maximum number of answers" };
      }
      return { value: { text }, score: 0, replace: false };
    }

    case "scales": {
      const max = slide.settings.scaleMax ?? 5;
      const ratings = v.ratings;
      const valid =
        Array.isArray(ratings) &&
        ratings.length === slide.options.length &&
        ratings.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max);
      if (!valid) return { error: "Rate every statement" };
      return { value: { ratings }, score: 0, replace: true };
    }

    case "quiz_select":
    case "quiz_type": {
      const { window, now } = ctx;
      if (!window) return { error: "The presenter hasn't started this question yet" };
      if (now > window.endsAt + GRACE_MS) return { error: "Time's up!" };
      if (ctx.mine.length) return { error: "You've already answered" };

      let correct: boolean;
      let value: unknown;
      if (slide.type === "quiz_select") {
        if (!isIndex(v.choice, slide.options.length)) return { error: "Pick one of the options" };
        correct = v.choice === slide.settings.correctIndex;
        value = { choice: v.choice };
      } else {
        if (!text) return { error: "Type an answer first" };
        if (text.length > LIMITS.quizText) return { error: `Keep it to ${LIMITS.quizText} characters` };
        correct = (slide.settings.acceptedAnswers ?? []).some((a) => a && normalize(a) === normalize(text));
        value = { text };
      }
      // Correct answers earn 500–1000 points; faster answers earn more.
      const remaining = Math.max(0, window.endsAt - now) / (window.endsAt - window.startedAt);
      return { value, score: correct ? Math.round(500 + 500 * remaining) : 0, replace: false };
    }
  }
}

function tally(texts: string[], limit: number) {
  const counts = new Map<string, { text: string; count: number }>();
  for (const text of texts) {
    const key = normalize(text);
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { text, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function aggregate(slide: Slide, rows: ResponseRow[]): Results {
  const values = rows.map((r) => JSON.parse(r.value) as Record<string, unknown>);
  const texts = values.map((v) => (typeof v.text === "string" ? v.text : ""));

  switch (slide.type) {
    case "multiple_choice":
    case "quiz_select": {
      const counts = slide.options.map(() => 0);
      for (const v of values) if (isIndex(v.choice, counts.length)) counts[v.choice]++;
      return { kind: "choices", counts, total: rows.length };
    }
    case "word_cloud":
      return { kind: "words", words: tally(texts, 100), total: rows.length };
    case "open_ended":
      return {
        kind: "texts",
        entries: rows.map((r, i) => ({ id: r.id, text: texts[i] })).reverse().slice(0, 100),
        total: rows.length,
      };
    case "scales": {
      const sums = slide.options.map(() => 0);
      let n = 0;
      for (const v of values) {
        if (!Array.isArray(v.ratings) || v.ratings.length !== sums.length) continue;
        v.ratings.forEach((r, i) => (sums[i] += Number(r)));
        n++;
      }
      return { kind: "scales", averages: sums.map((s) => (n ? s / n : null)), total: n };
    }
    case "quiz_type":
      return {
        kind: "quizText",
        correct: rows.filter((r) => r.score > 0).length,
        answers: tally(texts, 8),
        total: rows.length,
      };
  }
}
