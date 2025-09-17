import fs from 'fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import path from 'path';
import { resolveRepoDir } from '../utils/utils.js';

const CORS_PROXY = "https://cors.isomorphic-git.org"
const DEFAULT_CONCURRENCY = 32;

const STATUS_MAP = new Map([
  // [head-workdir-stage]
  ['0-2-0', { symbol: 'U', isStaged: false, isUnstaged: true, desc: 'New, Untracked' }],
  ['0-2-2', { symbol: 'A', isStaged: true, isUnstaged: false, desc: 'Added, staged' }],
  ['0-0-3', { symbol: 'D', isStaged: true, isUnstaged: true, desc: 'Added, deleted' }],
  ['0-2-3', { symbol: 'M', isStaged: true, isUnstaged: true, desc: 'Added, staged, with unstaged changes' }],
  ['1-1-1', { symbol: ' ', isStaged: false, isUnstaged: false, desc: 'Unmodified' }],
  ['1-2-1', { symbol: 'M', isStaged: false, isUnstaged: true, desc: 'Modified, unstaged' }],
  ['1-2-2', { symbol: 'M', isStaged: true, isUnstaged: false, desc: 'Modified, staged' }],
  ['1-2-3', { symbol: 'M', isStaged: true, isUnstaged: true, desc: 'Modified, staged, with unstaged changes' }],
  ['1-0-1', { symbol: 'D', isStaged: false, isUnstaged: true, desc: 'Deleted, unstaged' }],
  ['1-0-0', { symbol: 'D', isStaged: true, isUnstaged: false, desc: 'Deleted, staged' }],
  ['1-2-0', { symbol: 'D', isStaged: true, isUnstaged: true, desc: 'Deleted, staged, with unstaged-modified changes' }],
  ['1-1-0', { symbol: 'D', isStaged: true, isUnstaged: true, desc: 'Deleted, staged, with unstaged changes' }],
]);

/**
 * Cek apakah suatu folder adalah repositori
 * @param {string} dir 
 * @returns {boolean}
 */
function isGitRepository(dir) {
  try {
    let gitDir = path.join(dir, '.git');
    const stat = fs.statSync(gitDir, { throwIfNoEntry: false });
    return !!stat && stat.isDirectory();
  } catch (error) {
    return false;
  }
}

function checkRepo(dir) {
  if (!isGitRepository(dir)) {
    throw new Error(`"${dir}" Not a git repository`);
  }
}

/**
 * Lightweight concurrency limiter (worker pool).
 * Takes a workCount and an async worker function that receives index.
 * This avoids building large intermediate arrays when processing many files.
 *
 * @param {number} count total items
 * @param {function(number): Promise<any>} worker async fn called with index until all processed
 * @param {number} concurrency max parallel workers
 */
