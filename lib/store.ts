import { randomInt, randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { uid } from "./slides";
import type { LeaderboardEntry, Pacing, Presentation, SessionStatus, Slide, SlideType } from "./types";

interface PresentationRow {
  id: string;
  title: string;
  code: string;
  token: string;
  current_index: number;
  pacing: Pacing;
  status: SessionStatus;
  show_results: number;
}

interface SlideRow {
  id: string;
  type: SlideType;
  question: string;
  options: string;
  settings: string;
  quiz_started_at: number | null;
}

export interface ResponseRow {
  id: number;
  voter_id: string;
  value: string;
  score: number;
}

export interface StoredPresentation extends Presentation {
  token: string;
  quizStartedAt: Record<string, number>;
}

function load(row: PresentationRow | undefined): StoredPresentation | null {
  if (!row) return null;
  const rows = db
    .prepare("SELECT id, type, question, options, settings, quiz_started_at FROM slides WHERE presentation_id = ? ORDER BY position")
    .all(row.id) as unknown as SlideRow[];
  const quizStartedAt: Record<string, number> = {};
  const slides = rows.map((r): Slide => {
    if (r.quiz_started_at != null) quizStartedAt[r.id] = r.quiz_started_at;
    return { id: r.id, type: r.type, question: r.question, options: JSON.parse(r.options), settings: JSON.parse(r.settings) };
  });
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    currentIndex: row.current_index,
    slides,
    pacing: row.pacing,
    status: row.status,
    showResults: row.show_results === 1,
    token: row.token,
    quizStartedAt,
  };
}

export function getPresentation(id: string) {
  return load(db.prepare("SELECT * FROM presentations WHERE id = ?").get(id) as unknown as PresentationRow | undefined);
}

export function getPresentationByCode(code: string) {
  return load(db.prepare("SELECT * FROM presentations WHERE code = ?").get(code) as unknown as PresentationRow | undefined);
}

