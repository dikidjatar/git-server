import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import expressWs from 'express-ws';
import http from 'http';
import parseArgs from 'minimist';
import morgan from 'morgan';
import logger, { errorLogger, getLogPath, requestLogger } from './logger.js';

import {
  gitBranchController,
  gitCommandsController,
  gitConfigController,
  gitFilesController,
  gitNotesController,
  gitObjectsController,
  gitRemotesController,
  gitRepositoryController,
  gitTagsController,
  gitWsController
} from './gitController.js';
import { getAp0InetIp } from './utils.js';

const NODE_ENV = process.env.NODE_ENV || 'production';

const app = express();
const server = http.createServer(app);
expressWs(app, server);
app.use(cors());
app.use(bodyParser.json());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

const gitRoute = express.Router();
app.use('/git', gitRoute);

// Repository
gitRoute.get('/status', gitRepositoryController.isRepository);
gitRoute.post('/init', gitRepositoryController.init);
gitRoute.post('/commit', gitRepositoryController.commit);
gitRoute.post('/log', gitRepositoryController.checkout);
// gitRoute.post('/checkout', gitRepositoryController.checkout);
gitRoute.post('/fastForward', gitRepositoryController.fastForward);
gitRoute.post('/merge', gitRepositoryController.merge);
gitRoute.post('/abortMerge', gitRepositoryController.abortMerge);
gitRoute.post('/stash', gitRepositoryController.stash);

// Config
gitRoute.post('/setConfig', gitConfigController.setConfig);
gitRoute.post('/getConfig', gitConfigController.getConfig);
gitRoute.post('/getConfigAll', gitConfigController.getConfigAll);

// Branch
gitRoute.post('/currentBranch', gitBranchController.currentBranch);
gitRoute.post('/createBranch', gitBranchController.createBranch);
gitRoute.post('/deleteBranch', gitBranchController.deleteBranch);
gitRoute.post('/renameBranch', gitBranchController.renameBranch);
gitRoute.post('/listBranches', gitBranchController.listBranches);

// Tags
gitRoute.post('/tag', gitTagsController.tag);
gitRoute.post('/annotatedTag', gitTagsController.annotatedTag);
gitRoute.post('/deleteTag', gitTagsController.deleteTag);
gitRoute.post('/listTags', gitTagsController.listTags);

// Files
gitRoute.post('/add', gitFilesController.add);
gitRoute.post('/remove', gitFilesController.remove);
gitRoute.post('/listFiles', gitFilesController.listFiles);
gitRoute.post('/status', gitFilesController.status);
gitRoute.post('/isIgnored', gitFilesController.isIgnored);
gitRoute.post('/readFile', gitFilesController.readFile);
gitRoute.post('/discardFiles', gitFilesController.discardFiles);

// Notes
gitRoute.post('/addNote', gitNotesController.addNote);
gitRoute.post('/readNote', gitNotesController.readNote);
gitRoute.post('/removeNote', gitNotesController.removeNote);
gitRoute.post('/listNotes', gitNotesController.listNotes);

// Remotes
gitRoute.post('/addRemote', gitRemotesController.addRemote);
gitRoute.post('/deleteRemote', gitRemotesController.deleteRemote);
gitRoute.post('/listRemotes', gitRemotesController.listRemotes);

// Objects
gitRoute.post('/readBlob', gitObjectsController.readBlob);
gitRoute.post('/readCommit', gitObjectsController.readCommit);
gitRoute.post('/readTag', gitObjectsController.readTag);
gitRoute.post('/readTree', gitObjectsController.readTree);
gitRoute.post('/writeBlob', gitObjectsController.writeBlob);
gitRoute.post('/writeCommit', gitObjectsController.writeCommit);
gitRoute.post('/writeTree', gitObjectsController.writeTree);
gitRoute.post('/readObject', gitObjectsController.readObject);
gitRoute.post('/writeObject', gitObjectsController.writeObject);

