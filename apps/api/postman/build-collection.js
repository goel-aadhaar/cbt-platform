/**
 * Generates the DRSK CBT Postman collection + environment from a single ordered
 * description of every route. Run: `node postman/build-collection.js`.
 *
 * The output is an end-to-end flow: run the whole collection top-to-bottom in
 * the Collection Runner and each request feeds the next via collection
 * variables. The only manual steps are the three invitation accepts — tokens are
 * emailed (logged to the API console by the dev mail adapter), never returned in
 * a response, so you paste each `token=...` into the marked variable.
 */
const fs = require('fs');
const path = require('path');

const items = [];

/** Build a Postman URL object from a path template + optional query map. */
function url(template, query) {
  const raw =
    '{{baseUrl}}' +
    template +
    (query
      ? '?' +
        Object.entries(query)
          .map(([k, v]) => `${k}=${v}`)
          .join('&')
      : '');
  return {
    raw,
    host: ['{{baseUrl}}'],
    path: template.replace(/^\//, '').split('/'),
    ...(query
      ? {
          query: Object.entries(query).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        }
      : {}),
  };
}

const BEARER = {
  none: null,
  superadmin: '{{superToken}}',
  admin: '{{adminToken}}',
  teacher: '{{teacherToken}}',
  student: '{{studentToken}}',
};

/** Accessor string for a dotted path, e.g. "items.0.id" -> ?.['items']?.['0']?.['id']. */
function accessor(dotted) {
  return dotted
    .split('.')
    .map((seg) => `?.[${JSON.stringify(seg)}]`)
    .join('');
}

function buildTestScript({ expect, captures, extra }) {
  const lines = [];
  if (expect !== undefined) {
    const codes = Array.isArray(expect) ? expect : [expect];
    lines.push(
      `pm.test(${JSON.stringify(
        `status is ${codes.join(' or ')}`,
      )}, function () {`,
      `  pm.expect(pm.response.code).to.be.oneOf(${JSON.stringify(codes)});`,
      `});`,
    );
  }
  if (captures) {
    lines.push('try {');
    lines.push('  var body = pm.response.json();');
    for (const [varName, dotted] of Object.entries(captures)) {
      lines.push(
        `  var ${varName} = body${accessor(dotted)};`,
        `  if (${varName} !== undefined && ${varName} !== null) pm.collectionVariables.set(${JSON.stringify(
          varName,
        )}, String(${varName}));`,
      );
    }
    lines.push('} catch (e) { console.log("capture failed:", e.message); }');
  }
  if (extra) lines.push(...extra);
  return lines;
}

/** Register one request in the current folder. */
function req(folder, cfg) {
  const {
    name,
    method,
    path: p,
    auth = 'none',
    body,
    formdata,
    query,
    description,
    expect,
    captures,
    prerequest,
    testExtra,
  } = cfg;

  const header = [];
  if (BEARER[auth]) {
    header.push({ key: 'Authorization', value: `Bearer ${BEARER[auth]}` });
  }
  if (body !== undefined) {
    header.push({ key: 'Content-Type', value: 'application/json' });
  }

  const request = {
    method,
    header,
    url: url(p, query),
    ...(description ? { description } : {}),
  };
  if (body !== undefined) {
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  if (formdata) {
    request.body = { mode: 'formdata', formdata };
  }

  const event = [];
  if (prerequest) {
    event.push({
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: prerequest },
    });
  }
  const testExec = buildTestScript({ expect, captures, extra: testExtra });
  if (testExec.length) {
    event.push({
      listen: 'test',
      script: { type: 'text/javascript', exec: testExec },
    });
  }

  folder.item.push({ name, ...(event.length ? { event } : {}), request });
}

function folder(name, description) {
  const f = { name, item: [], ...(description ? { description } : {}) };
  items.push(f);
  return f;
}

const REMIND = (v) => [
  `console.log("──────────────────────────────────────────────");`,
  `console.log("⚠ MANUAL STEP: open the API server console, copy the newest");`,
  `console.log("  token=... value, and paste it into collection variable: ${v}");`,
  `console.log("  (the dev mail adapter logs the accept-invite link there).");`,
  `console.log("──────────────────────────────────────────────");`,
];

// ── 0. Health ──────────────────────────────────────────────────────────────
{
  const f = folder('0 · Health', 'Liveness and readiness. No auth.');
  req(f, {
    name: 'Liveness',
    method: 'GET',
    path: '/api/health',
    expect: 200,
  });
  req(f, {
    name: 'Readiness (DB up)',
    method: 'GET',
    path: '/api/health/ready',
    expect: 200,
  });
}

// ── 1. Auth & onboarding ─────────────────────────────────────────────────────
{
  const f = folder(
    '1 · Auth & Onboarding',
    'Superadmin → institute → admin → teacher. The three Accept steps need a token pasted from the API console (see the request descriptions).',
  );
  req(f, {
    name: 'Login Superadmin',
    method: 'POST',
    path: '/api/v1/auth/login',
    body: { email: '{{superEmail}}', password: '{{superPassword}}' },
    expect: 200,
    captures: { superToken: 'accessToken' },
    description:
      'Uses the seeded superadmin. If this 401s, seed the DB: `pnpm --filter @drsk/api db:seed`.',
  });
  req(f, {
    name: 'Create Institute',
    method: 'POST',
    path: '/api/v1/institutes',
    auth: 'superadmin',
    prerequest: [
      '// Fresh, unique identifiers for this run.',
      'var s = Date.now().toString(36);',
      "pm.collectionVariables.set('suffix', s);",
      "pm.collectionVariables.set('instituteSlug', 'inst-' + s);",
      "pm.collectionVariables.set('adminEmail', 'admin-' + s + '@test.local');",
      "pm.collectionVariables.set('teacherEmail', 'teacher-' + s + '@test.local');",
      "pm.collectionVariables.set('studentEmail', 'student-' + s + '@test.local');",
    ],
    body: { name: 'Postman Institute {{suffix}}', slug: '{{instituteSlug}}' },
    expect: 201,
    captures: { instituteId: 'id' },
  });
  req(f, {
    name: 'Invite Admin',
    method: 'POST',
    path: '/api/v1/invitations/admin',
    auth: 'superadmin',
    body: {
      name: 'Postman Admin',
      email: '{{adminEmail}}',
      instituteId: '{{instituteId}}',
    },
    expect: [201, 200],
    testExtra: REMIND('adminInviteToken'),
  });
  req(f, {
    name: 'Accept Admin Invite  ⟵ paste token first',
    method: 'POST',
    path: '/api/v1/invitations/accept',
    body: { token: '{{adminInviteToken}}', password: '{{password}}' },
    expect: [201, 200],
    description:
      'Set `adminInviteToken` to the token printed in the API console by "Invite Admin".',
  });
  req(f, {
    name: 'Login Admin',
    method: 'POST',
    path: '/api/v1/auth/login',
    body: { email: '{{adminEmail}}', password: '{{password}}' },
    expect: 200,
    captures: { adminToken: 'accessToken' },
  });
  req(f, {
    name: 'Invite Teacher',
    method: 'POST',
    path: '/api/v1/invitations/teacher',
    auth: 'admin',
    body: { name: 'Postman Teacher', email: '{{teacherEmail}}' },
    expect: [201, 200],
    testExtra: REMIND('teacherInviteToken'),
  });
  req(f, {
    name: 'Accept Teacher Invite  ⟵ paste token first',
    method: 'POST',
    path: '/api/v1/invitations/accept',
    body: { token: '{{teacherInviteToken}}', password: '{{password}}' },
    expect: [201, 200],
  });
  req(f, {
    name: 'Login Teacher',
    method: 'POST',
    path: '/api/v1/auth/login',
    body: { email: '{{teacherEmail}}', password: '{{password}}' },
    expect: 200,
    captures: { teacherToken: 'accessToken' },
  });
  req(f, {
    name: 'Who am I (admin)',
    method: 'GET',
    path: '/api/v1/auth/me',
    auth: 'admin',
    expect: 200,
  });
}

// ── 2. Academic structure ────────────────────────────────────────────────────
{
  const f = folder(
    '2 · Academic Structure',
    'Programs → classes → batches (admin).',
  );
  req(f, {
    name: 'Create Program',
    method: 'POST',
    path: '/api/v1/programs',
    auth: 'admin',
    body: { name: 'NEET' },
    expect: 201,
    captures: { programId: 'id' },
  });
  req(f, {
    name: 'List Programs',
    method: 'GET',
    path: '/api/v1/programs',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Get Program',
    method: 'GET',
    path: '/api/v1/programs/{{programId}}',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Update Program',
    method: 'PATCH',
    path: '/api/v1/programs/{{programId}}',
    auth: 'admin',
    body: { name: 'NEET UG' },
    expect: 200,
  });
  req(f, {
    name: 'Create Class',
    method: 'POST',
    path: '/api/v1/classes',
    auth: 'admin',
    body: { programId: '{{programId}}', name: 'Class 12' },
    expect: 201,
    captures: { classId: 'id' },
  });
  req(f, {
    name: 'List Classes',
    method: 'GET',
    path: '/api/v1/classes',
    auth: 'admin',
    query: { programId: '{{programId}}' },
    expect: 200,
  });
  req(f, {
    name: 'Get Class',
    method: 'GET',
    path: '/api/v1/classes/{{classId}}',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Update Class',
    method: 'PATCH',
    path: '/api/v1/classes/{{classId}}',
    auth: 'admin',
    body: { name: 'Class XII' },
    expect: 200,
  });
  req(f, {
    name: 'Create Batch',
    method: 'POST',
    path: '/api/v1/batches',
    auth: 'admin',
    body: { classId: '{{classId}}', name: 'Alpha' },
    expect: 201,
    captures: { batchId: 'id' },
  });
  req(f, {
    name: 'List Batches',
    method: 'GET',
    path: '/api/v1/batches',
    auth: 'admin',
    query: { classId: '{{classId}}' },
    expect: 200,
  });
  req(f, {
    name: 'Get Batch',
    method: 'GET',
    path: '/api/v1/batches/{{batchId}}',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Update Batch',
    method: 'PATCH',
    path: '/api/v1/batches/{{batchId}}',
    auth: 'admin',
    body: { name: 'Alpha 2026' },
    expect: 200,
  });
}

// ── 3. Students ──────────────────────────────────────────────────────────────
{
  const f = folder(
    '3 · Students',
    'Invite a student, then manage the roster (admin).',
  );
  req(f, {
    name: 'Invite Student',
    method: 'POST',
    path: '/api/v1/invitations/student',
    auth: 'admin',
    body: {
      name: 'Postman Student',
      email: '{{studentEmail}}',
      rollNumber: '{{studentRoll}}',
      batchId: '{{batchId}}',
    },
    expect: [201, 200],
    testExtra: REMIND('studentInviteToken'),
  });
  req(f, {
    name: 'Accept Student Invite  ⟵ paste token first',
    method: 'POST',
    path: '/api/v1/invitations/accept',
    body: { token: '{{studentInviteToken}}', password: '{{password}}' },
    expect: [201, 200],
  });
  req(f, {
    name: 'Student Login (roll + password)',
    method: 'POST',
    path: '/api/v1/auth/student/login',
    body: {
      instituteSlug: '{{instituteSlug}}',
      rollNumber: '{{studentRoll}}',
      password: '{{password}}',
    },
    expect: 200,
    captures: { studentToken: 'accessToken' },
  });
  req(f, {
    name: 'List Students (paginated)',
    method: 'GET',
    path: '/api/v1/students',
    auth: 'admin',
    query: { batchId: '{{batchId}}', limit: 50, offset: 0 },
    expect: 200,
    captures: { studentId: 'items.0.id' },
  });
  req(f, {
    name: 'Get Student',
    method: 'GET',
    path: '/api/v1/students/{{studentId}}',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Update Student',
    method: 'PATCH',
    path: '/api/v1/students/{{studentId}}',
    auth: 'admin',
    body: { name: 'Postman Student (edited)' },
    expect: 200,
  });
  req(f, {
    name: 'Import Students (CSV) — attach a file',
    method: 'POST',
    path: '/api/v1/students/import',
    auth: 'admin',
    query: { batchId: '{{batchId}}' },
    formdata: [
      {
        key: 'file',
        type: 'file',
        src: [],
        description: 'A CSV with columns: name,email,rollNumber',
      },
    ],
    expect: [201, 400],
    description:
      'Attach a CSV file (columns name,email,rollNumber). 400 until a file is attached.',
  });
}

// ── 4. Question bank ─────────────────────────────────────────────────────────
{
  const f = folder(
    '4 · Question Bank',
    'Author, review, approve; search and import.',
  );
  const mcq = (statement) => ({
    subject: 'Physics',
    chapter: 'Mechanics',
    difficulty: 'EASY',
    type: 'MCQ',
    examType: 'NEET',
    statement,
    options: [
      { key: 'A', text: 'Newton' },
      { key: 'B', text: 'Joule' },
    ],
    answerKey: 'A',
  });
  req(f, {
    name: 'Create Question 1',
    method: 'POST',
    path: '/api/v1/questions',
    auth: 'teacher',
    body: mcq('What is the SI unit of force?'),
    expect: 201,
    captures: { questionId1: 'id' },
  });
  req(f, {
    name: 'Create Question 2',
    method: 'POST',
    path: '/api/v1/questions',
    auth: 'teacher',
    body: mcq('Acceleration is the rate of change of what?'),
    expect: 201,
    captures: { questionId2: 'id' },
  });
  req(f, {
    name: 'List Questions (paginated)',
    method: 'GET',
    path: '/api/v1/questions',
    auth: 'teacher',
    query: { limit: 50, offset: 0 },
    expect: 200,
  });
  req(f, {
    name: 'Full-text Search',
    method: 'GET',
    path: '/api/v1/questions',
    auth: 'teacher',
    query: { search: 'force' },
    expect: 200,
  });
  req(f, {
    name: 'Get Question',
    method: 'GET',
    path: '/api/v1/questions/{{questionId1}}',
    auth: 'teacher',
    expect: 200,
  });
  req(f, {
    name: 'Update Question (before use)',
    method: 'PATCH',
    path: '/api/v1/questions/{{questionId1}}',
    auth: 'teacher',
    body: { chapter: 'Kinematics' },
    expect: 200,
  });
  req(f, {
    name: 'Submit Q1 for review',
    method: 'POST',
    path: '/api/v1/questions/{{questionId1}}/submit',
    auth: 'teacher',
    expect: [201, 200],
  });
  req(f, {
    name: 'Approve Q1',
    method: 'POST',
    path: '/api/v1/questions/{{questionId1}}/approve',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Submit Q2 for review',
    method: 'POST',
    path: '/api/v1/questions/{{questionId2}}/submit',
    auth: 'teacher',
    expect: [201, 200],
  });
  req(f, {
    name: 'Approve Q2',
    method: 'POST',
    path: '/api/v1/questions/{{questionId2}}/approve',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Create Question 3 (for reject/archive)',
    method: 'POST',
    path: '/api/v1/questions',
    auth: 'teacher',
    body: mcq('A throwaway question'),
    expect: 201,
    captures: { questionId3: 'id' },
  });
  req(f, {
    name: 'Submit Q3',
    method: 'POST',
    path: '/api/v1/questions/{{questionId3}}/submit',
    auth: 'teacher',
    expect: [201, 200],
  });
  req(f, {
    name: 'Reject Q3 (back to draft)',
    method: 'POST',
    path: '/api/v1/questions/{{questionId3}}/reject',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Archive Q3',
    method: 'POST',
    path: '/api/v1/questions/{{questionId3}}/archive',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Import Questions (DOCX) — attach a file',
    method: 'POST',
    path: '/api/v1/questions/import',
    auth: 'teacher',
    query: { subject: 'Physics', examType: 'NEET' },
    formdata: [
      {
        key: 'file',
        type: 'file',
        src: [],
        description: 'A .docx per the import template',
      },
    ],
    expect: [201, 400],
    description:
      'Attach a .docx (Q:/1. markers, A) options, Answer:, Key: value). 400 until a file is attached.',
  });
}

// ── 5. Exams ─────────────────────────────────────────────────────────────────
{
  const f = folder(
    '5 · Exams',
    'Build, schedule, publish, clone (teacher/admin).',
  );
  req(f, {
    name: 'Create Exam',
    method: 'POST',
    path: '/api/v1/exams',
    auth: 'teacher',
    body: {
      title: 'Postman Mock Test',
      durationMinutes: 60,
      maxViolations: 3,
      resultPolicy: 'ON_PUBLISH',
    },
    expect: 201,
    captures: { examId: 'id' },
  });
  req(f, {
    name: 'List Exams',
    method: 'GET',
    path: '/api/v1/exams',
    auth: 'teacher',
    expect: 200,
  });
  req(f, {
    name: 'Get Exam',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}',
    auth: 'teacher',
    expect: 200,
  });
  req(f, {
    name: 'Update Exam',
    method: 'PATCH',
    path: '/api/v1/exams/{{examId}}',
    auth: 'teacher',
    body: { instructions: 'Read all questions carefully.' },
    expect: 200,
  });
  req(f, {
    name: 'Add Section',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/sections',
    auth: 'teacher',
    body: { name: 'Physics', marksCorrect: 4, marksWrong: 1 },
    expect: 201,
    captures: { sectionId: 'id' },
  });
  req(f, {
    name: 'Add Q1 to Section',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/sections/{{sectionId}}/questions',
    auth: 'teacher',
    body: { questionId: '{{questionId1}}' },
    expect: 201,
  });
  req(f, {
    name: 'Add Q2 to Section',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/sections/{{sectionId}}/questions',
    auth: 'teacher',
    body: { questionId: '{{questionId2}}' },
    expect: 201,
  });
  req(f, {
    name: 'Assign Batch',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/batches',
    auth: 'admin',
    body: { batchId: '{{batchId}}' },
    expect: 201,
  });
  req(f, {
    name: 'Schedule Exam (window open now)',
    method: 'PATCH',
    path: '/api/v1/exams/{{examId}}/schedule',
    auth: 'admin',
    prerequest: [
      "pm.collectionVariables.set('startAt', new Date(Date.now() - 60000).toISOString());",
      "pm.collectionVariables.set('endAt', new Date(Date.now() + 3600000).toISOString());",
    ],
    body: { startAt: '{{startAt}}', endAt: '{{endAt}}' },
    expect: 200,
  });
  req(f, {
    name: 'Publish Exam',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/publish',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Clone Exam',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/clone',
    auth: 'teacher',
    body: { title: 'Postman Mock Test (Copy)' },
    expect: 201,
    captures: { clonedExamId: 'id' },
  });
  req(f, {
    name: 'Unpublish the Clone',
    method: 'POST',
    path: '/api/v1/exams/{{clonedExamId}}/unpublish',
    auth: 'admin',
    expect: [201, 200, 400],
    description:
      'The clone is a draft, so this is a no-op/400 — included for coverage of the route.',
  });
}

