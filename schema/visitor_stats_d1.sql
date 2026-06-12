CREATE TABLE IF NOT EXISTS visitor_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitors (
  visitor_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_visit_counted_at TEXT,
  last_seen_date TEXT NOT NULL,
  ip TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_visitors (
  date TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  PRIMARY KEY (date, visitor_id)
);

CREATE TABLE IF NOT EXISTS daily_visitor_totals (
  date TEXT PRIMARY KEY,
  visitors INTEGER NOT NULL CHECK (visitors >= 0)
);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen_at ON visitors(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_daily_visitors_date ON daily_visitors(date);

INSERT OR IGNORE INTO visitor_meta(key, value) VALUES('total_visits', '0');
