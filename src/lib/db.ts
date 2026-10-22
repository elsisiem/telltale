import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./vault";

// One query interface over two backends: Neon serverless Postgres when DATABASE_URL is set,
// otherwise PGlite (Postgres compiled to WASM) persisted under .telltale/db.

type Row = Record<string, unknown>;
export type Db = { query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };

const SCHEMA = `
create table if not exists disclosures (
  id text primary key,
  created_at timestamptz not null default now(),
  recipient_host text not null,
  recipient_domain text not null,
  broker_ids jsonb not null default '[]',
  risk_level text not null,
  tag_code text not null unique,
  alias_email text,
  fields jsonb not null,
  receipt jsonb,
  purpose text,
  run_id text
);
alter table disclosures add column if not exists run_id text;
create table if not exists messages (
  id text primary key,
  received_at timestamptz not null,
  to_addr text not null,
  from_addr text not null,
  from_domain text,
  subject text,
  snippet text,
  disclosure_id text,
  classification text not null,
  replay boolean not null default false
);
create table if not exists leaks (
  id text primary key,
  detected_at timestamptz not null default now(),
  disclosure_id text not null,
  message_id text not null,
  sender_domain text not null,
  sender_broker_ids jsonb not null default '[]',
  evidence jsonb not null
);
create table if not exists requests (
  id text primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  target_domain text not null,
  target_broker_id text,
  tag_code text,
  channel text not null,
  sent_at timestamptz,
  due_at timestamptz,
  body text not null,
  status text not null
);
create table if not exists complaints (
  id text primary key,
  created_at timestamptz not null default now(),
  leak_id text,
  request_id text,
  body text not null,
  status text not null default 'draft'
);
create table if not exists scans (
  id text primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb
);
create table if not exists scan_results (
  scan_id text not null,
  broker_id text not null,
  url text not null,
  status text not null,
  signals jsonb not null default '[]',
  checked_at timestamptz not null default now(),
  primary key (scan_id, broker_id, url)
);
`;

let dbPromise: Promise<Db> | null = null;

async function open(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("@neondatabase/serverless");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db: Db = { query: (sql, params) => pool.query(sql, params) as never };
    await db.query(SCHEMA);
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.TELLTALE_DB_DIR ?? path.join(DATA_DIR, "db");
  if (dir !== "memory://") fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = dir === "memory://" ? new PGlite() : new PGlite(dir);
  await lite.exec(SCHEMA);
  return { query: (sql, params) => lite.query(sql, params) as never };
}

export function db(): Promise<Db> {
  dbPromise ??= open();
  return dbPromise;
}

export function _resetDb() {
  dbPromise = null;
}
