import { optionLabel } from "./palette";
import { isQuiz } from "./slides";
import * as store from "./store";
import type { Slide } from "./types";

type Entry = { value: Record<string, unknown>; score: number };

/** One participant's answer to one slide, as spreadsheet text. */
function describe(slide: Slide, entries: Entry[]) {
  const label = (i: unknown) => (typeof i === "number" ? optionLabel(slide.options[i] ?? "", i) : "");
  const texts = () => entries.map((e) => String(e.value.text ?? "")).join(" | ");
  const [first] = entries;
  if (!first) return "";

  switch (slide.type) {
    case "multiple_choice":
      return label(first.value.choice);
    case "quiz_select":
      return `${label(first.value.choice)} (${first.score > 0 ? "correct" : "wrong"})`;
    case "quiz_type":
      return `${texts()} (${first.score > 0 ? "correct" : "wrong"})`;
    case "word_cloud":
    case "open_ended":
    case "qa":
      return texts();
    case "scales": {
      const ratings = Array.isArray(first.value.ratings) ? first.value.ratings : [];
      return slide.options.map((o, i) => `${optionLabel(o, i)}: ${ratings[i] ?? ""}`).join("; ");
    }
    case "ranking": {
      const order = Array.isArray(first.value.order) ? first.value.order : [];
      return order.map((option, position) => `${position + 1}. ${label(option)}`).join("; ");
    }
  }
}

/** Quotes a cell, and stops spreadsheet apps treating participant text as a formula. */
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Every participant's answers: one row per participant, one column per question. */
export function resultsCsv(p: store.StoredPresentation) {
  const names = store.voterNames(p.id);
  const byVoter = new Map<string, Map<string, Entry[]>>();
  for (const r of store.allResponses(p.id)) {
    let answers = byVoter.get(r.voterId);
    if (!answers) byVoter.set(r.voterId, (answers = new Map()));
    const list = answers.get(r.slideId) ?? [];
    list.push({ value: JSON.parse(r.value) as Record<string, unknown>, score: r.score });
    answers.set(r.slideId, list);
  }

  const quizSlides = p.slides.filter((s) => isQuiz(s.type));
  const header = ["Participant", ...p.slides.map((s, i) => `Q${i + 1}. ${s.question || "Untitled question"}`)];
  if (quizSlides.length) header.push("Quiz points");

  const rows = [...byVoter].map(([voterId, answers], n) => {
    const row = [names.get(voterId) ?? `Participant ${n + 1}`, ...p.slides.map((s) => describe(s, answers.get(s.id) ?? []))];
    if (quizSlides.length) {
      const points = quizSlides.reduce((sum, s) => sum + (answers.get(s.id)?.[0]?.score ?? 0), 0);
      row.push(String(points));
    }
    return row;
  });

  // The byte order mark tells Excel the file is UTF-8.
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function resultsFilename(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "presentation"}-results.csv`;
}
