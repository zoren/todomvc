import Controller from './controller.js';
import TodoDatabase from './database.js';
import { $on } from './helpers.js';
import Template from './template.js';
import View from './view.js';

const template = new Template();
const view = new View(template);

const todoDatabase = new TodoDatabase();
/**
 * @type {Controller}
 */
const controller = new Controller(todoDatabase, view);
const updateView = () => controller.setView(document.location.hash);
updateView();
$on(window, 'hashchange', updateView);

// some debugging helpers
window.dumpTodos = () =>
	console.table(
		Object.fromEntries(
			todoDatabase
				.getAllItems()
				.map(({ id, title, completed }) => [id, { title, completed }])
		)
	);

window.davinci = () => {
	todoDatabase.getAllItems().forEach(({ id }) => todoDatabase.removeItem(id));
	const davincisTodos = [
		{ title: 'Design a new flying machine concept.', completed: true },
		{ title: 'Finish sketch of the Last Supper.', completed: true },
		{ title: 'Research the mechanics of bird flight.', completed: true },
		{ title: 'Experiment with new painting techniques.', completed: false },
		{ title: 'Write notes on fluid dynamics.', completed: false },
	];
	for (const { title, completed } of davincisTodos) {
		todoDatabase.addItem(title, completed);
	}
};

{
	const { activeCount, completedCount } = todoDatabase.getStatusCounts();
	if (activeCount === 0 && completedCount === 0) davinci();
}
window.todoDB = todoDatabase;