function insertSlide(presentationId: string, position: number, slide: Slide) {
  db.prepare(
    "INSERT INTO slides (id, presentation_id, position, type, question, options, settings) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(slide.id, presentationId, position, slide.type, slide.question, JSON.stringify(slide.options), JSON.stringify(slide.settings));
}

export function createPresentation(title: string, pacing: Pacing, firstSlide: Slide) {
  let code: string;
  do code = String(randomInt(100000, 1000000));
  while (db.prepare("SELECT 1 FROM presentations WHERE code = ?").get(code));

  const id = uid();
  const token = randomUUID();
  transaction(() => {
    db.prepare(
      "INSERT INTO presentations (id, title, code, token, current_index, created_at, pacing, status) VALUES (?, ?, ?, ?, 0, ?, ?, 'draft')",
    ).run(id, title, code, token, Date.now(), pacing);
    insertSlide(id, 0, firstSlide);
  });
  return { id, code, token };
}

/** Replaces the slide list, keeping responses for slides that still exist with the same type. */
export function saveSlides(id: string, title: string, slides: Slide[]) {
  transaction(() => {
    db.prepare("UPDATE presentations SET title = ? WHERE id = ?").run(title, id);
    const existing = new Map(
      (db.prepare("SELECT id, type FROM slides WHERE presentation_id = ?").all(id) as unknown as { id: string; type: string }[]).map(
        (r) => [r.id, r.type],
      ),
    );
    const keep = new Set(slides.map((s) => s.id));
    for (const slideId of existing.keys()) {
      if (!keep.has(slideId)) db.prepare("DELETE FROM slides WHERE id = ?").run(slideId);
    }
    slides.forEach((slide, position) => {
      const previousType = existing.get(slide.id);
      if (previousType === undefined) return insertSlide(id, position, slide);
      if (previousType !== slide.type) resetSlide(slide.id);
      db.prepare("UPDATE slides SET position = ?, type = ?, question = ?, options = ?, settings = ? WHERE id = ? AND presentation_id = ?").run(
        position,
        slide.type,
        slide.question,
        JSON.stringify(slide.options),
        JSON.stringify(slide.settings),
        slide.id,
        id,
      );
    });
    db.prepare("UPDATE presentations SET current_index = MIN(current_index, ?) WHERE id = ?").run(Math.max(0, slides.length - 1), id);
  });
}

export function updateSettings(id: string, settings: { pacing?: Pacing; status?: SessionStatus; showResults?: boolean }) {
  if (settings.pacing) db.prepare("UPDATE presentations SET pacing = ? WHERE id = ?").run(settings.pacing, id);
  if (settings.status) db.prepare("UPDATE presentations SET status = ? WHERE id = ?").run(settings.status, id);
  if (settings.showResults !== undefined) {
    db.prepare("UPDATE presentations SET show_results = ? WHERE id = ?").run(settings.showResults ? 1 : 0, id);
  }
}

export function setCurrentIndex(id: string, index: number) {
  db.prepare("UPDATE presentations SET current_index = ? WHERE id = ?").run(index, id);
}

export function resetSlide(slideId: string) {
  db.prepare("DELETE FROM responses WHERE slide_id = ?").run(slideId);
  db.prepare("UPDATE slides SET quiz_started_at = NULL WHERE id = ?").run(slideId);
}

/** Starts (or restarts) a quiz question, clearing earlier answers. */
export function startQuiz(slideId: string, now: number) {
  transaction(() => {
    db.prepare("DELETE FROM responses WHERE slide_id = ?").run(slideId);
    db.prepare("UPDATE slides SET quiz_started_at = ? WHERE id = ?").run(now, slideId);
  });
}

export function responsesFor(slideId: string) {
  return db.prepare("SELECT id, voter_id, value, score FROM responses WHERE slide_id = ? ORDER BY id").all(slideId) as unknown as ResponseRow[];
}

export function responsesByVoter(slideId: string, voterId: string) {
  return db
    .prepare("SELECT id, voter_id, value, score FROM responses WHERE slide_id = ? AND voter_id = ? ORDER BY id")
    .all(slideId, voterId) as unknown as ResponseRow[];
}

export function addResponse(slideId: string, voterId: string, value: unknown, score: number, replace: boolean) {
  transaction(() => {
    if (replace) db.prepare("DELETE FROM responses WHERE slide_id = ? AND voter_id = ?").run(slideId, voterId);
    db.prepare("INSERT INTO responses (slide_id, voter_id, value, score, created_at) VALUES (?, ?, ?, ?, ?)").run(
      slideId,
      voterId,
      JSON.stringify(value),
      score,
      Date.now(),
    );
  });
}

/** One row per slide this participant answered: how many responses, and their quiz score. */
export function voterResponses(presentationId: string, voterId: string) {
  return db
    .prepare(
      `SELECT r.slide_id AS slideId, COUNT(*) AS count, MAX(r.score) AS score
       FROM responses r JOIN slides s ON s.id = r.slide_id
       WHERE s.presentation_id = ? AND r.voter_id = ?
       GROUP BY r.slide_id`,
    )
    .all(presentationId, voterId) as unknown as { slideId: string; count: number; score: number }[];
}

/** How many different people answered each slide (a word cloud can get several answers per person). */
export function respondentsBySlide(presentationId: string) {
  const rows = db
    .prepare(
      `SELECT r.slide_id AS slideId, COUNT(DISTINCT r.voter_id) AS people
       FROM responses r JOIN slides s ON s.id = r.slide_id
       WHERE s.presentation_id = ?
       GROUP BY r.slide_id`,
    )
    .all(presentationId) as unknown as { slideId: string; people: number }[];
  return Object.fromEntries(rows.map((r) => [r.slideId, r.people]));
}

/** People who answered at least one question, and those who answered all `slideCount` of them. */
export function progress(presentationId: string, slideCount: number) {
  return db
    .prepare(
      `SELECT COUNT(*) AS started, COALESCE(SUM(CASE WHEN answered >= ? THEN 1 ELSE 0 END), 0) AS completed
       FROM (
         SELECT r.voter_id, COUNT(DISTINCT r.slide_id) AS answered
         FROM responses r JOIN slides s ON s.id = r.slide_id
         WHERE s.presentation_id = ?
         GROUP BY r.voter_id
       )`,
    )
    .get(slideCount, presentationId) as unknown as { started: number; completed: number };
}

export function voterName(presentationId: string, voterId: string) {
  const row = db.prepare("SELECT name FROM voters WHERE presentation_id = ? AND voter_id = ?").get(presentationId, voterId) as
    | { name: string }
    | undefined;
  return row?.name ?? null;
}

export function setVoterName(presentationId: string, voterId: string, name: string) {
  db.prepare(
    "INSERT INTO voters (presentation_id, voter_id, name) VALUES (?, ?, ?) ON CONFLICT (presentation_id, voter_id) DO UPDATE SET name = excluded.name",
  ).run(presentationId, voterId, name);
}

export function leaderboard(presentationId: string, limit = 10) {
  return db
    .prepare(
      `SELECT v.name AS name, SUM(r.score) AS score
       FROM responses r
       JOIN slides s ON s.id = r.slide_id
       JOIN voters v ON v.presentation_id = s.presentation_id AND v.voter_id = r.voter_id
       WHERE s.presentation_id = ? AND s.type IN ('quiz_select', 'quiz_type')
       GROUP BY r.voter_id
       ORDER BY score DESC
       LIMIT ?`,
    )
    .all(presentationId, limit) as unknown as LeaderboardEntry[];
}
