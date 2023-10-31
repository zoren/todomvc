import {ItemList} from './item.js';

import {escapeForHTML} from './helpers.js';

export default class Template {
	itemHTML = ({id, completed, title}) => `
	<li data-id="${id}"${completed ? ' class="completed"' : ''}>
		<div class="view">
			<input class="toggle" type="checkbox" ${completed ? 'checked' : ''}>
			<label>${escapeForHTML(title)}</label>
			<button class="destroy"></button>
		</div>
	</li>`

	itemDOM = ({id, completed, title}) => {
		const li = document.createElement('li');
		li.setAttribute('data-id', id);
		if (completed) li.classList.add('completed');
		li.innerHTML = `
		<div class="view">
			<input class="toggle" type="checkbox" ${completed ? 'checked' : ''}>
			<label>${escapeForHTML(title)}</label>
			<button class="destroy"></button>
		</div>`;
		return li;
	}

	/**
	 * Format the contents of a todo list.
	 *
	 * @param {ItemList} items Object containing keys you want to find in the template to replace.
	 * @returns {!string} Contents for a todo list
	 *
	 * @example
	 * view.show({
	 *	id: 1,
	 *	title: "Hello World",
	 *	completed: false,
	 * })
	 */
	itemList(items) {
		return items.reduce((a, item) => a + this.itemHTML(item), '');
	}

	/**
	 * Format the contents of an "items left" indicator.
	 *
	 * @param {number} activeTodos Number of active todos
	 *
	 * @returns {!string} Contents for an "items left" indicator
	 */
	itemCounter(activeTodos) {
		return `${activeTodos} item${activeTodos !== 1 ? 's' : ''} left`;
	}
}
