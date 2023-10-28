import View from './view.js';

export default class Controller {
	/**
	 * @param  {!Database} sqlDatabase A Database instance
	 * @param  {!View} view A View instance
	 */
	constructor(sqlDatabase, view) {
		this.sqlDatabase = sqlDatabase;
		this.view = view;
		
		this.sqlDatabase.exec(`
		CREATE TABLE IF NOT EXISTS todos (
			id INTEGER PRIMARY KEY,
			title TEXT,
			completed INTEGER
			)
		`);

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
		this.sqlDatabase.exec({
			sql: `INSERT INTO todos (id, title, completed) VALUES ($id, $title, $completed)`,
			bind: {
				$id: Date.now(),
				$title: title,
				$completed: false,
			},
		});
		this.view.clearNewTodo();
		this._filter(true);
	}

	/**
	 * Save an Item in edit.
	 *
	 * @param {number} id ID of the Item in edit
	 * @param {!string} title New title for the Item in edit
	 */
	editItemSave(id, title) {
		if (title.length) {
			this.sqlDatabase.exec({
				sql: `UPDATE todos SET title = $title WHERE id = $id`,
				bind: { $id: id, $title: title },
			});
			this.view.editItemDone(id, title);
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
		const title = this.sqlDatabase.selectValue(
			`SELECT title FROM todos WHERE id = $id`,
			{ $id: id }
		);
		this.view.editItemDone(id, title);
	}

	/**
	 * Remove the data and elements related to an Item.
	 *
	 * @param {!number} id Item ID of item to remove
	 */
	removeItem(id) {
		this.sqlDatabase.exec({
			sql: `DELETE FROM todos WHERE id = $id`,
			bind: { $id: id },
		});
		this._filter();
		this.view.removeItem(id);
	}

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems() {
		this.sqlDatabase.exec(`DELETE FROM todos WHERE completed`);
		this._filter(true);
	}

	/**
	 * Update an Item in storage based on the state of completed.
	 *
	 * @param {!number} id ID of the target Item
	 * @param {!boolean} completed Desired completed state
	 */
	toggleCompleted(id, completed) {
		this.sqlDatabase.exec({
			sql: `UPDATE todos SET completed = $completed WHERE id = $id`,
			bind: { $id: id, $completed: completed },
		});
		this.view.setItemComplete(id, completed);
	}

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll(completed) {
		const data = this.sqlDatabase.exec({
			sql: `SELECT id FROM todos WHERE completed = NOT $completed`,
			bind: { $completed: completed },
			returnValue: "resultRows",
			rowMode: "object",
		});
		for (let { id } of data) {
			this.toggleCompleted(id, completed);
		}
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
			let items
			if (route === '') {
				items = this.sqlDatabase.selectObjects(`SELECT id, title, completed FROM todos`)
			} else {
				items = this.sqlDatabase.selectObjects(`SELECT id, title, completed FROM todos WHERE completed = $completed`, { $completed: route === "completed" })
			}
			this.view.showItems(items)
		}

		const { total, active, completed } = this.sqlDatabase.selectObject(`
		SELECT 
		  (SELECT count(*) FROM todos) as total,
			(SELECT count(*) FROM todos WHERE NOT completed) as active,
			(SELECT count(*) FROM todos WHERE completed) as completed`);

		this.view.setItemsLeft(active);
		this.view.setClearCompletedButtonVisibility(completed);

		this.view.setCompleteAllCheckbox(completed === total);
		this.view.setMainVisibility(total);

		this._lastActiveRoute = route;
	}
}
