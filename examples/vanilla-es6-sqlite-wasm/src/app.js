import Controller from './controller.js';
import {$on} from './helpers.js';
import Template from './template.js';
import Store from './store.js';
import View from './view.js';
import sqlite3InitModule from '../node_modules/@sqlite.org/sqlite-wasm/index.mjs';

const store = new Store('todos-vanilla-es6');

const template = new Template();
const view = new View(template);

const sqlite3 = await sqlite3InitModule({
	print: (...args) => console.log(...args),
	printErr: (...args) => console.error(...args),
})
const sqlDatabase = new sqlite3.oo1.JsStorageDb('local');
/**
 * @type {Controller}
 */
const controller = new Controller(store, sqlDatabase, view);
const setView = () => controller.setView(document.location.hash);
setView();
$on(window, 'hashchange', setView);
