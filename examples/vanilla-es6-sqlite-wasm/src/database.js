import databaseCreateScript from './create.sql?raw';

const addStatementTracing = (sqlite3, db, callback) => {
	const { capi, wasm } = sqlite3;

	capi.sqlite3_trace_v2(
		db,
		capi.SQLITE_TRACE_STMT,
		wasm.installFunction('i(ippp)', (traceEventCode, _ctxPtr, p, x) => {
			if (traceEventCode !== capi.SQLITE_TRACE_STMT) return;
			const preparedStatement = p;
			const sqlTextCstr = x;
			const sqlText = wasm.cstrToJs(sqlTextCstr);
			if (sqlText.startsWith('--')) {
				callback('sqlTraceStatement', { sqlText });
			} else {
				// expand bound parameters into sql statement
				const expanded = capi.sqlite3_expanded_sql(preparedStatement);
				callback('sqlTraceExpandedStatement', { expanded });
			}
		}),
		0 // passed in as ctxPtr to traceToEvents
	);
};

const addCommitHook = (sqlite3, db, callback) => {
	const { capi, wasm } = sqlite3;

	capi.sqlite3_commit_hook(
		db,
		wasm.installFunction('i(p)', (_ctxPtr) => {
			callback();
			return 0;
		}),
		0
	);
};

const createTodoTriggers = (db, dispatchEvent) => {
	// insert item trigger
	db.createFunction('inserted_item_fn', (_ctxPtr, id, title, completed) =>
		dispatchEvent('insertedItem', { id, title, completed: !!completed })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER insert_trigger AFTER INSERT ON todos
	BEGIN SELECT inserted_item_fn(new.id, new.title, new.completed); END`);

	// delete item trigger
	db.createFunction('deleted_item_fn', (_ctxPtr, id) =>
		dispatchEvent('deletedItem', { id })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER delete_trigger AFTER DELETE ON todos
	BEGIN SELECT deleted_item_fn(old.id); END`);

	// update item title trigger
	db.createFunction('updated_title_fn', (_ctxPtr, id, title) =>
		dispatchEvent('updatedTitle', { id, title })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER update_title_trigger AFTER UPDATE OF title ON todos
	WHEN old.title <> new.title
	BEGIN SELECT updated_title_fn(new.id, new.title); END`);

	// update item completed status trigger
	db.createFunction('updated_completed_fn', (_ctxPtr, id, completed) =>
		dispatchEvent('updatedCompleted', { id, completed: !!completed })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER update_completed_trigger AFTER UPDATE OF completed ON todos
  WHEN old.completed <> new.completed
  BEGIN SELECT updated_completed_fn(new.id, new.completed); END`);
};


export default class {
	constructor(sqlite3) {
		this.db = new sqlite3.oo1.JsStorageDb('local');

		this.listeners = new Map();

		this._dispatchEvent = (type, data) =>
			this.listeners.get(type)?.forEach((listener) => listener(data));

		addStatementTracing(sqlite3, this.db, this._dispatchEvent);
		addCommitHook(sqlite3, this.db, () => this._dispatchEvent('commit'));

		// listen for changes from other sessions
		addEventListener('storage', (event) => {
			// when other session clears the journal, it means it has committed potentially changing all data
			if (
				event.storageArea === localStorage &&
				event.key === 'kvvfs-local-jrnl' &&
				event.newValue === null
			)
				this._dispatchEvent('updateAllData');
		});
	}

	init = () => {
		this.db.exec(databaseCreateScript);
		createTodoTriggers(this.db, this._dispatchEvent)
	};

	addEventListener = (type, listener) => {
		let set = this.listeners.get(type);
		if (!set) this.listeners.set(type, (set = new Set()));
		set.add(listener);
	};

	removeEventListener = (type, listener) => {
		const set = this.listeners.get(type);
		if (set) set.delete(listener);
		if (set.size === 0) this.listeners.delete(type);
	};

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

	insertItem = ($title) =>
		this.db.selectValue(`INSERT INTO todos (title) VALUES ($title) RETURNING id`, { $title },
		);

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

	getItemCounts = () => this.db.selectObject(
		`SELECT active_count as activeCount, total_count as totalCount FROM todo_counts`
	);

	deleteCompletedItems = () =>
		this.db.exec(`DELETE FROM todos WHERE completed = 1`);

	setAllItemsCompletedStatus = ($completed) =>
		this.db.exec(`UPDATE todos SET completed = $completed`, {
			bind: { $completed },
		});

	// some demo helpers
	selectObjects = (sql) => this.db.selectObjects(sql);

	execSQL = (sql) => {
		const rows = this.db.selectObjects(sql);
		if (rows.length > 0) console.table(rows);
		else console.log('empty result set');
	};

	dumpTodos = () =>
		console.table(
			Object.fromEntries(
				this.getAllItems().map(({ id, title, completed }) => [
					id,
					{ title, completed },
				])
			)
		);
}
