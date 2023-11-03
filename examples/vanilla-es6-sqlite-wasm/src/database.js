export const createTriggers = (db, dispatchEvent) => {
	// insert item trigger
	db.createFunction('inserted_item_fn', (_ctxPtr, id, title, completed) =>
		dispatchEvent('insertedItem', { id, title, completed: !!completed })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER insert_trigger AFTER INSERT ON todos
	BEGIN SELECT inserted_item_fn(new.id, new.title, new.completed); END`);

	// delete item trigger
	db.createFunction('deleted_item_fn', (_ctxPtr, id) =>
		dispatchEvent('deletedItem', { id })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER delete_trigger AFTER DELETE ON todos
	BEGIN SELECT deleted_item_fn(old.id); END`);

	// update item title trigger
	db.createFunction('updated_title_fn', (_ctxPtr, id, title) =>
		dispatchEvent('updatedTitle', { id, title })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER update_title_trigger AFTER UPDATE OF title ON todos
	WHEN old.title <> new.title
	BEGIN SELECT updated_title_fn(new.id, new.title); END`);

	// update item completed status trigger
	db.createFunction('updated_completed_fn', (_ctxPtr, id, completed) =>
		dispatchEvent('updatedCompleted', { id, completed: !!completed })
	);

	db.exec(`
CREATE TEMPORARY TRIGGER update_completed_trigger AFTER UPDATE OF completed ON todos
  WHEN old.completed <> new.completed
  BEGIN SELECT updated_completed_fn(new.id, new.completed); END`);
};

export const getItemCounts = (db) =>
	db.selectObject(
		`SELECT active_count as activeCount, total_count as totalCount FROM todo_counts`
	);

export const insertItem = (db, $title) =>
	db.selectValue(`INSERT INTO todos (title) VALUES ($title) RETURNING id`, {
		$title,
	});

export const setItemTitle = (db, $id, $title) =>
	db.exec(`UPDATE todos SET title = $title WHERE id = $id`, {
		bind: { $id, $title },
	});

export const setItemCompletedStatus = (db, $id, $completed) =>
	db.exec(`UPDATE todos SET completed = $completed WHERE id = $id`, {
		bind: { $id, $completed },
	});

export const getItemTitle = (db, $id) =>
	db.selectValue(`SELECT title FROM todos WHERE id = $id`, { $id });

export const getAllItems = (db) =>
	db
		.selectObjects(`SELECT id, title, completed FROM todos`)
		.map((item) => ({ ...item, completed: !!item.completed }));

export const getItemsByCompletedStatus = (db, $completed) =>
	db
		.selectObjects(
			`SELECT id, title, completed FROM todos WHERE completed = $completed`,
			{ $completed }
		)
		.map((item) => ({ ...item, completed: !!item.completed }));

export const deleteItem = (db, $id) =>
	db.exec(`DELETE FROM todos WHERE id = $id`, { bind: { $id } });

export const deleteCompletedItems = (db) =>
	db.exec(`DELETE FROM todos WHERE completed = 1`);

export const setAllItemsCompletedStatus = (db, $completed) =>
	db.exec(`UPDATE todos SET completed = $completed`, {
		bind: { $completed },
	});
