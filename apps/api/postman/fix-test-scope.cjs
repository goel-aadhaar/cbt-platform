// One-shot patcher: switch the test script to read from pm.variables instead of
// pm.environment, matching the prereq's set call. Removes the scope mismatch
// that caused "Invalid regular expression flags" on every assertion.
const fs = require('node:fs');
const p = 'apps/api/postman/qa.newman.collection.js';
let s = fs.readFileSync(p, 'utf8');
const OLD =
  "pm.variables.set('expectedStatusCodes', pm.environment.get('__expected'));";
const NEW =
  "pm.variables.set('expectedStatusCodes', pm.variables.get('__expected'));";
if (!s.includes(OLD)) {
  console.error('anchor missing');
  process.exit(1);
}
fs.writeFileSync(p, s.replace(OLD, NEW));
console.log('patched');
