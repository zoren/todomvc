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

	const updateView = () => {
		let hash = window.location.hash;
		if (
			hash !== '' &&
			hash !== '#/' &&
			hash !== '#/active' &&
			hash !== '#/completed'
		) {
			console.warn(`Invalid hash route: '${hash}' setting all`);
			hash = window.location.hash = '#/';
		}
		controller.setView(hash.replace(/^#\//, ''));
	};
	updateView();
	$on(window, 'hashchange', updateView);
};

main();
