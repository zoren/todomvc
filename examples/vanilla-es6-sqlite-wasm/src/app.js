import Controller from './controller.js';
import TodoDatabase from './database.js';
import { $on } from './helpers.js';
import Template from './template.js';
import View from './view.js';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const main = async () => {
	const template = new Template();
	const view = new View(template);

	const sqlite3 = await sqlite3InitModule();

	const todoDatabase = new TodoDatabase(sqlite3);
	/**
	 * @type {Controller}
	 */
	const controller = new Controller(todoDatabase, view);
	todoDatabase.init()
	// if there are no items, add some
	const { totalCount } = todoDatabase.getItemCounts();
	if (totalCount === 0) {
		const davincisTodos = [
			{ title: 'Design a new flying machine concept.', completed: true },
			{ title: 'Finish sketch of the Last Supper.', completed: true },
			{ title: 'Research the mechanics of bird flight.', completed: true },
			{ title: 'Experiment with new painting techniques.' },
			{ title: 'Write notes on fluid dynamics.' },
		];
		for (const { title, completed } of davincisTodos) {
			const id = todoDatabase.insertItem(title);
			if (completed) todoDatabase.setItemCompletedStatus(id, true);
		}
	}

	const updateView = () => controller.setView(document.location.hash);
	updateView();
	$on(window, 'hashchange', updateView);

	// to make demos easier
	window.todoDB = todoDatabase;
};

main();
