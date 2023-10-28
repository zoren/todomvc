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

		this.sqlDatabase.createFunction(
			'insertedDeletedTriggerFunction',
			(_ctxPtr, insertedOrDeleted, id, ...args) => {
				console.log('insertedDeletedTriggerFunction', ...args)
				if (insertedOrDeleted === 'deleted') {
					this.view.removeItem(id);
				}else if (insertedOrDeleted === 'inserted') {
					this.view.clearNewTodo();
				}
				this._updateItemsFromRoute();
				this._updateViewCounts();

				return null
			},
			{ arity: 2,
				deterministic: false,
				directOnly: false,
				innocuous: false
			 },
		)
		this.sqlDatabase.exec(`
		CREATE TRIGGER IF NOT EXISTS insert_trigger AFTER INSERT ON todos
    BEGIN
      SELECT insertedDeletedTriggerFunction('inserted', new.id);
    END;

		CREATE TRIGGER IF NOT EXISTS delete_trigger AFTER DELETE ON todos
    BEGIN
      SELECT insertedDeletedTriggerFunction('deleted', old.id);
    END;
		`)

		this.sqlDatabase.createFunction(
			'updatedTriggerFunction',
			(_ctxPtr, id, oldTitle, newTitle, oldCompleted, newCompleted) => {
				console.log('updatedTriggerFunction', { id, oldTitle, newTitle, oldCompleted, newCompleted })
				if (oldTitle !== newTitle) this.view.editItemDone(id, newTitle);
				if (oldCompleted !== newCompleted) this.view.setItemComplete(id, newCompleted);
				this._updateItemsFromRoute();
				this._updateViewCounts();

				return null
			},
			{ arity: 5,
				deterministic: false,
				directOnly: false,
				innocuous: false
			 },
		)
		this.sqlDatabase.exec(`
		CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON todos
    BEGIN
      SELECT updatedTriggerFunction(new.id, old.title, new.title, old.completed, new.completed);
    END;
		`)

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem(this.toggleCompleted.bind(this));
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
		this._updateItemsFromRoute();
		this._updateViewCounts();
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
	}

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems() {
		this.sqlDatabase.exec(`DELETE FROM todos WHERE completed`);
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
	}

	_itemsFromRoute = (route) => route === '' ?
		this.sqlDatabase.selectObjects(`SELECT id, title, completed FROM todos`) :
		this.sqlDatabase.selectObjects(`SELECT id, title, completed FROM todos WHERE completed = $completed`, { $completed: route === "completed" })

	_updateViewCounts() {
		const { total, active, completed } = this.sqlDatabase.selectObject(`
		SELECT 
			(SELECT count(*) FROM todos) as total,
			(SELECT count(*) FROM todos WHERE NOT completed) as active,
			(SELECT count(*) FROM todos WHERE completed) as completed`);

		this.view.setItemsLeft(active);
		this.view.setClearCompletedButtonVisibility(completed);

		this.view.setCompleteAllCheckbox(completed === total);
		this.view.setMainVisibility(total);
	}

	/**
	 * Refresh the list based on the current route.
	 */
	_updateItemsFromRoute() {
		const route = this._activeRoute;

		if (this._lastActiveRoute !== '' || this._lastActiveRoute !== route) {
			this.view.showItems(this._itemsFromRoute(route))
		}

		this._lastActiveRoute = route;
	}
}
