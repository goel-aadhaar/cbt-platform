// Read the report and the collection, correlate by position (newman runs
// requests in collection order) to print the failing URLs.
const fs = require('node:fs');
const coll = JSON.parse(
  fs.readFileSync(
    'C:/Users/laptop/Desktop/DBSK CBT/apps/api/postman/DRSK-CBT.qa.newman.collection.json',
    'utf8',
  ),
);
const report = JSON.parse(
  fs.readFileSync(
    'C:/Users/laptop/Desktop/DBSK CBT/qa-evidence/03_api/newman-report.json',
    'utf8',
  ),
);
const flat = [];
for (const folder of coll.item) {
  for (const r of folder.item) flat.push(r);
}
console.log('total requests in collection:', flat.length);
console.log('failure entries:', (report.failures || []).length);
// Failures appear in test-execution order — pair them up by index.
for (let i = 0; i < (report.failures || []).length && i < 15; i++) {
  const f = report.failures[i];
  const r = flat[i];
  console.log('\n#' + i + ' -> ' + (r ? r.name : '(no request)'));
  console.log('   url=' + (r ? r.request.url.raw : '?'));
  console.log('   err=' + (f.error || '').slice(0, 200));
}