// Plumbing Commands
gitRoute.post('/findRoot', gitCommandsController.findRoot);
gitRoute.post('/expandRef', gitCommandsController.expandRef);
gitRoute.post('/expandOid', gitCommandsController.expandOid);
gitRoute.post('/resetIndex', gitCommandsController.resetIndex);
gitRoute.post('/updateIndex', gitCommandsController.updateIndex);
gitRoute.post('/listRefs', gitCommandsController.listRefs);
gitRoute.post('/resolveRef', gitCommandsController.resolveRef);
gitRoute.post('/writeRef', gitCommandsController.writeRef);
gitRoute.post('/deleteRef', gitCommandsController.deleteRef);
gitRoute.post('/hashBlob', gitCommandsController.hashBlob);
gitRoute.post('/statusMatrix', gitCommandsController.statusMatrix);
gitRoute.post('/isDescendent', gitCommandsController.isDescendent);
gitRoute.post('/indexPack', gitCommandsController.indexPack);
gitRoute.post('/packObjects', gitCommandsController.packObjects);
gitRoute.post('/packObjects', gitCommandsController.packObjects);
gitRoute.post('/collectOids', gitCommandsController.collectOids);
gitRoute.post('/isomorphicGitVersion', gitCommandsController.isomorphicGitVersion);

// ws
app.ws('/git/clone', gitWsController.clone);
app.ws('/git/push', gitWsController.push);
app.ws('/git/pull', gitWsController.pull);
app.ws('/git/fetch', gitWsController.fetch);
app.ws('/git/checkout', gitWsController.wscheckout);
app.ws('/git/getRemoteInfo', gitWsController.getRemoteInfo);
app.ws('/git/listServerRefs', gitWsController.listServerRefs);

app.use(errorLogger);
app.use((err, req, res, next) => {
  const status = (err && (err.statusCode || err.status)) || 500;

  const errorResponse = {
    path: req.originalUrl,
    method: req.method,
    status,
    error: (err && err.name) || 'Error',
    caller: err && err.caller ? err.caller : undefined,
    data: err && err.data ? err.data : undefined,
    message: (err && err.message) || 'Internal Server Error',
    code: err && err.code ? err.code : undefined,
    details: err && err.details ? err.details : undefined
  };

  res.status(status).json(errorResponse);
});

const findAvailablePort = async (startPort) => {
  const net = await import('net');

  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  };

  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
};

const parseCommandLineArgs = () => {
  const args = parseArgs(process.argv.slice(2), {
    string: ['port', 'host'],
    alias: {
      p: 'port',
      h: 'host'
    },
    default: {
      port: process.env.PORT || '3080',
      host: process.env.HOST || 'localhost'
    }
  });
  return {
    port: parseInt(args.port, 10),
    host: args.host
  };
};

export async function startServer() {
  const args = parseCommandLineArgs();
  const startPort = args.port;
  const HOST = args.host;

  try {
    const PORT = await findAvailablePort(startPort);

    server.listen(PORT, HOST, () => {
      const isPublic = HOST !== 'localhost';
      const ap0Ip = isPublic ? getAp0InetIp() : null;

      // logger.info('Server started', {
      //   environment: NODE_ENV,
      //   port: PORT,
      //   originalPort: startPort,
      //   host: HOST,
      //   localUrl: `http://${HOST}:${PORT}`,
      //   publicUrl: ap0Ip ? `http://${ap0Ip}:${PORT}` : undefined,
      //   logPath: getLogPath()
      // });

      const divider = '='.repeat(50);
      console.log('\x1b[36m%s\x1b[0m', divider);
      console.log('\x1b[36m%s\x1b[0m', `Git Server Status`);
      console.log('\x1b[36m%s\x1b[0m', divider);

      if (PORT !== startPort) {
        console.log('\x1b[33m%s\x1b[0m', `⚠️  Port ${startPort} was in use, switched to port ${PORT}`);
      }

      console.log('\x1b[32m%s\x1b[0m', `🔗 Local URL: http://${HOST}:${PORT}`);

      if (ap0Ip) {
        console.log('\x1b[32m%s\x1b[0m', `🌍 Public URL: http://${ap0Ip}:${PORT}`);
      }

      console.log('\x1b[32m%s\x1b[0m', `📝 Log Path: ${getLogPath()}`);

      console.log('\x1b[36m%s\x1b[0m', divider);
      console.log('\x1b[32m%s\x1b[0m', '✅ Server started successfully\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};