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

// to make demos easier
window.todoDB = todoDatabase;
