CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    month TEXT NOT NULL,
    status TEXT NOT NULL,
    company TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    company TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    company TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL
);

-- Enable RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow public access for now (since no user auth is implemented yet)
CREATE POLICY "Allow public all contracts" ON contracts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all events" ON events FOR ALL USING (true) WITH CHECK (true);
