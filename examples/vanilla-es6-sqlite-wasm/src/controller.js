import databaseCreateScript from './create.sql?raw';
import { addStatementTracing, addCommitHook } from './sqliteUtils.js';
import View from './view.js';

const selectItemTitle = (db, $id) =>
	db.selectValue(`SELECT title FROM todos WHERE id = $id`, { $id });

const addDemoTodos = (ooDB) => {
	const davincisTodos = [
		{ $title: 'Design a new flying machine concept.', $completed: true },
		{ $title: 'Finish sketch of the Last Supper.', $completed: true },
		{ $title: 'Research the mechanics of bird flight.', $completed: true },
		{ $title: 'Experiment with new painting techniques.', $completed: false },
		{ $title: 'Write notes on fluid dynamics.', $completed: false },
	];
	// if there are no items, add some
	if (!ooDB.selectValue(`SELECT EXISTS (SELECT 1 FROM todos)`)) {
		for (const bind of davincisTodos) {
			ooDB.exec(
				`INSERT INTO todos (title, completed) VALUES ($title, $completed)`,
				{ bind }
			);
		}
	}
};

export default class Controller {
	/**
	 * @param  {!Database} ooDB A sqlite3 oo1 Database instance
	 * @param  {!View} view A View instance
	 */
	constructor(sqlite3, view) {
		this.view = view;

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem(this.toggleCompleted.bind(this));
		view.bindRemoveCompleted(this.removeCompletedItems.bind(this));
		view.bindToggleAll(this.toggleAll.bind(this));
		view.bindEvalSQL(this.evalSQL);
		view.bindSQLConsoleHistory(this.navigateSQLHistory);

		const ooDB = new sqlite3.oo1.JsStorageDb('local');
		this.ooDB = ooDB;

		// add tracing before we run the create script so the trace shows it running
		addStatementTracing(sqlite3, ooDB, {
			traceExpandedStatement(expanded) {
				view.appendSQLTrace(expanded);
			},
		});
		ooDB.exec(databaseCreateScript);

		// insert item trigger
		ooDB.createFunction('inserted_item_fn', (_ctxPtr, id, title, completedInt) => {
			this.view.clearNewTodo();
			// add item if it should be visible in the current route
			const completed = !!completedInt;
			if (this.isAllRoute() || completed === this.isCompletedRoute())
				this.view.addItem({ id, title, completed });
		});

		ooDB.exec(`
CREATE TEMPORARY TRIGGER insert_trigger AFTER INSERT ON todos
	BEGIN SELECT inserted_item_fn(new.id, new.title, new.completed); END`);

		// delete item trigger
		ooDB.createFunction('deleted_item_fn', (_ctxPtr, id) =>
			this.view.removeItem(id)
		);

		ooDB.exec(`
CREATE TEMPORARY TRIGGER delete_trigger AFTER DELETE ON todos
	BEGIN SELECT deleted_item_fn(old.id); END`);

		// update item title trigger
		ooDB.createFunction('updated_title_fn', (_ctxPtr, id, title) =>
			this.view.editItemDone(id, title)
		);

		ooDB.exec(`
CREATE TEMPORARY TRIGGER update_title_trigger AFTER UPDATE OF title ON todos
	WHEN old.title <> new.title
	BEGIN SELECT updated_title_fn(new.id, new.title); END`);

		// update item completion status trigger
		ooDB.createFunction('updated_completed_fn', (_ctxPtr, id, completedInt) => {
			const completed = !!completedInt;
			if (this.isAllRoute()) {
				this.view.setItemComplete(id, completed);
			} else {
				// add/remove item if it should be visible in the current route
				if (completed === this.isCompletedRoute())
					this.view.addItem({
						id,
						title: selectItemTitle(ooDB, id),
						completed,
					});
				else this.view.removeItem(id);
			}
		});

		ooDB.exec(`
CREATE TEMPORARY TRIGGER update_completed_trigger AFTER UPDATE OF completed ON todos
	WHEN old.completed <> new.completed
	BEGIN SELECT updated_completed_fn(new.id, new.completed); END`);

		// add a commit hook not a trigger to update the item counts
		// this is so we don't update multiple times for one transaction
		addCommitHook(sqlite3, ooDB, this.refreshViewItemTotalStatus);

		// listen for changes from other browser sessions/tabs
		window.addEventListener('storage', (event) => {
			// in journal_mode = DELETE the last thing SQLite when committing is to delete the journal
			// so we can use that as a signal that another session has committed
			// relying on 'kvvfs-local-jrnl' is brittle
			// but a kind expert on the SQLite forum assured us that it the key is very unlikely to change:
			// https://sqlite.org/forum/forumpost/d8defe9070
			if (
				event.storageArea === window.localStorage &&
				event.key === 'kvvfs-local-jrnl' &&
				event.newValue === null
			) {
				// we don't know what changed, so just reload the entire view
				this.reloadView();
			}
		});

		addDemoTodos(ooDB);

		const sqlHistory = [
			`UPDATE todos SET completed = NOT completed`,
			`SELECT * FROM todos`,
			`DELETE FROM todos WHERE completed = 1`,
			`INSERT INTO todos (title) VALUES ('Sketch initial designs for calculating machine.')`,
		];
		this._sqlHistory = sqlHistory;
		this._sqlHistoryIndex = sqlHistory.length;

		this._currentRoute = '';
	}

