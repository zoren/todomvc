import Controller from './controller.js';
import TodoDatabase from './database.js';
import {$on} from './helpers.js';
import Template from './template.js';
import View from './view.js';
import sqlite3InitModule from '../node_modules/@sqlite.org/sqlite-wasm/index.mjs';

const template = new Template();
const view = new View(template);

const sqlite3 = await sqlite3InitModule({
	print: (...args) => console.log(...args),
	printErr: (...args) => console.error(...args),
})
const sqlDatabase = new sqlite3.oo1.JsStorageDb('local');
const todoDatabase = new TodoDatabase(sqlDatabase);
/**
 * @type {Controller}
 */
const controller = new Controller(todoDatabase, view);
const setView = () => controller.setView(document.location.hash);
setView();
$on(window, 'hashchange', setView);

// some debugging helpers
window.execSQL = (sql) => {
	const rows = sqlDatabase.selectObjects(sql);
	if (rows.length > 0) console.table(rows);
};
window.dumpTodos = () =>
	console.table(
		Object.fromEntries(
			sqlDatabase
				.selectObjects("SELECT * FROM todos")
				.map(({ id, title, completed }) => [
					id,
					{ title, completed: !!completed },
				])
		)
	);
