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

		this.database.addEventListener(this._processEvent);

		view.bindAddItem(this.addItem.bind(this));
		view.bindEditItemSave(this.editItemSave.bind(this));
		view.bindEditItemCancel(this.editItemCancel.bind(this));
		view.bindRemoveItem(this.removeItem.bind(this));
		view.bindToggleItem(this.toggleCompleted.bind(this));
		view.bindRemoveCompleted(this.removeCompletedItems.bind(this));
		view.bindToggleAll(this.toggleAll.bind(this));

		this._currentRoute = "";
	}

	_processEvent = (outerEvent) => {
		const route = this._currentRoute;
		const isCompletedRoute = route === "completed";

		const processSingleEvent = (event) => {
			const { type, id } = event;
			switch (type) {
				case "insertedItem": {
					this.view.clearNewTodo();
					// add item if it should be visible in the current route
					if (route === "" || event.completed === isCompletedRoute)
						this.view.addItem(event);
					return;
				}
				case "deletedItem":
					return this.view.removeItem(id);
				case "updatedTitle":
					return this.view.editItemDone(id, event.newTitle);
				case "updatedCompleted": {
					const { newCompleted } = event;
					if (route === "") return this.view.setItemComplete(id, newCompleted);
					// item was filtered out by the route, so remove it
					if (newCompleted !== isCompletedRoute) this.view.removeItem(id);
					return;
				}
				default:
					throw new Error("unknown event type " + type);
			}
		};

		const events =
			outerEvent.type === "batch" ? outerEvent.events : [outerEvent];
		// if we are in a filtered route and an item was toggled into view, we need to reload all items
		const wasToggledIntoView = ({ type, newCompleted }) =>
			type === "updatedCompleted" && newCompleted === isCompletedRoute;
		if (route !== "" && events.some(wasToggledIntoView)) {
			this._loadAllItemsForRoute();
		} else {
			events.forEach(processSingleEvent);
		}

		// these events can change the counts of completed and active todos
		const isCompletedChangeEvent = ({ type }) =>
			type === "insertedItem" ||
			type === "updatedCompleted" ||
			type === "deletedItem";
		if (events.some(isCompletedChangeEvent)) this._updateViewCounts();
	};

	_loadAllItemsForRoute() {
		const route = this._currentRoute;
		this.view.showItems(
			route === ""
				? this.database.getAllItems()
				: this.database.getItemsByCompletedStatus(route === "completed")
		);
	}

	/**
	 * Refresh the view from the counts of completed, active and total todos.
	 */
	_updateViewCounts() {
		const { active, completed } = this.database.getStatusCounts();

		this.view.setItemsLeft(active);
		this.view.setClearCompletedButtonVisibility(completed > 0);

		this.view.setCompleteAllCheckbox(active === 0);
		this.view.setMainVisibility(active || completed);
	}

	/**
	 * Set and render the active route.
	 *
	 * @param {string} raw '' | '#/' | '#/active' | '#/completed'
	 */
	setView(raw) {
		this._currentRoute = raw.replace(/^#\//, "");

		// these following items and status count requests should be done in a transaction,
		// otherwise we risk having inconsistencies between the two,
		// however since we are calling the database synchronously we don't need to worry for now
		this._loadAllItemsForRoute();
		this._updateViewCounts();
		this.view.updateFilterButtons(this._currentRoute);
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
