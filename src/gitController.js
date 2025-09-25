import * as gitService from './gitService.js';
import logger from './logger.js';

const git = gitService.default;

const wrapAsync = fn => async (req, res, next) => {
	try {
		const result = await fn(req, res);
		res.json({ data: result });
	} catch (err) {
		next(err);
	}
}

const isRepository = wrapAsync((req) => {
	return gitService.isGitRepository(req.query.dir);
});

// Repository
export const gitRepositoryController = {
	isRepository,
	init: wrapAsync(req => git('init', req.body)),
	commit: wrapAsync(req => git('commit', req.body)),
	log: wrapAsync(req => git('log', req.body)),
	checkout: wrapAsync(req => git('checkout', req.body)),
	fastForward: wrapAsync(req => git('fastForward', req.body)),
	merge: wrapAsync(req => git('merge', req.body)),
	abortMerge: wrapAsync(req => git('abortMerge', req.body)),
	stash: wrapAsync(req => git('stash', req.body))
}

// Config
export const gitConfigController = {
	setConfig: wrapAsync(req => git('setConfig', req.body)),
	getConfig: wrapAsync(req => git('getConfig', req.body)),
	getConfigAll: wrapAsync(req => git('getConfigAll', req.body))
}

// Branches
export const gitBranchController = {
	currentBranch: wrapAsync(req => git('currentBranch', req.body)),
	createBranch: wrapAsync(req => git('branch', req.body)),
	deleteBranch: wrapAsync(req => git('deleteBranch', req.body)),
	renameBranch: wrapAsync(req => git('renameBranch', req.body)),
	listBranches: wrapAsync(req => git('listBranches', req.body))
}

// Tags
export const gitTagsController = {
	tag: wrapAsync(req => git('tag', req.body)),
	annotatedTag: wrapAsync(req => git('annotatedTag', req.body)),
	deleteTag: wrapAsync(req => git('deleteTag', req.body)),
	listTags: wrapAsync(req => git('listTags', req.body))
}

// Files
export const gitFilesController = {
	add: wrapAsync(req => git('add', req.body)),
	remove: wrapAsync(req => git('remove', req.body)),
	listFiles: wrapAsync(req => git('listFiles', req.body)),
	status: wrapAsync(req => git('status', req.body)),
	isIgnored: wrapAsync(req => git('isIgnored', req.body)),
	readFile: wrapAsync(req => gitService.readFile(req.body)),
	discardFiles: wrapAsync(req => gitService.discardFiles(req.body)),
}

// Notes
export const gitNotesController = {
	addNote: wrapAsync(req => git('addNote', req.body)),
	readNote: wrapAsync(req => git('readNote', req.body)),
	removeNote: wrapAsync(req => git('removeNote', req.body)),
	listNotes: wrapAsync(req => git('listNotes', req.body)),
}

// Remotes
export const gitRemotesController = {
	addRemote: wrapAsync(req => git('addRemote', req.body)),
	deleteRemote: wrapAsync(req => git('deleteRemote', req.body)),
	listRemotes: wrapAsync(req => git('listRemotes', req.body)),
}

// Objects
export const gitObjectsController = {
	readBlob: wrapAsync(req => git('readBlob', req.body)),
	readCommit: wrapAsync(req => git('readCommit', req.body)),
	readTag: wrapAsync(req => git('readTag', req.body)),
	readTree: wrapAsync(req => git('readTree', req.body)),
	writeBlob: wrapAsync(req => {
		const { dir, blob } = req.body;
		const blobData = blob instanceof Uint8Array ? blob : new Uint8Array(Buffer.from(blob));
		return git('writeBlob', { dir, blob: blobData });
	}),
	writeCommit: wrapAsync(req => git('writeCommit', req.body)),
	writeTree: wrapAsync(req => git('writeTree', req.body)),
	readObject: wrapAsync(req => git('readObject', req.body)),
	writeObject: wrapAsync(req => git('writeObject', req.body))
}

export const gitCommandsController = {
	// Plumbing Commands
	findRoot: wrapAsync(req => git('findRoot', req.body)),
	expandRef: wrapAsync(req => git('expandRef', req.body)),
	expandOid: wrapAsync(req => git('expandOid', req.body)),
	resetIndex: wrapAsync(req => git('resetIndex', req.body)),
	updateIndex: wrapAsync(req => git('updateIndex', req.body)),
	listRefs: wrapAsync(req => git('listRefs', req.body)),
	resolveRef: wrapAsync(req => git('resolveRef', req.body)),
	writeRef: wrapAsync(req => git('writeRef', req.body)),
	deleteRef: wrapAsync(req => git('deleteRef', req.body)),
	hashBlob: wrapAsync(req => git('hashBlob', req.body)),
	statusMatrix: wrapAsync(req => git('statusMatrix', req.body)),
	isDescendent: wrapAsync(req => git('isDescendent', req.body)),
	indexPack: wrapAsync(req => git('indexPack', req.body)),
	packObjects: wrapAsync(req => git('packObjects', req.body)),
	collectOids: wrapAsync(req => gitService.collectOids(req.body)),
	isomorphicGitVersion: wrapAsync(req => git('version'))
}

