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

		// because SQLite doesn't support triggers on transactions only rows
		// we keep track of bulk operations and only updateItemCounts events when they are done
		this.bulkMode = false;

		const updateCountIfNotBulk = () => {
			if (this.bulkMode) return;
			this._dispatchEvent("updateItemCounts", this.getStatusCounts());
		};

		this.db.createFunction(
			"insertedTriggerFunction",
			(_ctxPtr, id, title, completed) => {
				this._dispatchEvent("insertedItem", { id, title, completed });
				updateCountIfNotBulk();
				return null;
			},
			{ arity: 3, deterministic: false, directOnly: false, innocuous: false }
		);

		this.db.createFunction(
			"deletedTriggerFunction",
			(_ctxPtr, id) => {
				this._dispatchEvent("deletedItem", { id });
				updateCountIfNotBulk();
				return null;
			},
			{ arity: 1, deterministic: false, directOnly: false, innocuous: false }
		);

		this.db.createFunction(
			"updatedTriggerFunction",
			(_ctxPtr, id, oldTitle, newTitle, oldCompleted, newCompleted) => {
				if (oldTitle !== newTitle)
					this._dispatchEvent("updatedTitle", { id, newTitle });
				if (oldCompleted !== newCompleted) {
					this._dispatchEvent("updatedCompleted", { id, newCompleted });
					updateCountIfNotBulk();
				}
				return null;
			},
			{ arity: 5, deterministic: false, directOnly: false, innocuous: false }
		);

		this.db.exec(`
		CREATE TRIGGER IF NOT EXISTS insert_trigger AFTER INSERT ON todos
				BEGIN
						SELECT insertedTriggerFunction(new.id, new.title, new.completed);
				END;

		CREATE TRIGGER IF NOT EXISTS delete_trigger AFTER DELETE ON todos
				BEGIN
						SELECT deletedTriggerFunction(old.id);
				END;

		CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON todos
				BEGIN
						SELECT updatedTriggerFunction(new.id, old.title, new.title, old.completed, new.completed);
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

	_bulkUpdate = (bulkOperation) => {
		const beforeCount = this.getStatusCounts();
		this.bulkMode = true;
		const result = bulkOperation();
		this.bulkMode = false;
		const afterCounts = this.getStatusCounts();
		// count changed during bulk operation so we dispatch the event
		if (
			beforeCount.active !== afterCounts.active ||
			beforeCount.completed !== afterCounts.completed
		) {
			this._dispatchEvent("updateItemCounts", afterCounts);
		}
		return result;
	};

	deleteCompletedItems = () =>
		this._bulkUpdate(() => this.db.exec(`DELETE FROM todos WHERE completed`));

	setAllItemsCompletedStatus = ($completed) =>
		this._bulkUpdate(() =>
			this.db.exec(`UPDATE todos SET completed = $completed`, {
				bind: { $completed },
			})
		);

	bulkExec = (params) => this._bulkUpdate(() => this.db.selectObjects(params));
}
