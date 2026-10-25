import type { Slide, SlideSettings, SlideType } from "./types";

export const LIMITS = {
  title: 80,
  question: 200,
  option: 80,
  maxOptions: 8,
  maxSlides: 50,
  wordCloud: 25,
  openEnded: 200,
  quizText: 60,
  nickname: 24,
} as const;

export const SLIDE_TYPES: { type: SlideType; label: string; hint: string }[] = [
  { type: "multiple_choice", label: "Multiple choice", hint: "Vote for one option" },
  { type: "word_cloud", label: "Word cloud", hint: "Short answers, most popular grow" },
  { type: "open_ended", label: "Open ended", hint: "Free-text answers" },
  { type: "scales", label: "Scales", hint: "Rate statements on a scale" },
  { type: "quiz_select", label: "Quiz: select answer", hint: "Timed and scored" },
  { type: "quiz_type", label: "Quiz: type answer", hint: "Timed, typed answer" },
];

export const slideLabel = (type: SlideType) => SLIDE_TYPES.find((t) => t.type === type)?.label ?? type;

export const isQuiz = (type: SlideType) => type === "quiz_select" || type === "quiz_type";

export const DEFAULT_TIME_LIMIT = 20;

export const defaultMaxEntries = (type: SlideType) => (type === "word_cloud" ? 3 : 1);

/** Random hex id. Uses getRandomValues because randomUUID needs a secure context, and phones join over plain http. */
export function uid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const formatCode = (code: string) => code.replace(/(\d{3})(?=\d)/g, "$1 ");

export function defaultSlide(type: SlideType): Slide {
  const id = uid();
  switch (type) {
    case "multiple_choice":
      return { id, type, question: "", options: ["Option 1", "Option 2", "Option 3"], settings: {} };
    case "word_cloud":
      return { id, type, question: "", options: [], settings: { maxEntries: 3 } };
    case "open_ended":
      return { id, type, question: "", options: [], settings: { maxEntries: 1 } };
    case "scales":
      return {
        id,
        type,
        question: "",
        options: ["Statement 1", "Statement 2"],
        settings: { scaleMax: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      };
    case "quiz_select":
      return {
        id,
        type,
        question: "",
        options: ["Answer A", "Answer B", "Answer C", "Answer D"],
        settings: { correctIndex: 0, timeLimit: DEFAULT_TIME_LIMIT },
      };
    case "quiz_type":
      return { id, type, question: "", options: [], settings: { acceptedAnswers: [""], timeLimit: 30 } };
  }
}

/** Comparison key for free text: case- and whitespace-insensitive. */
export const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

export function sanitizeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

const intIn = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Validates a slide coming from the editor; returns null if it can't be used at all. */
export function sanitizeSlide(input: unknown): Slide | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Record<string, unknown>;
  const type = SLIDE_TYPES.find((t) => t.type === s.type)?.type;
  if (!type) return null;

  const id = typeof s.id === "string" && /^[a-f0-9]{32}$/.test(s.id) ? s.id : uid();
  const raw = (s.settings && typeof s.settings === "object" ? s.settings : {}) as Record<string, unknown>;
  const hasOptions = type === "multiple_choice" || type === "quiz_select" || type === "scales";
  const options = hasOptions
    ? (Array.isArray(s.options) ? s.options : []).slice(0, LIMITS.maxOptions).map((o) => sanitizeText(o, LIMITS.option))
    : [];

  const settings: SlideSettings = {};
  switch (type) {
    case "word_cloud":
    case "open_ended":
      settings.maxEntries = intIn(raw.maxEntries, 1, 10, defaultMaxEntries(type));
      break;
    case "scales":
      settings.scaleMax = intIn(raw.scaleMax, 3, 10, 5);
      settings.minLabel = sanitizeText(raw.minLabel, 40);
      settings.maxLabel = sanitizeText(raw.maxLabel, 40);
      break;
    case "quiz_select":
      settings.correctIndex = intIn(raw.correctIndex, 0, Math.max(0, options.length - 1), 0);
      settings.timeLimit = intIn(raw.timeLimit, 5, 300, DEFAULT_TIME_LIMIT);
      break;
    case "quiz_type":
      settings.acceptedAnswers = (Array.isArray(raw.acceptedAnswers) ? raw.acceptedAnswers : [])
        .slice(0, LIMITS.maxOptions)
        .map((a) => sanitizeText(a, LIMITS.quizText));
      settings.timeLimit = intIn(raw.timeLimit, 5, 300, DEFAULT_TIME_LIMIT);
      break;
  }

  return { id, type, question: sanitizeText(s.question, LIMITS.question), options, settings };
}
