CREATE TABLE IF NOT EXISTS todos (
	id INTEGER PRIMARY KEY,
	title TEXT NOT NULL,
	completed INTEGER NOT NULL DEFAULT 0,
	CHECK (title <> ''), -- empty titles are not alliowed in TodoMVC
	CHECK (completed IN (0, 1)) -- SQLite uses 0 and 1 for booleans, let check they are
);

-- we will need to filter on completed so we create an index
CREATE INDEX IF NOT EXISTS completed_index ON todos (completed);

-- we will need to count items often so we create a view
CREATE VIEW IF NOT EXISTS todo_counts AS 
	SELECT
		(SELECT COUNT() FROM todos WHERE completed = 0) as active_count,
		(SELECT COUNT() FROM todos) as total_count;
