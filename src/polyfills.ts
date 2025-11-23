/**
 * Polyfills for Node.js modules in the browser
 * This file should be imported at the very beginning of the app
 */

import { Buffer } from 'buffer';
import process from 'process';

// Make Buffer and process available globally
(window as any).Buffer = Buffer;
(window as any).process = process;
(window as any).global = window;

// Ensure process.env exists
if (!(window as any).process.env) {
  (window as any).process.env = {};
}

export { Buffer, process };

