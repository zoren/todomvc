import {emptyItemQuery} from './item.js';
import Store from './store.js';
import View from './view.js';

export default class Controller {
	/**
	 * @param  {!Store} store A Store instance
	 * @param  {!Database} sqlDatabase A Database instance
	 * @param  {!View} view A View instance
	 */
	constructor(store, sqlDatabase, view) {
		this.store = store;
		this.sqlDatabase = sqlDatabase;
		this.view = view;
		
		this.sqlDatabase.exec(`
		CREATE TABLE IF NOT EXISTS todos (
			id INTEGER PRIMARY KEY,
			title TEXT,
			completed INTEGER
			)
		`);
		this.dumpSQL = () => {
			const todos = this.sqlDatabase.exec({
				sql: `SELECT * FROM todos`,
				bind: {},
				returnValue: "resultRows",
				rowMode: "object",
			});
			todos.forEach((todo) => {todo.completed = !!todo.completed})
			console.table(todos);
		};
		this.exec = (params) => {
			const result = this.sqlDatabase.exec(params);
			this.dumpSQL();
			return result;
		};

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem((id, completed) => {
			this.toggleCompleted(id, completed);
			this._filter();
		});
		view.bindRemoveCompleted(this.removeCompletedItems.bind(this));
		view.bindToggleAll(this.toggleAll.bind(this));

		this._activeRoute = '';
		this._lastActiveRoute = null;
	}

	/**
	 * Set and render the active route.
	 *
	 * @param {string} raw '' | '#/' | '#/active' | '#/completed'
	 */
	setView(raw) {
		const route = raw.replace(/^#\//, '');
		this._activeRoute = route;
		this._filter();
		this.view.updateFilterButtons(route);
	}

	/**
	 * Add an Item to the Store and display it in the list.
	 *
	 * @param {!string} title Title of the new item
	 */
	addItem(title) {
		this.exec({
			sql: `INSERT INTO todos (id, title, completed) VALUES ($id, $title, $completed)`,
			bind: {
				$id: Date.now(),
				$title: title,
				$completed: false,
			},
		});
		this.store.insert(
			{
				id: Date.now(),
				title,
				completed: false,
			},
			() => {
				this.view.clearNewTodo();
				this._filter(true);
			}
		);
	}

	/**
	 * Save an Item in edit.
	 *
	 * @param {number} id ID of the Item in edit
	 * @param {!string} title New title for the Item in edit
	 */
	editItemSave(id, title) {
		if (title.length) {
			this.exec({
				sql: `UPDATE todos SET title = $title WHERE id = $id`,
				bind: { $id: id, $title: title },
			});
			this.store.update({ id, title }, () => {
				this.view.editItemDone(id, title);
			});
		} else {
			this.removeItem(id);
		}
	}

	/**
	 * Cancel the item editing mode.
	 *
	 * @param {!number} id ID of the Item in edit
	 */
	editItemCancel(id) {
		this.store.find({ id }, (data) => {
			const title = data[0].title;
			const sqlTitle = this.sqlDatabase.selectValue(
				`SELECT title FROM todos WHERE id = $id`,
				{ $id: id }
			);
			if (title !== sqlTitle) {
				throw new Error(`title mismatch: ${title} !== ${sqlTitle}`);
			}
			this.view.editItemDone(id, title);
		});
	}

	/**
	 * Remove the data and elements related to an Item.
	 *
	 * @param {!number} id Item ID of item to remove
	 */
	removeItem(id) {
		this.exec({
			sql: `DELETE FROM todos WHERE id = $id`,
			bind: { $id: id },
		});
		this.store.remove({ id }, () => {
			this._filter();
			this.view.removeItem(id);
		});
	}

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems() {
		this.exec(`DELETE FROM todos WHERE completed`);
		this.store.remove({ completed: true }, this._filter.bind(this));
	}

	/**
	 * Update an Item in storage based on the state of completed.
	 *
	 * @param {!number} id ID of the target Item
	 * @param {!boolean} completed Desired completed state
	 */
	toggleCompleted(id, completed) {
		this.exec({
			sql: `UPDATE todos SET completed = $completed WHERE id = $id`,
			bind: { $id: id, $completed: completed },
		});
		this.store.update({ id, completed }, () => {
			this.view.setItemComplete(id, completed);
		});
	}

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll(completed) {
		const todos = this.exec({
			sql: `SELECT * FROM todos WHERE completed = not $completed`,
			bind: { $completed: completed },
			returnValue: "resultRows",
			rowMode: "object",
		});
		this.store.find({ completed: !completed }, (data) => {
			for (let { id } of data) {
				this.toggleCompleted(id, completed);
			}
		});

		this._filter();
	}

	/**
	 * Refresh the list based on the current route.
	 *
	 * @param {boolean} [force] Force a re-paint of the list
	 */
	_filter(force) {
		const route = this._activeRoute;

		if (force || this._lastActiveRoute !== '' || this._lastActiveRoute !== route) {
			let sqlItems
			if (route === "") {
				sqlItems = this.sqlDatabase.selectObjects(`SELECT * FROM todos`)
			} else {
				sqlItems = this.sqlDatabase.selectObjects(`SELECT * FROM todos WHERE completed = $completed`, { $completed: route === "completed" })
			}
			console.log("sqlItems", sqlItems);
			/* jscs:disable disallowQuotedKeysInObjects */
			this.store.find(
				{
					"": emptyItemQuery,
					active: { completed: false },
					completed: { completed: true },
				}[route],
				this.view.showItems.bind(this.view)
			);
			/* jscs:enable disallowQuotedKeysInObjects */
		}

		const sqltotals = this.sqlDatabase.selectObject(`
		SELECT 
		  (SELECT count(*) FROM todos) as total,
			(SELECT count(*) FROM todos WHERE NOT completed) as active,
			(SELECT count(*) FROM todos WHERE completed) as completed`);
		this.store.count((total, active, completed) => {
			this.view.setItemsLeft(active);
			this.view.setClearCompletedButtonVisibility(completed);

			this.view.setCompleteAllCheckbox(completed === total);
			this.view.setMainVisibility(total);
		});

		this._lastActiveRoute = route;
	}
}