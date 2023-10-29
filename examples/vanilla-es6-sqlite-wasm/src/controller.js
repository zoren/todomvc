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
			completed INTEGER DEFAULT 0
			)
		`);

		this.bulkModeOperations = null;

		const pushBulkModeOperationOrUpdate = (op) => {
			if (this.bulkModeOperations !== null) {
				this.bulkModeOperations.push(op);
			} else {
				this._updateViewCounts();
			}
		};

		this.sqlDatabase.createFunction(
			'insertedTriggerFunction',
			(_ctxPtr, id, title, completed) => {
				this.view.clearNewTodo();
				this.view.addItem({ id, title, completed });
				pushBulkModeOperationOrUpdate({ type: "inserted", id });
				return null;
			},
			{ arity: 3, deterministic: false, directOnly: false, innocuous: false }
		);

		this.sqlDatabase.createFunction(
			'deletedTriggerFunction',
			(_ctxPtr, id) => {
				this.view.removeItem(id);
				pushBulkModeOperationOrUpdate({ type: "deleted", id });
				return null;
			},
			{ arity: 1, deterministic: false, directOnly: false, innocuous: false }
		);

		this.sqlDatabase.createFunction(
			'updatedTriggerFunction',
			(_ctxPtr, id, oldTitle, newTitle, oldCompleted, newCompleted) => {
				if (oldTitle !== newTitle) this.view.editItemDone(id, newTitle);
				if (oldCompleted !== newCompleted) {
					this.view.setItemComplete(id, newCompleted);
					pushBulkModeOperationOrUpdate({ type: "updated", id });
				}
				return null;
			},
			{ arity: 5, deterministic: false, directOnly: false, innocuous: false }
		);

		this.sqlDatabase.exec(`
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

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem(this.toggleCompleted.bind(this));
		view.bindRemoveCompleted(this.removeCompletedItems.bind(this));
		view.bindToggleAll(this.toggleAll.bind(this));
	}

	/**
	 * Set and render the active route.
	 *
	 * @param {string} raw '' | '#/' | '#/active' | '#/completed'
	 */
	setView(raw) {
		const route = raw.replace(/^#\//, '');
		const items =
			route === ''
				? this.sqlDatabase.selectObjects(
						`SELECT id, title, completed FROM todos`
				  )
				: this.sqlDatabase.selectObjects(
						`SELECT id, title, completed FROM todos WHERE completed = $completed`,
						{ $completed: route === 'completed' }
				  );
		this.view.showItems(items);
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
			sql: `INSERT INTO todos (title) VALUES ($title)`,
			bind: { $title: title },
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
		this._bulkUpdate(() =>
			this.sqlDatabase.exec(`DELETE FROM todos WHERE completed`)
		);
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
		this._bulkUpdate(() =>
			this.sqlDatabase.exec({
				sql: `UPDATE todos SET completed = $completed`,
				bind: { $completed: completed },
			})
		);
	}

	/**
	 * Refresh the view from the counts of completed, active and total todos.
	 */
	_updateViewCounts() {
		const { total, active, completed } = this.sqlDatabase.selectObject(
			`SELECT COUNT(*) AS total, COUNT(IIF(completed, NULL, 1)) AS active, COUNT(IIF(completed, 1, NULL)) AS completed FROM todos`
		);
		this.view.setItemsLeft(active);
		this.view.setClearCompletedButtonVisibility(completed);

		this.view.setCompleteAllCheckbox(completed === total);
		this.view.setMainVisibility(total);
	}

	/**
	 * Wrap a database operation that does bulk updates to the view to avoid redundant redraws.
	 * @param {function} bulkOperation
	 */
	_bulkUpdate(bulkOperation) {
		this.bulkModeOperations = [];
		bulkOperation();
		if (this.bulkModeOperations.length > 0) {
			this._updateViewCounts();
		}
		this.bulkModeOperations = null;
	}
}
