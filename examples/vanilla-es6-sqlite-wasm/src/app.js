import Controller from './controller.js';
import { $on } from './helpers.js';
import Template from './template.js';
import View from './view.js';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const main = async () => {
	const template = new Template();
	const view = new View(template);

	const sqlite3 = await sqlite3InitModule();

	/**
	 * @type {Controller}
	 */
	const controller = new Controller(sqlite3, view);

	const updateView = () => controller.setView(window.location.hash);
	updateView();
	$on(window, 'hashchange', updateView);
};

main();