// ── 6. Candidate (attempt) ───────────────────────────────────────────────────
{
  const f = folder(
    '6 · Candidate Exam',
    'The student sits the published exam.',
  );
  req(f, {
    name: 'Start Attempt',
    method: 'POST',
    path: '/api/v1/attempts',
    auth: 'student',
    body: { examId: '{{examId}}' },
    expect: 201,
    captures: { attemptId: 'id' },
  });
  req(f, {
    name: 'Get Attempt State',
    method: 'GET',
    path: '/api/v1/attempts/{{attemptId}}',
    auth: 'student',
    expect: 200,
  });
  req(f, {
    name: 'Answer Q1 (auto-save)',
    method: 'PUT',
    path: '/api/v1/attempts/{{attemptId}}/responses/{{questionId1}}',
    auth: 'student',
    body: { answer: 'A' },
    expect: 200,
  });
  req(f, {
    name: 'Answer Q2 (wrong)',
    method: 'PUT',
    path: '/api/v1/attempts/{{attemptId}}/responses/{{questionId2}}',
    auth: 'student',
    body: { answer: 'B' },
    expect: 200,
  });
  req(f, {
    name: 'Record Section Time',
    method: 'PUT',
    path: '/api/v1/attempts/{{attemptId}}/section-time',
    auth: 'student',
    body: { sectionId: '{{sectionId}}', seconds: 45 },
    expect: 200,
  });
  req(f, {
    name: 'Report Proctoring Violation',
    method: 'POST',
    path: '/api/v1/attempts/{{attemptId}}/violations',
    auth: 'student',
    body: { type: 'TAB_SWITCH', detail: 'window blurred' },
    expect: 200,
  });
  req(f, {
    name: 'Pre-submission Summary',
    method: 'GET',
    path: '/api/v1/attempts/{{attemptId}}/summary',
    auth: 'student',
    expect: 200,
  });
  req(f, {
    name: 'Submit Attempt',
    method: 'POST',
    path: '/api/v1/attempts/{{attemptId}}/submit',
    auth: 'student',
    expect: [201, 200],
  });
}

