import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// On a host, point DATA_DIR at a persistent volume so data survives redeploys.
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "live-poll.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS presentations (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    code          TEXT NOT NULL UNIQUE,
    token         TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS slides (
    id              TEXT PRIMARY KEY,
    presentation_id TEXT NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL,
    type            TEXT NOT NULL,
    question        TEXT NOT NULL,
    options         TEXT NOT NULL,
    settings        TEXT NOT NULL,
    quiz_started_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS responses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slide_id   TEXT NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    voter_id   TEXT NOT NULL,
    value      TEXT NOT NULL,
    score      INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS responses_by_slide ON responses(slide_id, voter_id);

  -- Upvotes on Q&A questions, which are stored as responses.
  CREATE TABLE IF NOT EXISTS qa_votes (
    response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    voter_id    TEXT NOT NULL,
    PRIMARY KEY (response_id, voter_id)
  );

  CREATE TABLE IF NOT EXISTS voters (
    presentation_id TEXT NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
    voter_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    PRIMARY KEY (presentation_id, voter_id)
  );
`);

// Columns added after the first release; older databases get them here.
const presentationColumns = new Set(
  (db.prepare("PRAGMA table_info(presentations)").all() as unknown as { name: string }[]).map((c) => c.name),
);
if (!presentationColumns.has("pacing")) db.exec("ALTER TABLE presentations ADD COLUMN pacing TEXT NOT NULL DEFAULT 'presenter'");
if (!presentationColumns.has("status")) db.exec("ALTER TABLE presentations ADD COLUMN status TEXT NOT NULL DEFAULT 'open'");
if (!presentationColumns.has("show_results")) db.exec("ALTER TABLE presentations ADD COLUMN show_results INTEGER NOT NULL DEFAULT 0");
const responseColumns = new Set((db.prepare("PRAGMA table_info(responses)").all() as unknown as { name: string }[]).map((c) => c.name));
if (!responseColumns.has("answered")) db.exec("ALTER TABLE responses ADD COLUMN answered INTEGER NOT NULL DEFAULT 0");

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
