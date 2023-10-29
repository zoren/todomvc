import TodoDatabase from './database.js';
import View from './view.js';

export default class Controller {
	/**
	 * @param  {!TodoDatabase} database A TodoDatabase instance
	 * @param  {!View} view A View instance
	 */
	constructor(database, view) {
		this.database = database;
		this.view = view;

		database.addEventListener('insertedItem', (item) => {
			this.view.clearNewTodo();
			this.view.addItem(item);
		});

		database.addEventListener('deletedItem', ({ id }) =>
			this.view.removeItem(id)
		);

		database.addEventListener('updatedTitle', ({ id, newTitle }) =>
			this.view.editItemDone(id, newTitle)
		);

		database.addEventListener('updatedCompleted', ({ id, newCompleted }) =>
			this.view.setItemComplete(id, newCompleted)
		);

		database.addEventListener('updateItemCounts', (counts) =>
			this._updateViewCounts(counts)
		);

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

		// these following items and status count requests should be done in a transaction
		// so otherwise we risk having inconsistent data between the two
		// however I've been unsuccessful in getting read transactions to work as expected
		const items =
			route === ''
				? this.database.getAllItems()
				: this.database.getItemsByCompletedStatus(route === 'completed');
		const statusCounts = this.database.getStatusCounts();

		this.view.showItems(items);
		this._updateViewCounts(statusCounts);
		this.view.updateFilterButtons(route);
	}

	/**
	 * Add an Item to the Store and display it in the list.
	 *
	 * @param {!string} title Title of the new item
	 */
	addItem = (title) => this.database.addItem(title);

	/**
	 * Save an Item in edit.
	 *
	 * @param {number} id ID of the Item in edit
	 * @param {!string} title New title for the Item in edit
	 */
	editItemSave(id, title) {
		if (title.length) {
			this.database.setItemTitle(id, title);
		} else {
			this.removeItem(id);
		}
	}

	/**
	 * Cancel the item editing mode.
	 *
	 * @param {!number} id ID of the Item in edit
	 */
	editItemCancel = (id) => this.view.editItemDone(id, this.database.getItemTitle(id));

	/**
	 * Remove the data and elements related to an Item.
	 *
	 * @param {!number} id Item ID of item to remove
	 */
	removeItem = (id) => this.database.deleteItem(id);

	/**
	 * Remove all completed items.
	 */
	removeCompletedItems = () => this.database.deleteCompletedItems();

	/**
	 * Update an Item in storage based on the state of completed.
	 *
	 * @param {!number} id ID of the target Item
	 * @param {!boolean} completed Desired completed state
	 */
	toggleCompleted = (id, completed) => this.database.setItemCompletedStatus(id, completed);

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll = (completed) => this.database.setAllItemsCompletedStatus(completed);

	/**
	 * Refresh the view from the counts of completed, active and total todos.
	 */
	_updateViewCounts({ active, completed }) {
		this.view.setItemsLeft(active);
		this.view.setClearCompletedButtonVisibility(!!completed);

		this.view.setCompleteAllCheckbox(active === 0);
		this.view.setMainVisibility(active || completed);
	}
}
