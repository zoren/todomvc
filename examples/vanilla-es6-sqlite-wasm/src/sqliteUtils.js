export const addStatementTracing = (sqlite3, db, tracers) => {
	const { capi, wasm } = sqlite3;
	const { traceStatement, traceExpandedStatement } = tracers;
	const wasmTraceFn = wasm.installFunction(
		'i(ippp)',
		(traceEventCode, _ctxPtr, p, x) => {
			if (traceEventCode !== capi.SQLITE_TRACE_STMT) return;
			const preparedStatement = p;
			const sqlTextCstr = x;
			const sqlText = wasm.cstrToJs(sqlTextCstr);
			// if the statement is a comment, trace it, otherwise expand it and trace it
			// https://sqlite.org/c3ref/c_trace.html
			if (sqlText.startsWith('--')) {
				if (traceStatement) traceStatement(sqlText);
			} else {
				// expand bound parameters into sql statement
				if (traceExpandedStatement) {
					const expandedSQLText = capi.sqlite3_expanded_sql(preparedStatement);
					traceExpandedStatement(expandedSQLText);
				}
			}
		}
	);
	capi.sqlite3_trace_v2(
		db,
		capi.SQLITE_TRACE_STMT,
		wasmTraceFn,
		0 // passed in as _ctxPtr
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
