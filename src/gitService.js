import fs from 'fs';
import * as isogit from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import path from 'path';
import { resolveRepoDir } from './utils.js';

const CORS_PROXY = "https://cors.isomorphic-git.org";

/**
 * Git operations wrapper
 * @template {keyof import('isomorphic-git')} T
 * @param {T} op - Git operation (clone, pull, push, add, commit, etc)
 * @param {Omit<Parameters<import('isomorphic-git')[T]>[0], 'fs' | 'http' | 'dir' | 'corsProxy'>} param1 - Git operation specific options
 * @returns {Promise<ReturnType<import('isomorphic-git')[T]>>} Operation result
 */
export default function git(op, { dir, ...options } = {}) {
  const repoDir = resolveRepoDir(dir);
  return isogit[op]({
    fs,
    http,
    corsProxy: CORS_PROXY,
    dir: repoDir,
    ...options
  });
}

export const getRemoteInfo = async (options = {}) => {
  return await isogit.getRemoteInfo({
    http,
    corsProxy: CORS_PROXY,
    ...options
  });
}

export const listServerRefs = async (options = {}) => {
  return await isogit.listServerRefs({
    http,
    corsProxy: CORS_PROXY,
    ...options
  });
}

export const collectOids = async ({ dir, ref = 'HEAD', prefixes = [] }) => {
  const result = Object.create(null);
  const trees = [
    isogit.TREE({ ref }),
    isogit.STAGE(),
    isogit.WORKDIR()
  ];
  await git('walk', {
    dir,
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

  return result;
}

export const readFile = async ({ dir, filepath, ref = 'HEAD' }) => {
  try {
    const { blob } = await git('readBlob', {
      dir,
      oid: await git('resolveRef', { dir, ref }),
      filepath
    });

    const decoder = new TextDecoder('utf-8');
    const content = decoder.decode(blob);
    return content;
  } catch (error) {
    let fileContent = null;
    await git('walk', {
      dir,
      trees: [isogit.TREE({ ref })],
      map: async (fp, [tree]) => {
        if (fp === filepath && tree) {
          const oid = await tree.oid();
          if (oid) {
            const { object } = await git('readObject', { dir, oid });
            const decoder = new TextDecoder('utf-8');
            fileContent = decoder.decode(object);
          }
        }
      }
    });
    return fileContent;
  }
}

/**
 * @param {string} dir
 */
export const isGitRepository = (dir) => {
  try {
    const repoDir = resolveRepoDir(dir);
    const gitDir = path.join(repoDir, '.git');
    const stat = fs.statSync(gitDir, { throwIfNoEntry: false });
    return !!stat && stat.isDirectory();
  } catch (error) {
    return false;
  }
}

export async function discardFiles({ dir, filepaths, ref = 'HEAD' }) {
  const oidsMap = await collectOids({ dir, ref, prefixes: filepaths });
  await Promise.all(filepaths.map(async (filepath) => {
    const oids = oidsMap[filepath] || {};
    const stageOid = oids.stageOid;

    if (stageOid) {
      const { blob } = await git('readBlob', { dir, oid: stageOid });
      const fullPath = path.join(dir, filepath);
      if (!fs.existsSync(fullPath)) {
        const dirname = path.dirname(fullPath);
        if (!fs.existsSync(dirname)) {
          await fs.promises.mkdir(dirname, { recursive: true });
        }
      }
      await fs.promises.writeFile(fullPath, Buffer.from(blob.buffer));
    }
  }));
}