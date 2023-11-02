import {ItemList} from './item.js';
import {qs, $on, $delegate} from './helpers.js';
import Template from './template.js';

const _itemId = element => parseInt(element.parentNode.dataset.id || element.parentNode.parentNode.dataset.id, 10);
const ENTER_KEY = 13;
const ESCAPE_KEY = 27;

export default class View {
	/**
	 * @param {!Template} template A Template instance
	 */
	constructor(template) {
		this.template = template;
		this.$todoList = qs('.todo-list');
		this.$todoItemCounter = qs('.todo-count');
		this.$clearCompleted = qs('.clear-completed');
		this.$main = qs('.main');
		this.$toggleAll = qs('.toggle-all');
		this.$newTodo = qs('.new-todo');
		$delegate(this.$todoList, 'li label', 'dblclick', ({target}) => {
			this.editItem(target);
		});

		this.$sqlTrace = qs('.sql-trace');
		this.$sqlConsole = qs('.sql-console');
		this.$sqlInput = qs('.sql-input');

		window.addEventListener('keydown', (event) => {
			if (event.key == '`') {
				event.preventDefault();
				const style = this.$sqlConsole.style;
				style.display = style.display == 'none' ? 'block' : 'none';
			}
		});
	}


	/**
	 * Put an item into edit mode.
	 *
	 * @param {!Element} target Target Item's label Element
	 */
	editItem(target) {
		const listItem = target.parentElement.parentElement;

		listItem.classList.add('editing');

		const input = document.createElement('input');
		input.className = 'edit';

		input.value = target.innerText;
		listItem.appendChild(input);
		input.focus();
	}

	/**
	 * Populate the todo list with a list of items.
	 *
	 * @param {ItemList} items Array of items to display
	 */
	showItems(items) {
		this.$todoList.innerHTML = this.template.itemList(items);
	}

	/**
	 * Add an item to the todo list.
	 * @param {Item} item Item to render
	 */
	addItem(item) {
		for (const domItem of this.$todoList.children) {
			if (parseInt(domItem.getAttribute("data-id")) > item.id) {
				this.$todoList.insertBefore(this.template.itemDOM(item), domItem);
				return;
			}
		}
		this.$todoList.insertAdjacentHTML('beforeend', this.template.itemHTML(item));
	}

	/**
	 * Remove an item from the view.
	 *
	 * @param {number} id Item ID of the item to remove
	 */
	removeItem(id) {
		const elem = qs(`[data-id="${id}"]`);

		if (elem) {
			this.$todoList.removeChild(elem);
		}
	}

	/**
	 * Set the number in the 'items left' display.
	 *
	 * @param {number} itemsLeft Number of items left
	 */
	setItemsLeft(itemsLeft) {
		this.$todoItemCounter.innerHTML = this.template.itemCounter(itemsLeft);
	}

	/**
	 * Set the visibility of the "Clear completed" button.
	 *
	 * @param {boolean|number} visible Desired visibility of the button
	 */
	setClearCompletedButtonVisibility(visible) {
		this.$clearCompleted.style.display = !!visible ? 'block' : 'none';
	}

	/**
	 * Set the visibility of the main content and footer.
	 *
	 * @param {boolean|number} visible Desired visibility
	 */
	setMainVisibility(visible) {
		this.$main.style.display = !!visible ? 'block' : 'none';
	}

	/**
	 * Set the checked state of the Complete All checkbox.
	 *
	 * @param {boolean|number} checked The desired checked state
	 */
	setCompleteAllCheckbox(checked) {
		this.$toggleAll.checked = !!checked;
	}

	/**
	 * Change the appearance of the filter buttons based on the route.
	 *
	 * @param {string} route The current route
	 */
	updateFilterButtons(route) {
		qs('.filters .selected').className = '';
		qs(`.filters [href="#/${route}"]`).className = 'selected';
	}

	/**
	 * Clear the new todo input
	 */
	clearNewTodo() {
		this.$newTodo.value = '';
	}

	/**
	 * Render an item as either completed or not.
	 *
	 * @param {!number} id Item ID
	 * @param {!boolean} completed True if the item is completed
	 */
	setItemComplete(id, completed) {
		const listItem = qs(`[data-id="${id}"]`);

		if (!listItem) {
			return;
		}

		listItem.className = completed ? 'completed' : '';

		// In case it was toggled from an event and not by clicking the checkbox
		qs('input', listItem).checked = completed;
	}

