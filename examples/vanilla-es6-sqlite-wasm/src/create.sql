CREATE TABLE IF NOT EXISTS todos (
	title TEXT NOT NULL,
	completed INTEGER NOT NULL DEFAULT 0,
	CHECK (title <> ''), -- empty titles are not alliowed in TodoMVC
	CHECK (completed IN (0, 1)) -- SQLite uses 0 and 1 for booleans, let check they are
);

-- we will need to filter on completed so we create an index
CREATE INDEX IF NOT EXISTS completed_index ON todos (completed);
