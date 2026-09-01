CREATE TABLE IF NOT EXISTS qa_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  model TEXT,
  citations TEXT,
  latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_qa_logs_created_at ON qa_logs(created_at DESC);
