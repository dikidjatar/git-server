import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TERMUX_PREFIX = "/data/data/com.termux/files/usr";
const TERMUX_HOME = '/data/data/com.termux/files/home';
const ACODE_TERMINAL_PREFIX = "/data/user/0/com.foxdebug.acode/files";
const ACODE_FREE_TERMINAL_PREFIX = "/data/user/0/com.foxdebug.acodefree/files";
const ALPINE_MARKER_FILES = ['/etc/alpine-release', '/sbin/apk'];

const posix = path.posix;

export function getAp0InetIp() {
  try {
    const nets = os.networkInterfaces();
    if (nets && nets.ap0) {
      const iface = nets.ap0.find(i => i.family === 'IPv4' && !i.internal);
      if (iface && iface.address) return iface.address;
    }

    const stdout = execSync('ifconfig 2>/dev/null', { encoding: 'utf8' });
    const ap0Block = stdout.split(/\n\n+/).find(block => block.startsWith('ap0:'));
    if (!ap0Block) throw new Error('ap0 interface not found');

    const match = ap0Block.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
    if (!match) throw new Error('inet IP not found for ap0');

    return match[1];
  } catch (error) {
    return null;
  }
}

/**
 * Get repo dir
 * @param {string} dir
 * @returns {string}
 */
export function resolveRepoDir(dir) {
  if (typeof dir != 'string' || dir.trim() === '') {
    throw new Error('Invalid dir');
  }

  const original = dir.trim();
  let p = original;

  if (/^(sdcard\/|storage\/)/.test(p) && !p.startsWith('/')) {
    p = '/' + p;
  }

  let abs;
  if (p.startsWith('/')) {
    abs = posix.normalize(p);
  } else {
    throw new Error(
      `Relative paths are not allowed; use absolute paths: ${p}`
    );
  }

  const pathEnv = classifyPathEnvironment(abs);
  const terminal = detectTerminalEnv();

  if (pathEnv === 'termux' && terminal.type === 'acodeterm') {
    throw new Error(`Mismatch: resolved path (${abs}) looks like a Termux path but terminal detected as Acode terminal. Either use a Termux terminal or choose a path inside Acode terminal.`);
  }

  if (pathEnv === 'acodeterm' && terminal.type === 'termux') {
    throw new Error(`Mismatch: resolved path (${abs}) looks like an Alpine/Acode terminal path but terminal detected as Termux. Either use an Acode terminal or choose a Termux path.`);
  }

  return abs;
}

/**
 * 
 * @returns {{type: 'termux' | 'acodeterm' | 'unknown'}}
 */
function detectTerminalEnv() {
  const env = process.env || {};
  const homedir = env.HOME || os.homedir();
  const prefix = env.PREFIX || '';

  try {
    if (prefix === TERMUX_PREFIX || fs.existsSync(TERMUX_PREFIX)) {
      return { type: 'termux' };
    }

    if (
      prefix === ACODE_TERMINAL_PREFIX ||
      prefix === ACODE_FREE_TERMINAL_PREFIX ||
      fs.existsSync(ACODE_TERMINAL_PREFIX) ||
      fs.existsSync(ACODE_FREE_TERMINAL_PREFIX)
    ) {
      return { type: 'acodeterm' };
    }
  } catch (err) { }

  let type = 'unknown';

  if (homedir === TERMUX_HOME) {
    type = 'termux';
  } else if (
    homedir === '/home' ||
    homedir === '/root' ||
    homedir.startsWith('/home/') ||
    homedir.startsWith('/root/')
  ) {
    type = 'acodeterm';
  }

  if (type !== 'unknown') return { type };

  for (const f of ALPINE_MARKER_FILES) {
    try {
      if (fs.existsSync(f)) {
        type = 'acodeterm';
        break;
      }
    } catch (err) { }
  }

  return { type };
}

/**
 * Determine which environment a resolved absolute path likely belongs to.
 * Returns 'termux'|'acodeterm'|'sdcard'|'unknown'
 */
function classifyPathEnvironment(p) {
  if (
    p.startsWith(TERMUX_PREFIX) ||
    p.startsWith(TERMUX_HOME)
  ) { return 'termux' };
  if (
    p.startsWith(ACODE_TERMINAL_PREFIX) ||
    p.startsWith(ACODE_FREE_TERMINAL_PREFIX) ||
    p.startsWith('/data/user/0/com.foxdebug.acode') ||
    p.startsWith('/home') ||
    p.startsWith('/root')
  ) { return 'acodeterm' };
  if (
    p.startsWith('/sdcard') ||
    p.startsWith('/storage') ||
    p.startsWith('/mnt/sdcard')
  ) { return 'sdcard' };
  return 'unknown';
}