// ── 7. Results & ranking ─────────────────────────────────────────────────────
{
  const f = folder(
    '7 · Results & Ranking',
    'Evaluate, remediate, publish, export (admin); student view.',
  );
  req(f, {
    name: 'Evaluate',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/evaluate',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'List Results (ranked)',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}/results',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Grace Marks — set Q2 BONUS',
    method: 'PATCH',
    path: '/api/v1/exams/{{examId}}/questions/{{questionId2}}/scoring',
    auth: 'admin',
    body: { override: 'BONUS' },
    expect: 200,
  });
  req(f, {
    name: 'Re-evaluate after BONUS',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/evaluate',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Manual Evaluation (set Q1 MANUAL)',
    method: 'PATCH',
    path: '/api/v1/exams/{{examId}}/questions/{{questionId1}}/scoring',
    auth: 'admin',
    body: { override: 'MANUAL' },
    expect: 200,
  });
  req(f, {
    name: 'Award Manual Marks',
    method: 'PUT',
    path: '/api/v1/exams/{{examId}}/results/manual',
    auth: 'admin',
    body: {
      attemptId: '{{attemptId}}',
      questionId: '{{questionId1}}',
      marks: 4,
    },
    expect: [200, 201],
  });
  req(f, {
    name: 'Re-evaluate after manual award',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/evaluate',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Publish Results',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/results/publish',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Hold Results',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/results/hold',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Publish Results (again)',
    method: 'POST',
    path: '/api/v1/exams/{{examId}}/results/publish',
    auth: 'admin',
    expect: [201, 200],
  });
  req(f, {
    name: 'Export CSV',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}/results/export/csv',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Export Excel',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}/results/export/xlsx',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Export PDF',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}/results/export/pdf',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Student sees own Result',
    method: 'GET',
    path: '/api/v1/attempts/{{attemptId}}/result',
    auth: 'student',
    expect: 200,
  });
}

