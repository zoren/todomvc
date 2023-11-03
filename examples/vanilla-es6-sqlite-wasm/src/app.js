import Controller from './controller.js';
import databaseCreateScript from './create.sql?raw';
import { addStatementTracing, addCommitHook } from './sqliteUtils.js';
import {
	getItemCounts,
	insertItem,
	setItemCompletedStatus,
} from './database.js';
import { $on } from './helpers.js';
import Template from './template.js';
import View from './view.js';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const main = async () => {
	const template = new Template();
	const view = new View(template);

	const sqlite3 = await sqlite3InitModule();
	const todoDatabase = new sqlite3.oo1.JsStorageDb('local');

	// add tracing before we run the create script so the user can see what it does
	addStatementTracing(sqlite3, todoDatabase, (type, { expanded }) => {
		if (type === 'sqlTraceExpandedStatement') view.appendSQLTrace(expanded);
	});
	todoDatabase.exec(databaseCreateScript);

	/**
	 * @type {Controller}
	 */
	const controller = new Controller(todoDatabase, view);
	// add a commit hook to update the item counts so we don't do it multiple times	for one transaction
	addCommitHook(sqlite3, todoDatabase, () =>
		controller.updateViewItemCounts(getItemCounts(todoDatabase))
	);

	// if there are no items, add some
	const { totalCount } = getItemCounts(todoDatabase);
	if (totalCount === 0) {
		const davincisTodos = [
			{ title: 'Design a new flying machine concept.', completed: true },
			{ title: 'Finish sketch of the Last Supper.', completed: true },
			{ title: 'Research the mechanics of bird flight.', completed: true },
			{ title: 'Experiment with new painting techniques.' },
			{ title: 'Write notes on fluid dynamics.' },
		];
		for (const { title, completed } of davincisTodos) {
			const id = insertItem(todoDatabase, title);
			if (completed) setItemCompletedStatus(todoDatabase, id, true);
		}
	}

	const updateView = () => controller.setView(document.location.hash);
	updateView();
	$on(window, 'hashchange', updateView);

	// listen for changes from other sessions
	window.addEventListener('storage', (event) => {
		// when other session clears the journal, it means it has committed potentially changing all data
		if (
			event.storageArea === window.localStorage &&
			event.key === 'kvvfs-local-jrnl' &&
			event.newValue === null
		)
			controller.reloadView();
	});

	// to make demos easier
	window.todoDB = todoDatabase;
};

main();
