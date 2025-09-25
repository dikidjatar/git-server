#!/usr/bin/env node

import './server.js';
import { startServer } from './server.js';

// --- Global Entry Point ---
startServer().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});