// ── 8. Monitoring & analytics ────────────────────────────────────────────────
{
  const f = folder(
    '8 · Monitoring & Analytics',
    'Live monitor, exam analytics, histories.',
  );
  req(f, {
    name: 'Live Exam Monitor',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}/monitor',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Exam Analytics',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}/analytics',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'Student History (admin)',
    method: 'GET',
    path: '/api/v1/students/{{studentId}}/history',
    auth: 'admin',
    expect: 200,
  });
  req(f, {
    name: 'My History (student)',
    method: 'GET',
    path: '/api/v1/me/history',
    auth: 'student',
    expect: 200,
  });
}

// ── 9. Audit ─────────────────────────────────────────────────────────────────
{
  const f = folder('9 · Audit', 'The audit trail (admin/superadmin).');
  req(f, {
    name: 'List Audit Logs',
    method: 'GET',
    path: '/api/v1/audit-logs',
    auth: 'admin',
    query: { limit: 50 },
    expect: 200,
  });
  req(f, {
    name: 'Filter Audit Logs (failures)',
    method: 'GET',
    path: '/api/v1/audit-logs',
    auth: 'admin',
    query: { outcome: 'FAILURE' },
    expect: 200,
  });
}

// ── 10. Negative / authorization checks ──────────────────────────────────────
{
  const f = folder(
    '10 · Authorization Checks',
    'RBAC + tenancy guards should reject these.',
  );
  req(f, {
    name: 'No token → 401',
    method: 'GET',
    path: '/api/v1/programs',
    expect: 401,
  });
  req(f, {
    name: 'Teacher creates program → 403',
    method: 'POST',
    path: '/api/v1/programs',
    auth: 'teacher',
    body: { name: 'Nope' },
    expect: 403,
  });
  req(f, {
    name: 'Student hits admin route → 403',
    method: 'GET',
    path: '/api/v1/students',
    auth: 'student',
    expect: 403,
  });
  req(f, {
    name: 'Teacher exports results → 403',
    method: 'GET',
    path: '/api/v1/exams/{{examId}}/results/export/csv',
    auth: 'teacher',
    expect: 403,
  });
  req(f, {
    name: 'Wrong password → 401',
    method: 'POST',
    path: '/api/v1/auth/login',
    body: { email: '{{adminEmail}}', password: 'wrong-password' },
    expect: 401,
  });
}