const createWsSender = (ws, operation) => {
	return (data) => {
		const message = JSON.stringify(data);
		logger.debug(`WS Sending [${operation}]`, { data });
		ws.send(message);
	};
};

const createMessageListener = (ws, operation) => {
	return new Promise((resolve, reject) => {
		const listener = (msg) => {
			try {
				const data = JSON.parse(msg);
				logger.debug(`WS Received [${operation}]`, { data });
				resolve(data);
			} catch (error) {
				logger.error(`WS Parse Error [${operation}]`, { error });
				reject(error);
			} finally {
				ws.off('message', listener);
			}
		};
		ws.on('message', listener);
	});
};

const createEventHandlers = (ws, operation, send) => {
	return {
		onProgress: (progress) => {
			logger.debug(`Git Progress [${operation}]`, progress);
			send({ event: `${operation}:progress`, data: progress });
		},
		onMessage: (message) => {
			logger.info(`Git Message [${operation}]`, { message });
			send({ event: `${operation}:message`, data: { message } });
		},
		onAuth: async (url, auth) => {
			logger.info(`Auth Required [${operation}]`, { url });
			send({ event: `${operation}:auth`, data: { url, auth } });
			const credentials = await createMessageListener(ws, `${operation}:auth`);
			return credentials || {};
		},
		onAuthSuccess: (url, auth) => {
			logger.info(`Auth Success [${operation}]`, { url });
			send({ event: `${operation}:authsuccess`, data: { url, auth } });
		},
		onAuthFailure: async (url, auth) => {
			logger.warn(`Auth Failed [${operation}]`, { url });
			send({ event: `${operation}:authfailure`, data: { url, auth } });
			const credentials = await createMessageListener(ws, `${operation}:authfailure`);
			return credentials || {};
		},
		onPostCheckout: (args) => {
			logger.info(`Post Checkout [${operation}]`, args);
			send({ event: `${operation}:onPostCheckout`, args });
		},
		onSign: async (data) => {
			logger.debug(`Signing Required [${operation}]`);
			send({ event: `${operation}:onSign`, data });
			return await createMessageListener(ws, `${operation}:sign`);
		},

		mergeDriver: async (data) => {
			logger.debug(`Merge Driver [${operation}]`);
			send({ event: `${operation}:mergeDriver`, data });
			return await createMessageListener(ws, `${operation}:merge`);
		}
	};
};

/**
 * Handle realtime Git operations via WebSocket
 * @param {keyof import('isomorphic-git')} operation Git operation name
 */
const handleRealtimeOperation = (operation) => (ws, req, next) => {
	let isOperationInProgress = false;

	ws.on('message', async (msg) => {
		if (isOperationInProgress) {
			logger.warn(`Operation already in progress [${operation}]`);
			return;
		}
		isOperationInProgress = true;

		const sessionId = Math.random().toString(36).substr(2, 9);
		logger.info(`Starting operation [${operation}]`, { sessionId });

		const send = createWsSender(ws, operation);

		try {
			const { event, payload } = JSON.parse(msg);

			if (event !== `${operation}:start`) {
				logger.error(`Invalid event [${operation}]`, { expected: `${operation}:start`, received: event });
				send({ error: `Invalid event. Expected '${operation}:start'.` });
				return;
			}

			logger.info(`Executing git operation [${operation}]`, {
				sessionId,
				payload: JSON.stringify(payload)
			});
			
			const handlers = createEventHandlers(ws, operation, send);
			const result = await git(operation, { ...payload, ...handlers });
			logger.info(`Operation completed successfully [${operation}]`, { sessionId });
			send({ event: `${operation}:done`, data: result, sessionId });
		} catch (error) {
			logger.error(`Operation failed [${operation}]`, {
				sessionId,
				error: error.message,
				stack: error.stack
			});

			send({
				event: `${operation}:done`,
				error: {
					message: error.message,
					code: error.code,
					name: error.name
				},
				sessionId
			});
		} finally {
			logger.debug(`Closing connection [${operation}]`, { sessionId });
			ws.close();
		}
	});
};

export const gitWsController = {
	clone: handleRealtimeOperation('clone'),
	push: handleRealtimeOperation('push'),
	pull: handleRealtimeOperation('pull'),
	fetch: handleRealtimeOperation('fetch'),
	wscheckout: handleRealtimeOperation('checkout'),
	getRemoteInfo: handleRealtimeOperation('getRemoteInfo'),
	listServerRefs: handleRealtimeOperation('listServerRefs'),
}