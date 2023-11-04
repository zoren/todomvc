import * as TodoDB from './database.js';
import View from './view.js';

export default class Controller {
	/**
	 * @param  {!Database} ooDB A sqlite3 oo1 Database instance
	 * @param  {!View} view A View instance
	 * @param  {!Array<string>} sqlHistory A list of SQL statements
	 */
	constructor(ooDB, view, sqlHistory) {
		this.ooDB = ooDB;
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

		// insert item trigger
		ooDB.createFunction('inserted_item_fn', (_ctxPtr, id, title, completed) => {
			this.view.clearNewTodo();
			const route = this._currentRoute;
			// add item if it should be visible in the current route
			if (route === '' || completed === (route === 'completed'))
				this.view.addItem({ id, title, completed: !!completed });
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
		ooDB.createFunction('updated_completed_fn', (_ctxPtr, id, completed) => {
			const route = this._currentRoute;
			if (route === '') {
				this.view.setItemComplete(id, completed);
			} else {
				// add/remove item if it should be visible in the current route
				if (completed === (route === 'completed'))
					this.view.addItem({
						id,
						title: getItemTitle(this.ooDB, id),
						completed,
					});
				else this.view.removeItem(id);
			}
		});

		ooDB.exec(`
CREATE TEMPORARY TRIGGER update_completed_trigger AFTER UPDATE OF completed ON todos
	WHEN old.completed <> new.completed
	BEGIN SELECT updated_completed_fn(new.id, new.completed); END`);
	}

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
		this.updateViewItemCounts(TodoDB.getItemCounts(this.ooDB));
		this.view.showItems(
			route === ''
				? TodoDB.getAllItems(this.ooDB)
				: TodoDB.getItemsByCompletedStatus(this.ooDB, route === 'completed')
		);
	};

	/**
	 * Add an Item to the Store and display it in the list.
	 *
	 * @param {!string} title Title of the new item
	 */
	addItem = (title) => TodoDB.insertItem(this.ooDB, title);

	/**
	 * Save an Item in edit.
	 *
	 * @param {number} id ID of the Item in edit
	 * @param {!string} title New title for the Item in edit
	 */
	editItemSave(id, title) {
		if (title.length > 0) {
			TodoDB.setItemTitle(this.ooDB, id, title);
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
		this.view.editItemDone(id, TodoDB.getItemTitle(this.ooDB, id));

	/**
	 * Remove the data and elements related to an Item.
	 *
	 * @param {!number} id Item ID of item to remove
	 */
	removeItem = (id) => TodoDB.deleteItem(this.ooDB, id);

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems = () => TodoDB.deleteCompletedItems(this.ooDB);

	/**
	 * Update an Item in storage based on the state of completed.
	 *
	 * @param {!number} id ID of the target Item
	 * @param {!boolean} completed Desired completed state
	 */
	toggleCompleted = (id, completed) =>
		TodoDB.setItemCompletedStatus(this.ooDB, id, completed);

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll = (completed) =>
		TodoDB.setAllItemsCompletedStatus(this.ooDB, completed);
}