// ── Assemble ─────────────────────────────────────────────────────────────────
const collection = {
  info: {
    _postman_id: '9b0c1d2e-3f4a-4b5c-8d6e-7f8a9b0c1d2e',
    name: 'DRSK CBT API',
    description:
      'End-to-end collection for the DRSK CBT platform. Run the folders in order (Collection Runner works top-to-bottom). IDs and tokens are captured into collection variables automatically; the three "Accept Invite" steps need a token pasted from the API console. Select the "DRSK CBT — Local" environment first.',
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: items,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    { key: 'superEmail', value: 'superadmin@drsk.local' },
    { key: 'superPassword', value: 'ChangeMe123!' },
    { key: 'password', value: 'TestPass1234' },
    { key: 'studentRoll', value: 'PM001' },
    { key: 'suffix', value: '' },
    { key: 'instituteSlug', value: '' },
    { key: 'adminEmail', value: '' },
    { key: 'teacherEmail', value: '' },
    { key: 'studentEmail', value: '' },
    // The three invite tokens are intentionally NOT collection variables — they
    // live in the environment (that's where you paste them), so nothing here
    // shadows the environment value.
    { key: 'superToken', value: '' },
    { key: 'adminToken', value: '' },
    { key: 'teacherToken', value: '' },
    { key: 'studentToken', value: '' },
    { key: 'instituteId', value: '' },
    { key: 'programId', value: '' },
    { key: 'classId', value: '' },
    { key: 'batchId', value: '' },
    { key: 'studentId', value: '' },
    { key: 'questionId1', value: '' },
    { key: 'questionId2', value: '' },
    { key: 'questionId3', value: '' },
    { key: 'examId', value: '' },
    { key: 'clonedExamId', value: '' },
    { key: 'sectionId', value: '' },
    { key: 'attemptId', value: '' },
    { key: 'startAt', value: '' },
    { key: 'endAt', value: '' },
  ],
};

const environment = {
  id: 'a1b2c3d4-e5f6-4a5b-9c8d-0e1f2a3b4c5d',
  name: 'DRSK CBT — Local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
    { key: 'superEmail', value: 'superadmin@drsk.local', enabled: true },
    { key: 'superPassword', value: 'ChangeMe123!', enabled: true },
    { key: 'password', value: 'TestPass1234', enabled: true },
    { key: 'studentRoll', value: 'PM001', enabled: true },
    { key: 'adminInviteToken', value: '', enabled: true },
    { key: 'teacherInviteToken', value: '', enabled: true },
    { key: 'studentInviteToken', value: '', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

const outDir = __dirname;
const routeCount = items.reduce((n, f) => n + f.item.length, 0);
fs.writeFileSync(
  path.join(outDir, 'DRSK-CBT.postman_collection.json'),
  JSON.stringify(collection, null, 2) + '\n',
);
fs.writeFileSync(
  path.join(outDir, 'DRSK-CBT.postman_environment.json'),
  JSON.stringify(environment, null, 2) + '\n',
);
console.log(
  `Wrote collection (${items.length} folders, ${routeCount} requests) + environment.`,
);
