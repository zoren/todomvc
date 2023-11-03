export const addStatementTracing = (sqlite3, db, callback) => {
	const { capi, wasm } = sqlite3;
	capi.sqlite3_trace_v2(
		db,
		capi.SQLITE_TRACE_STMT,
		wasm.installFunction('i(ippp)', (traceEventCode, _ctxPtr, p, x) => {
			if (traceEventCode !== capi.SQLITE_TRACE_STMT) return;
			const preparedStatement = p;
			const sqlTextCstr = x;
			const sqlText = wasm.cstrToJs(sqlTextCstr);
			if (sqlText.startsWith('--')) {
				callback('sqlTraceStatement', { sqlText });
			} else {
				// expand bound parameters into sql statement
				const expanded = capi.sqlite3_expanded_sql(preparedStatement);
				callback('sqlTraceExpandedStatement', { expanded });
			}
		}),
		0 // passed in as ctxPtr to traceToEvents
	);
};

export const addCommitHook = (sqlite3, db, callback) => {
	const { capi, wasm } = sqlite3;
	capi.sqlite3_commit_hook(
		db,
		wasm.installFunction('i(p)', (_ctxPtr) => {
			callback();
			return 0;
		}),
		0
	);
};
