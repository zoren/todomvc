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
