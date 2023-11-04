import Controller from './controller.js';
import { $on } from './helpers.js';
import Template from './template.js';
import View from './view.js';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const sqlHistory = [
	`UPDATE todos SET completed = NOT completed`,
	`SELECT * FROM todos`,
	`DELETE FROM todos WHERE completed = 1`,
	`INSERT INTO todos (title) VALUES ('Sketch initial designs for calculating machine.')`,
];

const main = async () => {
	const template = new Template();
	const view = new View(template);

	const sqlite3 = await sqlite3InitModule();

	/**
	 * @type {Controller}
	 */
	const controller = new Controller(sqlite3, view, sqlHistory);

	const updateView = () => controller.setView(document.location.hash);
	updateView();
	$on(window, 'hashchange', updateView);

};

main();