	/**
	 * Bring an item out of edit mode.
	 *
	 * @param {!number} id Item ID of the item in edit
	 * @param {!string} title New title for the item in edit
	 */
	editItemDone(id, title) {
		const listItem = qs(`[data-id="${id}"]`);

		const input = qs('input.edit', listItem);
		if (input) listItem.removeChild(input);

		listItem.classList.remove('editing');

		qs('label', listItem).textContent = title;
	}

	/**
	 * @param {Function} handler Function called on synthetic event.
	 */
	bindAddItem(handler) {
		$on(this.$newTodo, 'change', ({target}) => {
			const title = target.value.trim();
			if (title) {
				handler(title);
			}
		});
	}

	/**
	 * @param {Function} handler Function called on synthetic event.
	 */
	bindRemoveCompleted(handler) {
		$on(this.$clearCompleted, 'click', handler);
	}

	/**
	 * @param {Function} handler Function called on synthetic event.
	 */
	bindToggleAll(handler) {
		$on(this.$toggleAll, 'click', ({target}) => {
			handler(target.checked);
		});
	}

	/**
	 * @param {Function} handler Function called on synthetic event.
	 */
	bindRemoveItem(handler) {
		$delegate(this.$todoList, '.destroy', 'click', ({target}) => {
			handler(_itemId(target));
		});
	}

	/**
	 * @param {Function} handler Function called on synthetic event.
	 */
	bindToggleItem(handler) {
		$delegate(this.$todoList, '.toggle', 'click', ({target}) => {
			handler(_itemId(target), target.checked);
		});
	}

	/**
	 * @param {Function} handler Function called on synthetic event.
	 */
	bindEditItemSave(handler) {
		$delegate(this.$todoList, 'li .edit', 'blur', ({target}) => {
			if (!target.dataset.iscanceled) {
				handler(_itemId(target), target.value.trim());
			}
		}, true);

		// Remove the cursor from the input when you hit enter just like if it were a real form
		$delegate(this.$todoList, 'li .edit', 'keypress', ({target, keyCode}) => {
			if (keyCode === ENTER_KEY) {
				target.blur();
			}
		});
	}

	/**
	 * @param {Function} handler Function called on synthetic event.
	 */
	bindEditItemCancel(handler) {
		$delegate(this.$todoList, 'li .edit', 'keyup', ({target, keyCode}) => {
			if (keyCode === ESCAPE_KEY) {
				target.dataset.iscanceled = true;
				target.blur();

				handler(_itemId(target));
			}
		});
	}

	setSqlInputValue(value) {
		const input = this.$sqlInput;
		input.value = value;
		// put cursor at the end
		// from: https://alvarotrigo.com/blog/move-cursor-to-end-input/
		setTimeout(() => {
			input.selectionStart = input.selectionEnd = value.length;
			input.focus();
		});
	}

	bindSQLConsoleHistory(handler) {
		this.$sqlConsole.addEventListener('keydown', ({key}) => {
			if (key === 'ArrowUp') handler(-1);
			if (key === 'ArrowDown') handler(1);
		});
	}

	bindEvalSQL(handler) {
		$on(this.$sqlConsole, 'submit', (event) => {
			event.preventDefault();
			handler(this.$sqlInput.value);
		});
	}

	_makeTraceElement(traceObject) {
		if (typeof traceObject === 'string') {
			const sqlDiv = document.createElement('div');
			sqlDiv.innerText = traceObject;
			return sqlDiv;
		} else if (traceObject instanceof Error) {
			const sqlDiv = document.createElement('div');
			sqlDiv.className = 'sql-error';
			sqlDiv.innerText = traceObject.message;
			return sqlDiv;
		} else if (Array.isArray(traceObject)) {
			if (traceObject.length === 0) return null;
			const colums = Object.keys(traceObject[0]);
			const table = document.createElement('table');
			const thead = document.createElement('thead');
			const tbody = document.createElement('tbody');
			const tr = document.createElement('tr');
			for (const column of colums) {
				const th = document.createElement('th');
				th.append(column);
				tr.append(th);
			}
			thead.append(tr);
			table.append(thead);
			for (const row of traceObject) {
				const tr = document.createElement('tr');
				for (const column of colums) {
					const td = document.createElement('td');
					td.append(row[column]);
					tr.append(td);
				}
				tbody.append(tr);
			}
			table.append(tbody);
			return table;
		}
		return null;
	}

	appendSQLTrace(traceObject) {
		const div = this._makeTraceElement(traceObject);
		// we prepend because the trace is rendered in reverse order to make it scroll to the bottom automatically
		if (div) this.$sqlTrace.prepend(div);
	}
}
