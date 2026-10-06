CREATE TABLE IF NOT EXISTS planting_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id INTEGER,
  field_name TEXT NOT NULL,
  heading TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  planting_date TEXT NOT NULL,
  variety TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
