#!/usr/bin/env node
/**
 * Node entry point for the physics harness. Exits non-zero on any failure so
 * it composes with git hooks and CI.
 *
 *   npm test            all assertions
 *   npm test -- --quiet only failures and the summary
 */
import { runAll } from './physics.js';

const quiet = process.argv.includes('--quiet');
const { log, pass, fail, failures } = runAll();

const c = process.stdout.isTTY
  ? { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', x: '\x1b[0m' }
  : { g: '', r: '', d: '', x: '' };

for (const line of log) {
  if (quiet && line.startsWith('PASS')) continue;
  if (line.startsWith('PASS')) console.log(`${c.g}PASS${c.x}${c.d}${line.slice(4)}${c.x}`);
  else if (line.startsWith('FAIL')) console.log(`${c.r}FAIL${line.slice(4)}${c.x}`);
  else console.log(`${c.d}${line}${c.x}`);
}

console.log();
console.log(fail === 0
  ? `${c.g}${pass} passed${c.x}`
  : `${c.r}${fail} failed${c.x}, ${pass} passed\n  ${failures.join('\n  ')}`);

process.exit(fail === 0 ? 0 : 1);
