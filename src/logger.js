import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const getLogPath = () => {
  const envLogPath = process.env.LOG_PATH;
  if (envLogPath) {
    fs.mkdirSync(envLogPath, { recursive: true });
    return envLogPath;
  }

  const defaultPath = path.join(os.homedir(), '.git-server-logs');
  fs.mkdirSync(defaultPath, { recursive: true });
  return defaultPath;
};

const logPath = getLogPath();

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.DailyRotateFile({
      dirname: logPath,
      filename: 'git-server-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ]
});

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });
  next();
};

export const errorLogger = (err, req, res, next) => {
  logger.error('Error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    ip: req.ip
  });
  next(err);
};

export default logger;