// Side-file generator: reads the credentials JSON the seed wrote and emits a
// Postman environment file (v2.1.0) with the variables the Newman collection
// needs. Run with `node apps/api/postman/DRSK-CBT.qa.newman.env.js`.

const fs = require('node:fs');
const path = require('node:path');

const CREDS_PATH =
  'C:/Users/laptop/AppData/Local/Temp/claude/c--Users-laptop-Desktop-DBSK-CBT/5c55855b-022f-4fba-a504-1253af17456f/scratchpad/newman-credentials.json';
const OUT = path.resolve(
  __dirname,
  '../postman/DRSK-CBT.qa.newman.environment.json',
);

const c = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
const env = {
  id: 'qa-newman-env',
  name: 'DRSK CBT QA Newman env (release 1caf8f7)',
  values: [
    { key: 'baseUrl', value: c.baseUrl, enabled: true },
    { key: 'apiLogPath', value: c.apiLogPath, enabled: true },
    {
      key: 'credentials_SUPERADMIN',
      value: JSON.stringify({
        email: 'superadmin@codonmind.in',
        password: 'ChangeMe123!',
      }),
      enabled: true,
    },
    { key: 'credentials_ADMIN', value: JSON.stringify(c.admin), enabled: true },
    {
      key: 'credentials_TEACHER',
      value: JSON.stringify(c.teacher),
      enabled: true,
    },
    {
      key: 'credentials_STUDENT',
      value: JSON.stringify(c.student),
      enabled: true,
    },
  ],
  _postman_variable_scope: 'environment',
  _postman_exported_at: new Date().toISOString(),
  _postman_exported_using: 'DRSK-CBT.qa.newman.env.js',
};
fs.writeFileSync(OUT, JSON.stringify(env, null, 2));
console.log('wrote', OUT);
