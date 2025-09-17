import dotenv from 'dotenv';
dotenv.config();

import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import expressWs from 'express-ws';
import http from 'http';
import morgan from 'morgan';
import * as gitController from './controllers/gitController.js';
import { getAp0InetIp } from './utils/utils.js';

const app = express();
const server = http.createServer(app);
expressWs(app, server);
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));

const gitRoute = express.Router();
app.use('/git', gitRoute);

gitRoute.get('/status', gitController.isRepository);
gitRoute.post('/init', gitController.init);
app.ws('/git/clone', gitController.clone);
gitRoute.post('/commit', gitController.commit);
gitRoute.post('/branch/current', gitController.currentBranch);
gitRoute.post('/branch/create', gitController.createBranch);
gitRoute.post('/branch/rename', gitController.renameBranch);
gitRoute.post('/branch/list', gitController.listBranches);
gitRoute.post('/checkout', gitController.checkout);
gitRoute.post('/status', gitController.getStatus);
gitRoute.post('/add', gitController.add);
gitRoute.post('/addAll', gitController.addAll);
gitRoute.post('/resetIndex', gitController.resetIndex);
app.ws('/git/push', gitController.push);
app.ws('/git/pull', gitController.pull);
app.ws('/git/fetch', gitController.fetch);
gitRoute.post('/setConfig', gitController.setConfig);
gitRoute.post('/getConfig', gitController.getConfig);
gitRoute.post('/getConfigAll', gitController.getConfigAll);
gitRoute.post('/remote/info', gitController.getRemoteInfo);
gitRoute.post('/remote/add', gitController.addRemote);
gitRoute.post('/remote/delete', gitController.deleteRemote);
gitRoute.post('/remote/list', gitController.listRemotes);
gitRoute.post('/merge', gitController.merge);
gitRoute.post('/abortMerge', gitController.abortMerge);
gitRoute.post('/remove', gitController.remove);
gitRoute.post('/resolveRef', gitController.resolveRef);
gitRoute.post('/collectOids', gitController.collectOids);
gitRoute.post('/updateIndex', gitController.updateIndex);
gitRoute.post('/statusMatrix', gitController.statusMatrix);

app.use((err, req, res, next) => {
  const status = (err && (err.statusCode || err.status)) || 500;
  let timestamp = new Date().toISOString();

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

  console.error(`[${timestamp}] ${req.method} ${req.originalUrl} -> ${status}`, err);
  res.status(status).json(errorResponse);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
server.listen(PORT, HOST, () => {
  const isPublic = HOST !== 'localhost';

  console.log(`Server is running:`);
  console.log(`LOCAL: http://${HOST}:${PORT}`);

  if (isPublic) {
    const ap0Ip = getAp0InetIp();
    if (ap0Ip) {
      console.log(`PUBLIC: http://${ap0Ip}:${PORT}`);
    }
  }
});
