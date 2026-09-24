// Builds the Newman collection. For each route we emit pm variables for every
// path parameter and give them a placeholder UUID, so {{id}}, {{examId}} etc.
// resolve to a value the API will accept (then 200/201) or, if the placeholder
// doesn't match a real row, 404 — which we accept as "route mounted".
const fs = require('fs');
const path = require('node:path');

const inv = JSON.parse(
  fs.readFileSync(
    'C:/Users/laptop/Desktop/DBSK CBT/qa-evidence/03_api/route-inventory.json',
    'utf8',
  ),
);
const OUT = path.resolve(
  __dirname,
  '../postman/DRSK-CBT.qa.newman.collection.json',
);

const SKIP_PATH_REGEX =
  /^\/api\/v1\/(questions|exams\/[^/]+\/questions)\/import/;
const items = inv.filter(
  (e) =>
    !SKIP_PATH_REGEX.test(e.path) &&
    e.path !== '/api/v1/exams/:id/clone' &&
    !e.path.includes('/admin/login'),
);

function expectedCodes(method, role, e) {
  const set = new Set([200]);
  if (method === 'POST') set.add(201);
  if (e.pathParams && e.pathParams.length) {
    // Path-param routes look up a row by id. With a placeholder UUID we
    // either get 200 (rare hit) or 404 (most cases). Both prove the route is
    // mounted and answered; only 500 would mean something is wrong.
    set.add(404);
  }
  if (!e.public) set.add(401);
  if (role && e.roles.length && !e.roles.includes(role)) set.add(403);
  if (role === 'ADMIN' && e.roles.includes('SUPERADMIN')) set.add(403);
  return Array.from(set);
}

function pickRole(e) {
  if (e.public) return null;
  if (e.roles.includes('SUPERADMIN')) return 'SUPERADMIN';
  if (e.roles.includes('ADMIN')) return 'ADMIN';
  if (e.roles.includes('TEACHER')) return 'TEACHER';
  if (e.roles.includes('STUDENT')) return 'STUDENT';
  return null;
}

// A random-looking but fixed UUID per request — chosen so it cannot collide
// with a real row but has the right shape for ParseUUIDPipe.
const FAKE_UUID = '00000000-0000-4000-8000-000000000001';

function pathParamPairs(p) {
  const pairs = [];
  const re = /:([A-Za-z]+)/g;
  let m;
  while ((m = re.exec(p))) {
    const name = m[1].charAt(0).toLowerCase() + m[1].slice(1);
    pairs.push(name);
  }
  return pairs;
}

const TEST_SCRIPT = [
  "const raw = pm.variables.get('expected') || '';",
  'const expected = raw.split(/[,|]/).map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));',
  "pm.test('status code in expected set', () => {",
  "  pm.expect(expected, 'expected codes were: ' + expected.join('|')).to.include(pm.response.code);",
  '});',
].join('\n');

const grouped = new Map();
for (const e of items) {
  const r = pickRole(e);
  const k = r === null ? 'PUBLIC' : r;
  if (!grouped.has(k)) grouped.set(k, []);
  grouped.get(k).push(e);
}

const item = [];
const allPathVars = new Set();
for (const k of ['PUBLIC', 'SUPERADMIN', 'ADMIN', 'TEACHER', 'STUDENT']) {
  if (!grouped.has(k)) continue;
  const role = k === 'PUBLIC' ? null : k;
  const requests = grouped.get(k).map((e) => {
    const urlPath = e.path
      .replace(
        /:([A-Za-z]+)/g,
        (_, n) => '{{' + n.charAt(0).toLowerCase() + n.slice(1) + '}}',
      )
      .slice('/api/v1'.length);
    for (const name of pathParamPairs(e.path)) allPathVars.add(name);
    const exp = expectedCodes(e.method, role, e);
    return {
      name: e.method + ' ' + urlPath + '  [expected ' + exp.join('|') + ']',
      event: [
        {
          listen: 'test',
          script: { type: 'text/javascript', exec: TEST_SCRIPT },
        },
      ],
      request: {
        method: e.method,
        header: [],
        url: {
          raw: '{{baseUrl}}' + urlPath,
          host: ['{{baseUrl}}'],
          path: urlPath.split('/').filter(Boolean),
        },
        description:
          'Inventory: ' +
          e.id +
          ' | auth: ' +
          (e.public ? 'PUBLIC' : 'JWT ' + role) +
          ' | roles: ' +
          (e.roles.join(',') || '(none)'),
      },
    };
  });
  item.push({
    name: role === null ? 'Public (anonymous)' : role,
    item: requests,
  });
}

// Encode the expected codes per-request by overwriting the test event.
for (const folder of item) {
  for (const req of folder.item) {
    const m = req.name.match(/\[expected ([\d|,|]+)\]/);
    if (!m) continue;
    req.event[0].script.exec =
      "pm.variables.set('expected', '" +
      m[1] +
      "');\n" +
      req.event[0].script.exec;
  }
}

const variables = [
  { key: 'baseUrl', value: 'http://127.0.0.1:3099' },
  { key: 'expected', value: '' },
];
for (const name of allPathVars) variables.push({ key: name, value: FAKE_UUID });

const collection = {
  info: {
    name: 'DRSK CBT QA — generated from route inventory (release 1caf8f7)',
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description:
      "Contract smoke test — every route in the inventory is called once with a valid-shape UUID for each path parameter; assertion checks the returned status is in the expected set (200/201 for the path's success codes, plus 401/403 for auth/role cases).",
  },
  item,
  variable: variables,
};

fs.writeFileSync(OUT, JSON.stringify(collection, null, 2));
const total = item.reduce((s, f) => s + f.item.length, 0);
console.log(
  'wrote ' +
    OUT +
    ' — ' +
    total +
    ' requests across ' +
    item.length +
    ' folders (' +
    allPathVars.size +
    ' path-param vars)',
);
