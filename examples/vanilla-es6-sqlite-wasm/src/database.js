export default class TodoDatabase {
	/**
	 * @param  {!Database} sqlDatabase A Database instance
	 */
	constructor(db) {
		this.db = db;

		this.db.exec(`
		CREATE TABLE IF NOT EXISTS todos (
			id INTEGER PRIMARY KEY,
			title TEXT NOT NULL,
			completed INTEGER NOT NULL DEFAULT 0,
			CHECK (title <> ''),
			CHECK (completed IN (0, 1)) -- SQLite uses integers for booleans
			)`);
		// we will need to filter on completed so we create an index
		this.db.exec(`
		CREATE INDEX IF NOT EXISTS completed_index ON todos (completed)`);

		const dispatchChangedCompletedCount = () =>
			this._dispatchEvent({
				type: "changedCompletedCount",
				...this.getStatusCounts(),
			});

		this.db.createFunction(
			"inserted_item_fn",
			(_ctxPtr, id, title, completed) => {
				this._dispatchEvent({
					type: "insertedItem",
					id,
					title,
					completed: !!completed,
				});
				dispatchChangedCompletedCount();
			}
		);

		this.db.createFunction("deleted_item_fn", (_ctxPtr, id) => {
			this._dispatchEvent({ type: "deletedItem", id });
			dispatchChangedCompletedCount();
		});

		this.db.createFunction("updated_title_fn", (_ctxPtr, id, title) =>
			this._dispatchEvent({ type: "updatedTitle", id, title })
		);

		this.db.createFunction(
			"updated_completed_fn",
			(_ctxPtr, id, completed) => {
				this._dispatchEvent({
					type: "updatedCompleted",
					id,
					completed: !!completed,
				});
				dispatchChangedCompletedCount();
			}
		);

		this.db.exec(`
CREATE TRIGGER IF NOT EXISTS insert_trigger AFTER INSERT ON todos
  BEGIN
    SELECT inserted_item_fn(new.id, new.title, new.completed);
  END;

CREATE TRIGGER IF NOT EXISTS delete_trigger AFTER DELETE ON todos
  BEGIN
    SELECT deleted_item_fn(old.id);
  END;

CREATE TRIGGER IF NOT EXISTS update_title_trigger AFTER UPDATE OF title ON todos
  WHEN old.title <> new.title
  BEGIN
    SELECT updated_title_fn(new.id, new.title);
  END;

CREATE TRIGGER IF NOT EXISTS update_completed_trigger AFTER UPDATE OF completed ON todos
  WHEN old.completed <> new.completed
  BEGIN
    SELECT updated_completed_fn(new.id, new.completed);
  END;
`);
		this.listeners = new Map();
	}

	_dispatchEvent = (data) =>
		this.listeners.get(data.type)?.forEach((listener) => listener(data));

	addEventListener = (type, listener) => {
		let set = this.listeners.get(type);
		if (!set) this.listeners.set(type, (set = new Set()));
		set.add(listener);
	}

	removeEventListener = (type, listener) => {
		const set = this.listeners.get(type);
		if (set) set.delete(listener);
		if (set.size === 0) this.listeners.delete(type);
	}

	getItemTitle = ($id) =>
		this.db.selectValue(`SELECT title FROM todos WHERE id = $id`, { $id });

	getAllItems = () =>
		this.db
			.selectObjects(`SELECT id, title, completed FROM todos`)
			.map((item) => ({ ...item, completed: !!item.completed }));

	getItemsByCompletedStatus = ($completed) =>
		this.db
			.selectObjects(
				`SELECT id, title, completed FROM todos WHERE completed = $completed`,
				{ $completed }
			)
			.map((item) => ({ ...item, completed: !!item.completed }));

	addItem = ($title, completed) =>
		this.db.exec(`INSERT INTO todos (title, completed) VALUES ($title, $completed)`, {
			bind: { $title, $completed: !!completed },
		});

	setItemTitle = ($id, $title) =>
		this.db.exec(`UPDATE todos SET title = $title WHERE id = $id`, {
			bind: { $id, $title },
		});

	setItemCompletedStatus = ($id, $completed) =>
		this.db.exec(`UPDATE todos SET completed = $completed WHERE id = $id`, {
			bind: { $id, $completed },
		});

	deleteItem = ($id) =>
		this.db.exec(`DELETE FROM todos WHERE id = $id`, { bind: { $id } });

	getStatusCounts = () =>
		this.db.selectObject(
			`SELECT
				COUNT(IIF(completed, NULL, 1)) AS activeCount,
				COUNT(IIF(completed, 1, NULL)) AS completedCount FROM todos`
		);

	deleteCompletedItems = () =>
		this.db.exec(`DELETE FROM todos WHERE completed = 1`);

	setAllItemsCompletedStatus = ($completed) =>
		this.db.exec(`UPDATE todos SET completed = $completed`, {
			bind: { $completed },
		});
}