async function runWorkers(count, worker, concurrency = DEFAULT_CONCURRENCY) {
  const limit = Math.max(1, Math.min(concurrency, count));
  let next = 0;
  const results = [];
  const workers = new Array(limit).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= count) return;
      try {
        results[i] = await worker(i);
      } catch (err) {
        results[i] = { error: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

const init = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.init({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const clone = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let stats = fs.statSync(repoDir, { throwIfNoEntry: false });
  if (!stats) {
    fs.mkdirSync(repoDir, { recursive: true });
  } else if (stats.isFile()) {
    throw new Error(`Cannot clone into ${repoDir} because it is a file`);
  } else if (stats.isDirectory() && fs.readdirSync(repoDir).length > 0) {
    throw new Error(`Cannot clone into ${repoDir} because it is not empty`);
  }

  await git.clone({
    fs,
    http,
    dir: repoDir,
    corsProxy: CORS_PROXY,
    ...opts
  });

  return { dir: repoDir }
}

const commit = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let sha = await git.commit({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, sha }
}

const currentBranch = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let branch = await git.currentBranch({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, branch }
}

const createBranch = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.branch({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const renameBranch = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.renameBranch({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const listBranches = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let branches = await git.listBranches({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, branches }
}

const checkout = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.checkout({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const statusMatrix = async ({ dir, ...opts }) => {
  const repoDir = resolveRepoDir(dir);
  checkRepo(repoDir);

  const rows = await git.statusMatrix({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, rows }
}

async function status({
  dir,
  split = false,
  ...opts
}) {
  if (!fs) throw new TypeError('fs is required');
  if (!git) throw new TypeError('git (isomorphic-git instance) is required');

  const repoDir = resolveRepoDir(dir);
  checkRepo(repoDir);

  const matrix = await git.statusMatrix({ fs, dir: repoDir, ...opts });

  const files = [];
  const stagedFiles = [];
  const unstagedFiles = [];
  let stagedCount = 0;
  let unstagedCount = 0;
  let totalCount = 0;

  const includeIgnored = opts.ignored || false;
  const isIgnoredCache = new Map();

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    // row: [filepath, HEAD, WORKDIR, STAGE]
    const filepath = row[0];

    const head = Number(row[1]);
    const workdir = Number(row[2]);
    const stage = Number(row[3]);

    if (head === 1 && workdir === 1 && stage === 1) {
      continue;
    }

    const key = `${head}-${workdir}-${stage}`;
    let statusInfo = STATUS_MAP.get(key);

    if (!statusInfo) continue;

    const isStaged = statusInfo.isStaged;
    const isUnstaged = statusInfo.isUnstaged;

    let isIgnored = false;

    if (includeIgnored) {
      if ((head === 0 && workdir === 2) || (workdir === 2 && stage === 0)) {
        if (isIgnoredCache.has(filepath)) {
          isIgnored = Boolean(isIgnoredCache.get(filepath));
        } else {
          try {
            if (filepath.startsWith('.git/')) {
              continue;
            }
            const ignored = await git.isIgnored({ fs, dir: repoDir, filepath });
            isIgnoredCache.set(filepath, ignored);
            isIgnored = ignored;
          } catch (e) {
            isIgnoredCache.set(filepath, false);
            isIgnored = false;
          }
        }
      }
    }

    const fileObj = {
      filepath,
      key,
      symbol: isIgnored ? 'I' : statusInfo.symbol,
      desc: isIgnored ? 'Ignored file' : statusInfo.desc,
      isStaged,
      isUnstaged,
      isIgnored,
      raw: { head, workdir, stage }
    };

    if (split) {
      if (isStaged) {
        stagedFiles.push(fileObj)
      }
      if (isUnstaged) {
        unstagedFiles.push(fileObj);
      }
    } else {
      files.push(fileObj);
    }

    if (isStaged) stagedCount++;
    if (isUnstaged) unstagedCount++;
    totalCount++;
  }

  let branchSymbol = '';
  if (stagedCount > 0 && unstagedCount > 0) {
    branchSymbol = '*+';
  } else if (stagedCount > 0) {
    branchSymbol = '+';
  } else if (unstagedCount > 0) {
    branchSymbol = '*';
  }

  if (split) {
    return {
      dir: repoDir,
      staged: stagedFiles,
      unstaged: unstagedFiles,
      branchSymbol,
      totalCount,
      stagedCount,
      unstagedCount
    };
  }

  return {
    dir: repoDir,
    files,
    branchSymbol,
    totalCount,
    stagedCount,
    unstagedCount
  };
}

const add = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.add({ fs, dir: repoDir, ...opts });
  return { dir: repoDir };
}

const addAll = async (opts = {}) => {
  const {
    dir,
    ref = 'HEAD',
    filepaths = ['.'],
    cache = {},
    ignored = false,
    concurrency = 32,
    onProgress = () => { }
  } = opts;
  let repoDir = resolveRepoDir(dir);

  const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3;

  const matrix = await git.statusMatrix({
    fs,
    dir: repoDir,
    ref,
    filepaths,
    cache,
    ignored
  });

  const rows = matrix.filter((r) => {
    const fp = String(r[FILE]);
    if (!fp || fp === '.' || fp === '') return false;
    if (fp === '.git' || fp.startsWith('.git' + path.sep)) return false;
    return r[WORKDIR] !== r[STAGE];
  });

  const total = rows.length;
  let processed = 0, added = 0, removed = 0, skipped = 0;
  const errors = [];

  const worker = async (index) => {
    const [filepath, , workdirVal] = rows[index];
    const isDeletedInWorkdir = Number(workdirVal) === 0;

    try {
      if (isDeletedInWorkdir) {
        await git.remove({ fs, dir: repoDir, filepath, cache });
        removed++;
      } else {
        await git.add({ fs, dir: repoDir, filepath, cache });
        added++;
      }
      processed++;
      onProgress({ filepath, total, processed, added, skipped });
      return { filepath, ok: true };
    } catch (error) {
      errors.push({ filepath, error: err });
      skipped++;
      processed++;
      onProgress({ filepath, total, processed, added, removed, skipped });
      return { filepath, ok: false, error: err };
    }
  }

  await runWorkers(rows.length, worker, concurrency);

  const result = {
    total,
    processed,
    added,
    removed,
    skipped,
    errors
  };

  return { dir: repoDir, result };
}

const resetIndex = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.resetIndex({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const push = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let result = await git.push({
    fs,
    http,
    corsProxy: CORS_PROXY,
    dir: repoDir,
    ...opts
  });
  return { dir: repoDir, result }
}

const pull = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.pull({
    fs,
    http,
    dir: repoDir,
    corsProxy: CORS_PROXY,
    ...opts
  });
  return { dir: repoDir }
}

const fetch = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let result = await git.fetch({
    fs,
    http,
    dir: repoDir,
    corsProxy: CORS_PROXY,
    ...opts
  });
  return { dir: repoDir, result }
}

const setConfig = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.setConfig({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const getConfig = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let value = await git.getConfig({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, value }
}

const getConfigAll = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let values = await git.getConfigAll({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, values }
}

const getRemoteInfo = async ({ ...opts }) => {
  let info = await git.getRemoteInfo({ http, ...opts });
  return { info }
}

const addRemote = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.addRemote({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const deleteRemote = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.deleteRemote({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const listRemotes = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let remotes = await git.listRemotes({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, remotes }
}

const merge = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  let result = await git.merge({ fs, dir: repoDir, ...opts });
  return { dir: repoDir, result }
}

const abortMerge = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.abortMerge({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const remove = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  await git.remove({ fs, dir: repoDir, ...opts });
  return { dir: repoDir }
}

const resolveRef = async ({ dir, ...opts }) => {
  let repoDir = resolveRepoDir(dir);
  const data = await git.resolveRef({ fs, dir, ...opts });
  return { dir: repoDir, data };
}

const updateIndex = async ({ dir, ...opts }) => {
  const repoDir = resolveRepoDir(dir);
  const data = await git.updateIndex({ fs, dir, ...opts });
  return { dir: repoDir, data }
}

const collectOids = async ({ dir, ref = 'HEAD', prefixes = [] }) => {
  let repoDir = resolveRepoDir(dir);
  const result = Object.create(null);
  const trees = [
    git.TREE({ ref }),
    git.STAGE(),
    git.WORKDIR()
  ];
  await git.walk({
    fs,
    dir: repoDir,
    trees,
    map: async (filepath, [head, stage, workdir]) => {
      if (!filepath) return;

      const match = prefixes.some(pre => {
        if (pre === filepath) return true;
        const normalized = pre.endsWith('/') ? pre : (pre + '/')
        return filepath.startsWith(normalized);
      });
      if (!match) return;

      const headOid = await head?.oid();
      const stageOid = await stage?.oid();
      const workdirOid = await workdir?.oid();

      result[filepath] = { headOid, workdirOid, stageOid };
      return;
    }
  });
  return { dir: repoDir, oids: result }
}

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
  init,
  isGitRepository,
  listBranches,
  listRemotes,
  merge,
  pull,
  push,
  renameBranch,
  resetIndex,
  setConfig,
  status,
  remove,
  resolveRef,
  collectOids,
  updateIndex,
  statusMatrix
};
