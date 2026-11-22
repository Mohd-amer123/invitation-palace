/**
 * Master Test Runner
 * THE INVITATION PALACE
 */

const { spawnSync } = require('child_process');
const path = require('path');

console.log('================================================================');
console.log('  THE INVITATION PALACE – COMPREHENSIVE AUTOMATED TEST RUNNER   ');
console.log('================================================================\n');

const testFiles = [
  'tests/unit_test.js',
  'tests/integration_test.js',
  'tests/scheduler_test.js'
];

let allPassed = true;

for (const file of testFiles) {
  console.log(`>>> Executing ${file}...`);
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.status !== 0) {
    allPassed = false;
    console.error(`*** Suite ${file} failed with exit code ${result.status} ***\n`);
  } else {
    console.log(`*** Suite ${file} completed successfully ***\n`);
  }
}

if (allPassed) {
  console.log('================================================================');
  console.log('  ALL SUITES PASSED! APPLICATION IS 100% VERIFIED AND READY.   ');
  console.log('================================================================');
  process.exit(0);
} else {
  console.error('Some tests failed.');
  process.exit(1);
}
