import sqlite3InitModule from '../node_modules/@sqlite.org/sqlite-wasm/index.mjs';

const sqlite3 = await sqlite3InitModule({
	print: (...args) => console.log(...args),
	printErr: (...args) => console.error(...args),
});

export default class TodoDatabase {
	/**
	 * @param  {!Database} sqlDatabase A Database instance
	 */
	constructor() {
		this.listeners = new Map();

		const _dispatchEvent = (type, data) =>
			this.listeners.get(type)?.forEach((listener) => listener(data));

		const { capi, wasm, oo1 } = sqlite3;

		const traceToEvents = wasm.installFunction(
			'i(ippp)',
			(traceEventCode, _ctxPtr, p, x) => {
				if (traceEventCode !== capi.SQLITE_TRACE_STMT) return;
				const preparedStatement = p;
				const sqlTextCstr = x;
				const sqlText = wasm.cstrToJs(sqlTextCstr);
				if (sqlText.startsWith('--')) {
					_dispatchEvent('sqlTraceStatement', { sqlText });
				} else {
					const expanded = capi.sqlite3_expanded_sql(preparedStatement);
					_dispatchEvent('sqlTraceExpandedStatement', { expanded });
				}
			}
		);

		this.db = new oo1.JsStorageDb('local');

		capi.sqlite3_trace_v2(
			this.db,
			capi.SQLITE_TRACE_STMT,
			traceToEvents,
			0 // passed in as ctxPtr to traceToEvents
		);

		this.db.exec(`
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  CHECK (title <> ''),
  CHECK (completed IN (0, 1)) -- SQLite uses integers for booleans
  )`);
		// we will need to filter on completed so we create an index
		this.db.exec(
			`CREATE INDEX IF NOT EXISTS completed_index ON todos (completed)`
		);

		const dispatchChangedCompletedCount = () =>
			_dispatchEvent('changedCompletedCount');

		this.db.createFunction(
			'inserted_item_fn',
			(_ctxPtr, id, title, completed) => {
				_dispatchEvent('insertedItem', {
					id,
					title,
					completed: !!completed,
				});
				dispatchChangedCompletedCount();
			}
		);

		this.db.createFunction('deleted_item_fn', (_ctxPtr, id) => {
			_dispatchEvent('deletedItem', { id });
			dispatchChangedCompletedCount();
		});

		this.db.createFunction('updated_title_fn', (_ctxPtr, id, title) =>
			_dispatchEvent('updatedTitle', { id, title })
		);

		this.db.createFunction('updated_completed_fn', (_ctxPtr, id, completed) => {
			_dispatchEvent('updatedCompleted', {
				id,
				completed: !!completed,
			});
			dispatchChangedCompletedCount();
		});

		this.db.exec(`
DROP TRIGGER IF EXISTS insert_trigger;
CREATE TEMPORARY TRIGGER insert_trigger AFTER INSERT ON todos
  BEGIN
    SELECT inserted_item_fn(new.id, new.title, new.completed);
  END;

DROP TRIGGER IF EXISTS delete_trigger;
CREATE TEMPORARY TRIGGER delete_trigger AFTER DELETE ON todos
  BEGIN
    SELECT deleted_item_fn(old.id);
  END;

DROP TRIGGER IF EXISTS update_title_trigger;
CREATE TEMPORARY TRIGGER update_title_trigger AFTER UPDATE OF title ON todos
  WHEN old.title <> new.title
  BEGIN
    SELECT updated_title_fn(new.id, new.title);
  END;

DROP TRIGGER IF EXISTS update_completed_trigger;
CREATE TEMPORARY TRIGGER update_completed_trigger AFTER UPDATE OF completed ON todos
  WHEN old.completed <> new.completed
  BEGIN
    SELECT updated_completed_fn(new.id, new.completed);
  END;
`);

		// listen for changes from other sessions
		addEventListener('storage', (event) => {
			// when other session clears the journal, it means it has committed potentially changing all data
			if (
				event.storageArea === localStorage &&
				event.key === 'kvvfs-local-jrnl' &&
				event.newValue === null
			)
				_dispatchEvent('updateAllTodos');
		});

		// if there are no items, add some
		const activeCount = this.getActiveItemCount();
		const hasCompleted = this.hasCompletedItems();
		if (activeCount === 0 && !hasCompleted) this.davinci();
	}

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

	addItem = ($title, completed) =>
		this.db.exec(
			`INSERT INTO todos (title, completed) VALUES ($title, $completed)`,
			{
				bind: { $title, $completed: !!completed },
			}
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

	getActiveItemCount = () =>
		this.db.selectValue(`SELECT COUNT() FROM todos WHERE completed = 0`);

	hasCompletedItems = () =>
		!!this.db.selectValue(`SELECT EXISTS(SELECT 1 FROM todos WHERE completed = 1)`);

	deleteCompletedItems = () =>
		this.db.exec(`DELETE FROM todos WHERE completed = 1`);

	setAllItemsCompletedStatus = ($completed) =>
		this.db.exec(`UPDATE todos SET completed = $completed`, {
			bind: { $completed },
		});

	// some demo helpers
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

	davinci = () => {
		this.db.exec(`DELETE FROM todos`);
		const davincisTodos = [
			{ title: 'Design a new flying machine concept.', completed: true },
			{ title: 'Finish sketch of the Last Supper.', completed: true },
			{ title: 'Research the mechanics of bird flight.', completed: true },
			{ title: 'Experiment with new painting techniques.', completed: false },
			{ title: 'Write notes on fluid dynamics.', completed: false },
		];
		for (const { title, completed } of davincisTodos) {
			this.addItem(title, completed);
		}
	};
}
