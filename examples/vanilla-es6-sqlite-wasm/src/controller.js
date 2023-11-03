import TodoDatabase from './database.js';
import View from './view.js';

export default class Controller {
	/**
	 * @param  {!TodoDatabase} database A TodoDatabase instance
	 * @param  {!View} view A View instance
	 */
	constructor(todoDB, view) {
		this.todoDB = todoDB;
		this.view = view;

		this.todoDB.addEventListener('insertedItem', (event) => {
			this.view.clearNewTodo();
			const route = this._currentRoute;
			// add item if it should be visible in the current route
			if (route === '' || event.completed === (route === 'completed'))
				this.view.addItem(event);
		});

		this.todoDB.addEventListener('deletedItem', ({ id }) =>
			this.view.removeItem(id)
		);

		this.todoDB.addEventListener('updatedTitle', ({ id, title }) =>
			this.view.editItemDone(id, title)
		);

		this.todoDB.addEventListener('updatedCompleted', ({ id, completed }) => {
			const route = this._currentRoute;

			if (route === '') {
				this.view.setItemComplete(id, completed);
			} else {
				// add/remove item if it should be visible in the current route
				if (completed === (route === 'completed'))
					this.view.addItem({
						id,
						title: this.todoDB.getItemTitle(id),
						completed,
					});
				else this.view.removeItem(id);
			}
		});

		this.todoDB.addEventListener('updateAllTodos', this._reloadView);

		this.todoDB.addEventListener(
			'sqlTraceExpandedStatement',
			({ expanded }) => view.appendSQLTrace(expanded)
		);

		this.todoDB.addEventListener('updatedItemCounts', this._updateItemCounts)

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem(this.toggleCompleted.bind(this));
		view.bindRemoveCompleted(this.removeCompletedItems.bind(this));
		view.bindToggleAll(this.toggleAll.bind(this));
		const sqlHistory = [
			`UPDATE todos SET completed = NOT completed`,
			`SELECT * FROM todos`,
			`DELETE FROM todos WHERE completed = 1`,
			`INSERT INTO todos (title) VALUES ('Sketch initial designs for calculating machine.')`,
		];
		let sqlHistoryIndex = sqlHistory.length;
		view.bindEvalSQL((sql) => {
			try {
				view.appendSQLTrace(this.todoDB.selectObjects(sql));
				// only add to history if it's different from the last one
				if (sql !== sqlHistory.at(-1)) sqlHistory.push(sql);
				sqlHistoryIndex = sqlHistory.length;
				view.setSqlInputValue('');
			} catch (e) {
				view.appendSQLTrace(e);
			}
		});
		view.bindSQLConsoleHistory((upDownDiff) => {
			if (upDownDiff === -1 && sqlHistoryIndex === 0) return;
			if (upDownDiff === 1 && sqlHistoryIndex === sqlHistory.length) return;
			sqlHistoryIndex += upDownDiff;
			const newInput =
				sqlHistoryIndex === sqlHistory.length
					? ''
					: sqlHistory[sqlHistoryIndex];
			view.setSqlInputValue(newInput);
		});

		this._currentRoute = '';
	}

	/**
	 * Refresh the view from the counts of completed, active and total todos.
	 */
	_updateItemCounts = ({ activeCount, totalCount }) => {
		this.view.setItemsLeft(activeCount);
		this.view.setCompleteAllCheckbox(activeCount === 0);

		const hasCompleted = totalCount > 0;
		this.view.setClearCompletedButtonVisibility(hasCompleted);
		this.view.setMainVisibility(hasCompleted);
	};

	/**
	 * Set and render the active route.
	 *
	 * @param {string} rawLocationHash '' | '#/' | '#/active' | '#/completed'
	 */
	setView(rawLocationHash) {
		const route = rawLocationHash.replace(/^#\//, '');
		this.view.updateFilterButtons(route);
		this._currentRoute = route;
		this._reloadView();
	}

	_reloadView = () => {
		const route = this._currentRoute;
		this._updateItemCounts(this.todoDB.getItemCounts());
		this.view.showItems(
			route === ''
				? this.todoDB.getAllItems()
				: this.todoDB.getItemsByCompletedStatus(route === 'completed')
		);
	};

	/**
	 * Add an Item to the Store and display it in the list.
	 *
	 * @param {!string} title Title of the new item
	 */
	addItem = (title) => this.todoDB.insertItem(title);

	/**
	 * Save an Item in edit.
	 *
	 * @param {number} id ID of the Item in edit
	 * @param {!string} title New title for the Item in edit
	 */
	editItemSave(id, title) {
		if (title.length > 0) {
			this.todoDB.setItemTitle(id, title);
		} else {
			this.removeItem(id);
		}
	}

	/**
	 * Cancel the item editing mode.
	 *
	 * @param {!number} id ID of the Item in edit
	 */
	editItemCancel = (id) =>
		this.view.editItemDone(id, this.todoDB.getItemTitle(id));

	/**
	 * Remove the data and elements related to an Item.
	 *
	 * @param {!number} id Item ID of item to remove
	 */
	removeItem = (id) => this.todoDB.deleteItem(id);

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems = () => this.todoDB.deleteCompletedItems();

	/**
	 * Update an Item in storage based on the state of completed.
	 *
	 * @param {!number} id ID of the target Item
	 * @param {!boolean} completed Desired completed state
	 */
	toggleCompleted = (id, completed) =>
		this.todoDB.setItemCompletedStatus(id, completed);

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll = (completed) => this.todoDB.setAllItemsCompletedStatus(completed);
}
