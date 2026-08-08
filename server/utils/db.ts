import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { getDataPaths, getServerConfig } from './config'

let database: Database.Database | undefined

export function getDatabase(): Database.Database {
  if (database?.open) return database

  const config = getServerConfig()
  const paths = getDataPaths()
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true })
  mkdirSync(dirname(config.databasePath), { recursive: true })

  database = new Database(config.databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  database.pragma('synchronous = NORMAL')
  migrate(database)
  return database
}

function migrate(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version >= 1) return

  db.exec(`
    CREATE TABLE auth_credentials (
      kind TEXT PRIMARY KEY CHECK (kind IN ('admin', 'viewer')),
      password_hash TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE auth_sessions (
      token_hash TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('admin', 'viewer')),
      credential_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT
    );
    CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

    CREATE TABLE decks (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      active_revision_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE deck_revisions (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      source_sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'building', 'ready', 'failed')),
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    );
    CREATE INDEX deck_revisions_deck_idx ON deck_revisions(deck_id, created_at DESC);

    CREATE TABLE build_jobs (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL UNIQUE REFERENCES deck_revisions(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'building', 'ready', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TEXT NOT NULL,
      locked_at TEXT,
      worker_id TEXT,
      last_error TEXT
    );
    CREATE INDEX build_jobs_status_idx ON build_jobs(status, available_at);

    CREATE TABLE worker_heartbeats (
      worker_id TEXT PRIMARY KEY,
      last_seen_at TEXT NOT NULL,
      current_job_id TEXT
    );

    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      outcome TEXT NOT NULL,
      request_id TEXT,
      ip_hash TEXT,
      created_at TEXT NOT NULL,
      details TEXT
    );
    CREATE INDEX audit_events_created_idx ON audit_events(created_at DESC);

    PRAGMA user_version = 1;
  `)
}

export function closeDatabase(): void {
  database?.close()
  database = undefined
}

export function nowIso(): string {
  return new Date().toISOString()
}
