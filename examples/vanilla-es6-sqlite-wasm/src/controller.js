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

		this.database.addEventListener('insertedItem', (event) => {
			this.view.clearNewTodo();
			const route = this._currentRoute;
			// add item if it should be visible in the current route
			if (route === '' || event.completed === (route === 'completed'))
				this.view.addItem(event);
		});

		this.database.addEventListener('deletedItem', ({ id }) =>
			this.view.removeItem(id)
		);

		this.database.addEventListener('updatedTitle', ({ id, title }) =>
			this.view.editItemDone(id, title)
		);

		this.database.addEventListener('updatedCompleted', ({ id, completed }) => {
			const route = this._currentRoute;

			if (route === '') return this.view.setItemComplete(id, completed);
			// add/remove item if it should be visible in the current route
			if (completed === (route === 'completed'))
				this.view.addItem({
					id,
					title: this.database.getItemTitle(id),
					completed,
				});
			else this.view.removeItem(id);
		});

		this.database.addEventListener('changedCompletedCount', (event) =>
			this._updateViewCounts(event)
		);

		this.database.addEventListener('updateAllTodos', this._reloadView);

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem(this.toggleCompleted.bind(this));
		view.bindRemoveCompleted(this.removeCompletedItems.bind(this));
		view.bindToggleAll(this.toggleAll.bind(this));

		this._currentRoute = '';
	}

	/**
	 * Refresh the view from the counts of completed, active and total todos.
	 */
	_updateViewCounts({ activeCount, completedCount }) {
		this.view.setItemsLeft(activeCount);
		this.view.setCompleteAllCheckbox(activeCount === 0);

		this.view.setClearCompletedButtonVisibility(completedCount > 0);
		this.view.setMainVisibility(activeCount > 0 || completedCount > 0);
	}

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
		this.view.showItems(
			route === ''
				? this.database.getAllItems()
				: this.database.getItemsByCompletedStatus(route === 'completed')
		);
		this._updateViewCounts(this.database.getStatusCounts());
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
		if (title.length > 0) {
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
	editItemCancel = (id) =>
		this.view.editItemDone(id, this.database.getItemTitle(id));

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
	toggleCompleted = (id, completed) =>
		this.database.setItemCompletedStatus(id, completed);

	/**
	 * Set all items to complete or active.
	 *
	 * @param {boolean} completed Desired completed state
	 */
	toggleAll = (completed) =>
		this.database.setAllItemsCompletedStatus(completed);
}
