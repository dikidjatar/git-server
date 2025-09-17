import * as gitService from '../services/gitService.js';
import { resolveRepoDir } from '../utils/utils.js';

const wrapAsync = fn => async (req, res, next) => {
	try {
		const result = await fn(req, res);
		res.json(result);
	} catch (err) {
		next(err);
	}
}

const isRepository = wrapAsync((req) => {
	let dir = resolveRepoDir(req.query.dir);
	return { dir, isRepo: gitService.isGitRepository(dir) }
});

const init = wrapAsync(req => gitService.init(req.body));
const commit = wrapAsync(req => gitService.commit(req.body))
const currentBranch = wrapAsync(req => gitService.currentBranch(req.body));
const createBranch = wrapAsync(req => gitService.createBranch(req.body));
const renameBranch = wrapAsync(req => gitService.renameBranch(req.body));
const listBranches = wrapAsync(req => gitService.listBranches(req.body));
const checkout = wrapAsync(req => gitService.checkout(req.body));
const getStatus = wrapAsync(req => gitService.status(req.body));
const add = wrapAsync(req => gitService.add(req.body));
const addAll = wrapAsync(req => gitService.addAll(req.body));
const resetIndex = wrapAsync(req => gitService.resetIndex(req.body));
const setConfig = wrapAsync(req => gitService.setConfig(req.body));
const getConfig = wrapAsync(req => gitService.getConfig(req.body));
const getConfigAll = wrapAsync(req => gitService.getConfigAll(req.body));
const getRemoteInfo = wrapAsync(req => gitService.getRemoteInfo(req.body));
const addRemote = wrapAsync(req => gitService.addRemote(req.body));
const deleteRemote = wrapAsync(req => gitService.deleteRemote(req.body));
const listRemotes = wrapAsync(req => gitService.listRemotes(req.body));
const merge = wrapAsync(req => gitService.merge(req.body));
const abortMerge = wrapAsync(req => gitService.abortMerge(req.body));
const remove = wrapAsync(req => gitService.remove(req.body));
const resolveRef = wrapAsync(req => gitService.resolveRef(req.body));
const collectOids = wrapAsync(req => gitService.collectOids(req.body));
const updateIndex = wrapAsync(req => gitService.updateIndex(req.body));
const statusMatrix = wrapAsync(req => gitService.statusMatrix(req.body));

const handleRealtimeOperation = (operation) => (ws, req, next) => {
	let isOperation = false;
	ws.on('message', async (msg) => {
		if (isOperation) return;
		isOperation = true;

		try {
			const { event, payload } = JSON.parse(msg);
			const send = (data) => ws.send(JSON.stringify(data));

			if (event !== `${operation}:start`) {
				send({ error: `Invalid event. Expected '${operation}:start'.` });
				return;
			}

			const onProgress = (progress) => {
				console.log(progress);
				send({ event: `${operation}:progress`, data: progress });
			}
			const onMessage = (message) => {
				console.log(message);
				send({ event: `${operation}:message`, data: { message } });
			}
			const onAuth = async (url, auth) => {
				send({ event: `${operation}:auth`, data: { url, auth } });
				const credentials = await new Promise((resolve) => {
					const credListener = (msg) => {
						try {
							const credentials = JSON.parse(msg);
							resolve(credentials);
						} catch (e) {
							resolve({});
						}
						ws.off('message', credListener);
					};
					ws.on('message', credListener);
				});
				return credentials;
			}

			let result = await gitService[operation]({
				...payload,
				onAuth,
				onProgress,
				onMessage,
			});

			let obj = { event: `${operation}:done` };
			if (result) {
				obj.data = result;
			}
			send(obj);
		} catch (error) {
			// console.log(error);
			if (error.code === 'HttpError' && error.data) {
				let { statusCode, response } = error.data;
				if (typeof response === 'string') {
					error.message = response;
				}
				error.statusCode = statusCode;
			}
			ws.send(JSON.stringify({ event: `${operation}:done`, error }));
		} finally {
			ws.close();
		}
	});
}

const clone = handleRealtimeOperation('clone');
const push = handleRealtimeOperation('push');
const pull = handleRealtimeOperation('pull');
const fetch = handleRealtimeOperation('fetch');

export {
	abortMerge,
	add,
	addAll,
	addRemote,
	checkout,
	clone,
	commit,
	createBranch,
	currentBranch,
	deleteRemote,
	fetch,
	getConfig,
	getConfigAll,
	getRemoteInfo,
	getStatus,
	init,
	isRepository,
	listBranches,
	listRemotes,
	merge,
	pull,
	push,
	renameBranch,
	resetIndex,
	setConfig,
	remove,
	resolveRef,
	collectOids,
	updateIndex,
	statusMatrix
};

