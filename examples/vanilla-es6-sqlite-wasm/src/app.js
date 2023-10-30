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
// listen for changes from other sessions
addEventListener("storage", (event) => {
	// when other sessions sqlite clears the journal, it means it has committed and we can update our view
	if (
		event.storageArea === localStorage &&
		event.key === "kvvfs-local-jrnl" &&
		event.newValue === null
	)
		setView();
});

// some debugging helpers
window.execSQL = (sql) => {
	const rows = sqlDatabase.selectObjects(sql);
	if (rows.length > 0) console.table(rows);
};
window.bulkExecSQL = (sql) => {
	const rows = todoDatabase.bulkExec(sql);
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
window.todoDB = todoDatabase;

window.davinci = () => {
	todoDatabase._bulkStatusUpdate(() => {
		sqlDatabase.exec(`delete from todos;`);
		const davincisTodos = [
			{ title: "Design a new flying machine concept.", completed: true },
			{ title: "Finish sketch of the Last Supper.", completed: true },
			{ title: "Research the mechanics of bird flight.", completed: true },
			{ title: "Experiment with new painting techniques.", completed: false },
			{ title: "Write notes on fluid dynamics.", completed: false },
		];
		for (const { title, completed } of davincisTodos) {
			sqlDatabase.exec(
				`INSERT INTO todos (title, completed) VALUES ($title, $completed)`,
				{
					bind: { $title: title, $completed: completed },
				}
			);
		}
	});
};
