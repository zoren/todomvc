import * as TodoDB from './database.js';
import View from './view.js';

export default class Controller {
	/**
	 * @param  {!Database} todoDB A sqlite3 oo1 Database instance
	 * @param  {!View} view A View instance
	 * @param  {!Array<string>} sqlHistory A list of SQL statements
	 */
	constructor(todoDB, view, sqlHistory) {
		this.todoDB = todoDB;
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

		this._currentRoute = '';
		this._sqlHistory = sqlHistory;
		this._sqlHistoryIndex = sqlHistory.length;

		this._addListeners();
	}

	_addListeners() {
		const insertedItem = (event) => {
			this.view.clearNewTodo();
			const route = this._currentRoute;
			// add item if it should be visible in the current route
			if (route === '' || event.completed === (route === 'completed'))
				this.view.addItem(event);
		};

		const deletedItem = ({ id }) => this.view.removeItem(id);

		const updatedTitle = ({ id, title }) => this.view.editItemDone(id, title);

		const updatedCompleted = ({ id, completed }) => {
			const route = this._currentRoute;
			if (route === '') {
				this.view.setItemComplete(id, completed);
			} else {
				// add/remove item if it should be visible in the current route
				if (completed === (route === 'completed'))
					this.view.addItem({
						id,
						title: getItemTitle(this.todoDB, id),
						completed,
					});
				else this.view.removeItem(id);
			}
		};

		const dispatchEvent = (type, data) => {
			switch (type) {
				case 'insertedItem':
					return insertedItem(data);
				case 'deletedItem':
					return deletedItem(data);
				case 'updatedTitle':
					return updatedTitle(data);
				case 'updatedCompleted':
					return updatedCompleted(data);
			}
		};

		TodoDB.createTriggers(this.todoDB, dispatchEvent);
	}

	evalSQL = (sql) => {
		try {
			const sqlHistory = this._sqlHistory;
			this.view.appendSQLTrace(this.todoDB.selectObjects(sql));
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

	/**
	 * Refresh the view from the counts of completed, active and total todos.
	 */
	updateViewItemCounts = ({ activeCount, totalCount }) => {
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
		this.reloadView();
	}

	reloadView = () => {
		const route = this._currentRoute;
		this.updateViewItemCounts(TodoDB.getItemCounts(this.todoDB));
		this.view.showItems(
			route === ''
				? TodoDB.getAllItems(this.todoDB)
				: TodoDB.getItemsByCompletedStatus(this.todoDB, route === 'completed')
		);
	};

	/**
	 * Add an Item to the Store and display it in the list.
	 *
	 * @param {!string} title Title of the new item
	 */
	addItem = (title) => TodoDB.insertItem(this.todoDB, title);

	/**
	 * Save an Item in edit.
	 *
	 * @param {number} id ID of the Item in edit
	 * @param {!string} title New title for the Item in edit
	 */
	editItemSave(id, title) {
		if (title.length > 0) {
			TodoDB.setItemTitle(this.todoDB, id, title);
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
		this.view.editItemDone(id, TodoDB.getItemTitle(this.todoDB, id));

	/**
	 * Remove the data and elements related to an Item.
	 *
	 * @param {!number} id Item ID of item to remove
	 */
	removeItem = (id) => TodoDB.deleteItem(this.todoDB, id);

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems = () => TodoDB.deleteCompletedItems(this.todoDB);

	/**
	 * Update an Item in storage based on the state of completed.
	 *
	 * @param {!number} id ID of the target Item
	 * @param {!boolean} completed Desired completed state
	 */
	toggleCompleted = (id, completed) =>
		TodoDB.setItemCompletedStatus(this.todoDB, id, completed);

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll = (completed) =>
		TodoDB.setAllItemsCompletedStatus(this.todoDB, completed);
}
