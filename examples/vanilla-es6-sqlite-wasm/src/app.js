import Controller from './controller.js';
import TodoDatabase from './database.js';
import { $on } from './helpers.js';
import Template from './template.js';
import View from './view.js';
import sqlite3InitModule from '../node_modules/@sqlite.org/sqlite-wasm/index.mjs';

const main = async () => {
	const template = new Template();
	const view = new View(template);

	const sqlite3 = await sqlite3InitModule();

	const todoDatabase = new TodoDatabase(sqlite3);
	/**
	 * @type {Controller}
	 */
	const controller = new Controller(todoDatabase, view);
	const updateView = () => controller.setView(document.location.hash);
	updateView();
	$on(window, 'hashchange', updateView);

	// to make demos easier
	window.todoDB = todoDatabase;
};

main();