	/**
	 * Refresh the view from the counts of completed, active and total todos.
	 */
	refreshViewItemTotalStatus = () => {
		const activeCount = this.ooDB.selectValue(
			`SELECT COUNT() FROM todos WHERE completed = 0`
		);
		this.view.setItemsLeft(activeCount);
		this.view.setCompleteAllCheckbox(activeCount === 0);

		const hasCompleted = this.ooDB.selectValue(
			`SELECT EXISTS (SELECT 1 FROM todos WHERE completed = 1)`
		);
		this.view.setClearCompletedButtonVisibility(hasCompleted);
		const hasAny = this.ooDB.selectValue(`SELECT EXISTS (SELECT 1 FROM todos)`);
		this.view.setMainVisibility(hasAny);
	};

	isAllRoute = () => this._currentRoute === '';

	isCompletedRoute = () => this._currentRoute === 'completed';

	/**
	 * Set and render the active route.
	 *
	 * @param {string} route '' | 'active' | 'completed'
	 */
	setView(route) {
		this._currentRoute = route;
		this.view.updateFilterButtons(route);
		this.reloadView();
	}

	reloadView = () => {
		this.refreshViewItemTotalStatus();
		const rawItems =
			this.isAllRoute()
				? this.ooDB.selectObjects(`SELECT id, title, completed FROM todos`)
				: this.ooDB.selectObjects(
						`SELECT id, title, completed FROM todos WHERE completed = $completed`,
						{ $completed: this.isCompletedRoute() }
				  );
		const items = rawItems.map((item) => ({
			...item,
			completed: !!item.completed,
		}));
		this.view.showItems(items);
	};

	/**
	 * Add an Item to the Store and display it in the list.
	 *
	 * @param {!string} title Title of the new item
	 */
	addItem = ($title) =>
		this.ooDB.exec(`INSERT INTO todos (title) VALUES ($title)`, {
			bind: { $title },
		});

	/**
	 * Save an Item in edit.
	 *
	 * @param {number} id ID of the Item in edit
	 * @param {!string} title New title for the Item in edit
	 */
	editItemSave($id, $title) {
		if ($title.length > 0) {
			this.ooDB.exec(`UPDATE todos SET title = $title WHERE id = $id`, {
				bind: { $id, $title },
			});
		} else {
			this.removeItem($id);
		}
	}

	/**
	 * Cancel the item editing mode.
	 *
	 * @param {!number} id ID of the Item in edit
	 */
	editItemCancel = (id) =>
		this.view.editItemDone(id, selectItemTitle(this.ooDB, id));

	/**
	 * Remove the data and elements related to an Item.
	 *
	 * @param {!number} id Item ID of item to remove
	 */
	removeItem = ($id) =>
		this.ooDB.exec(`DELETE FROM todos WHERE id = $id`, { bind: { $id } });

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems = () =>
		this.ooDB.exec(`DELETE FROM todos WHERE completed = 1`);

	/**
	 * Update an Item in storage based on the state of completed.
	 *
	 * @param {!number} id ID of the target Item
	 * @param {!boolean} completed Desired completed state
	 */
	toggleCompleted = ($id, $completed) =>
		this.ooDB.exec(`UPDATE todos SET completed = $completed WHERE id = $id`, {
			bind: { $id, $completed },
		});

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll = ($completed) =>
		this.ooDB.exec(`UPDATE todos SET completed = $completed`, {
			bind: { $completed },
		});

	evalSQL = (sql) => {
		try {
			const sqlHistory = this._sqlHistory;
			this.view.appendSQLTrace(this.ooDB.selectObjects(sql));
			// only add to history if it's different from the last one
			if (sql !== sqlHistory.at(-1)) sqlHistory.push(sql);
			this._sqlHistoryIndex = sqlHistory.length;
			this.view.setSqlInputValue('');
		} catch (e) {
			this.view.appendSQLTrace(e);
		}
	};

	navigateSQLHistory = (upDownDiff) => {
		const sqlHistory = this._sqlHistory;
		const sqlHistoryIndex = this._sqlHistoryIndex;
		if (upDownDiff === -1 && sqlHistoryIndex === 0) return;
		if (upDownDiff === 1 && sqlHistoryIndex === sqlHistory.length) return;
		const newSqlHistoryIndex = sqlHistoryIndex + upDownDiff;
		const newInput =
			newSqlHistoryIndex === sqlHistory.length
				? ''
				: sqlHistory[newSqlHistoryIndex];
		this._sqlHistoryIndex = newSqlHistoryIndex;
		this.view.setSqlInputValue(newInput);
	};
}
