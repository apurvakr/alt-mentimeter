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

  CREATE TABLE IF NOT EXISTS voters (
    presentation_id TEXT NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
    voter_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    PRIMARY KEY (presentation_id, voter_id)
  );
`);

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
