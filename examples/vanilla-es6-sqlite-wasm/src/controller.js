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
			if (this.isAllRoute() || !!item.completed === this.isCompletedRoute())
				this.view.addItem(item);
		});

		database.addEventListener('deletedItem', ({ id }) =>
			this.view.removeItem(id)
		);

		database.addEventListener('updatedTitle', ({ id, newTitle }) =>
			this.view.editItemDone(id, newTitle)
		);

		database.addEventListener('updatedCompleted', ({ id, newCompleted }) => {
			if (this.isAllRoute()) {
				this.view.setItemComplete(id, newCompleted);
			} else {
				this.view.showItems(
					this.database.getItemsByCompletedStatus(this.isCompletedRoute())
				);
			}
		});

		database.addEventListener('changedItemCounts', (counts) =>
			this._updateViewCounts(counts)
		);

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem(this.toggleCompleted.bind(this));
		view.bindRemoveCompleted(this.removeCompletedItems.bind(this));
		view.bindToggleAll(this.toggleAll.bind(this));

		this._activeRoute = '';
	}

	isAllRoute = () => this._activeRoute === '';
	
	isCompletedRoute = () => this._activeRoute === 'completed';

	/**
	 * Set and render the active route.
	 *
	 * @param {string} raw '' | '#/' | '#/active' | '#/completed'
	 */
	setView(raw) {
		this._activeRoute = raw.replace(/^#\//, '');

		// these following items and status count requests should be done in a transaction,
		// otherwise we risk having inconsistencies between the two,
		// however since we are calling the database synchronously we don't need to worry about for now
		const items =
			this.isAllRoute()
				? this.database.getAllItems()
				: this.database.getItemsByCompletedStatus(this.isCompletedRoute());
		const statusCounts = this.database.getStatusCounts();

		this.view.showItems(items);
		this._updateViewCounts(statusCounts);
		this.view.updateFilterButtons(this._activeRoute);
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
