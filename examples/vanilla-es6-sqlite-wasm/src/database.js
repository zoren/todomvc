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
		// we keep track of bulk operations and only dispatch changedItemCounts events when they are over
		this.directMode = true;

		this.db.createFunction("is_direct_mode", () => this.directMode);

		this.db.createFunction(
			"inserted_item_fn",
			(_ctxPtr, id, title, completed) =>
				this._dispatchEvent("insertedItem", { id, title, completed }),
		);

		this.db.createFunction(
			"deleted_item_fn",
			(_ctxPtr, id) => this._dispatchEvent("deletedItem", { id }),
		);

		this.db.createFunction(
			"updated_title_fn",
			(_ctxPtr, id, newTitle) =>
				this._dispatchEvent("updatedTitle", { id, newTitle }),
		);

		this.db.createFunction(
			"updated_completed_fn",
			(_ctxPtr, id, newCompleted) =>
				this._dispatchEvent("updatedCompleted", { id, newCompleted }),
			{ arity: 2, deterministic: false, directOnly: false, innocuous: false }
		);

		this.db.createFunction(
			"changed_completed_count_fn",
			() => this._dispatchEvent("changedItemCounts", this.getStatusCounts()),
		);

		this.db.exec(`
CREATE TRIGGER IF NOT EXISTS insert_trigger AFTER INSERT ON todos
  BEGIN
    SELECT inserted_item_fn(new.id, new.title, new.completed);
    SELECT changed_completed_count_fn() WHERE is_direct_mode();
  END;

CREATE TRIGGER IF NOT EXISTS delete_trigger AFTER DELETE ON todos
  BEGIN
    SELECT deleted_item_fn(old.id);
    SELECT changed_completed_count_fn() WHERE is_direct_mode();
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
    SELECT changed_completed_count_fn() WHERE is_direct_mode();
  END;
`);
		this.listeners = new Map();
	}

	_dispatchEvent = (type, data) => {
		const set = this.listeners.get(type);
		if (set) set.forEach((listener) => setTimeout(listener(data)));
	};

	addEventListener = (type, listener) => {
		let set = this.listeners.get(type);
		if (set === undefined) this.listeners.set(type, (set = new Set()));
		set.add(listener);
	};

	getItemTitle = ($id) =>
		this.db.selectValue(`SELECT title FROM todos WHERE id = $id`, { $id });

	getAllItems = () =>
		this.db.selectObjects(`SELECT id, title, completed FROM todos`);

	getItemsByCompletedStatus = ($completed) =>
		this.db.selectObjects(
			`SELECT id, title, completed FROM todos WHERE completed = $completed`,
			{ $completed }
		);

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
		const beforeCount = this.getStatusCounts();
		this.directMode = false;
		const result = bulkOperation();
		this.directMode = true;
		const afterCounts = this.getStatusCounts();
		// count changed during bulk operation so we dispatch the event
		if (
			beforeCount.active !== afterCounts.active ||
			beforeCount.completed !== afterCounts.completed
		) {
			this._dispatchEvent("changedItemCounts", afterCounts);
		}
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
