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

		// SQLite supports triggers on rows but not transactions
		// we keep track of batch operations and dispatch a batch event when they are over
		this.directMode = true;
		this.eventQueue = [];

		const dispatchIfDirect = (event) => {
			if (this.directMode) this._dispatchEvent(event);
			else this.eventQueue.push(event);
		};

		this.db.createFunction(
			"inserted_item_fn",
			(_ctxPtr, id, title, completed) =>
				dispatchIfDirect({
					type: "insertedItem",
					id,
					title,
					completed: !!completed,
				})
		);

		this.db.createFunction("deleted_item_fn", (_ctxPtr, id) =>
			dispatchIfDirect({ type: "deletedItem", id })
		);

		this.db.createFunction("updated_title_fn", (_ctxPtr, id, newTitle) =>
			dispatchIfDirect({ type: "updatedTitle", id, newTitle })
		);

		this.db.createFunction(
			"updated_completed_fn",
			(_ctxPtr, id, newCompleted) =>
				dispatchIfDirect({
					type: "updatedCompleted",
					id,
					newCompleted: !!newCompleted,
				})
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
		this.listeners = new Set();
	}

	_dispatchEvent = (data) =>
		this.listeners.forEach((listener) => setTimeout(listener(data)));

	addEventListener = (listener) => this.listeners.add(listener);

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

	addItem = ($title) =>
		this.db.exec(`INSERT INTO todos (title) VALUES ($title)`, {
			bind: { $title },
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
				COUNT(IIF(completed, NULL, 1)) AS active,
				COUNT(IIF(completed, 1, NULL)) AS completed FROM todos`
		);

	// we use this function to wrap bulk operations on completed statuses
	// so that we can dispatch the changedItemCounts event only once
	_bulkStatusUpdate = (bulkOperation) => {
		this.eventQueue.length = 0;
		this.directMode = false;
		const result = bulkOperation();
		this.directMode = true;
		const events = [...this.eventQueue];
		this.eventQueue.length = 0;
		this._dispatchEvent({ type: "batch", events });
		return result;
	};

	deleteCompletedItems = () =>
		this._bulkStatusUpdate(() =>
			this.db.exec(`DELETE FROM todos WHERE completed = 1`)
		);

	setAllItemsCompletedStatus = ($completed) =>
		this._bulkStatusUpdate(() =>
			this.db.exec(`UPDATE todos SET completed = $completed`, {
				bind: { $completed },
			})
		);

	bulkExec = (params) =>
		this._bulkStatusUpdate(() => this.db.selectObjects(params));
}
