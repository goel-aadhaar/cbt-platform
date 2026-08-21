import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PasswordService } from '../modules/auth/password.service';
import { PrismaService } from './prisma.service';

/**
 * DEV-ONLY demo seed. Wipes and recreates a rich "demo" tenant so every screen
 * in the frontend has realistic data to render and exercise end-to-end:
 *
 *   Institute → Programs → Classes → Batches
 *   Admin + Teachers + ~25 Students (all ACTIVE, known passwords)
 *   ~30 Questions (DRAFT / REVIEW / APPROVED / ARCHIVED, MCQ/MSQ/INTEGER)
 *   4 Exams (draft / scheduled / live / completed) with sections + questions
 *   Attempts + Responses + Results (ranked) for the completed exam
 *   Proctoring events + audit logs
 *
 * Idempotent by recreation: the demo institute is deleted (cascade) and rebuilt,
 * so IDs change but the login credentials below stay stable. Safe to re-run.
 *
 * Run: `pnpm --filter @drsk/api build && pnpm --filter @drsk/api db:seed:dev`
 */

const SLUG = process.env.SEED_INSTITUTE_SLUG ?? 'demo';
const STUDENT_PASSWORD = 'Student@123';
const TEACHER_PASSWORD = 'Teacher@123';
const ADMIN_PASSWORD = 'Admin@123';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

async function devSeed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const passwords = app.get(PasswordService);
  const now = Date.now();

  // Hash each shared password once (argon2 is expensive) and reuse.
  const [adminHash, teacherHash, studentHash] = await Promise.all([
    passwords.hash(ADMIN_PASSWORD),
    passwords.hash(TEACHER_PASSWORD),
    passwords.hash(STUDENT_PASSWORD),
  ]);

  // ── Reset ────────────────────────────────────────────────────────────
  const existing = await prisma.institute.findUnique({ where: { slug: SLUG } });
  if (existing) {
    await prisma.auditLog.deleteMany({ where: { instituteId: existing.id } });
    await prisma.institute.delete({ where: { id: existing.id } }); // cascades
  }

  // ── Tenant + academic hierarchy ──────────────────────────────────────
  // Fixed, memorable 4-digit code — this is a single deterministic demo
  // tenant (deleted + recreated each run), not the random-with-retry
  // generation InstitutesService.create() uses for real institutes.
  const INSTITUTE_CODE = '1000';
  const institute = await prisma.institute.create({
    data: { name: 'Demo Institute', slug: SLUG, code: INSTITUTE_CODE },
  });
  const iid = institute.id;
  const rollYear = String(new Date().getFullYear() % 100).padStart(2, '0');

  const neet = await prisma.program.create({
    data: { instituteId: iid, name: 'NEET' },
  });
  const jee = await prisma.program.create({
    data: { instituteId: iid, name: 'JEE' },
  });

  const class12 = await prisma.class.create({
    data: { instituteId: iid, programId: neet.id, name: 'Class 12' },
  });
  const class11 = await prisma.class.create({
    data: { instituteId: iid, programId: neet.id, name: 'Class 11' },
  });
  const dropper = await prisma.class.create({
    data: { instituteId: iid, programId: neet.id, name: 'Dropper' },
  });
  const jeeClass = await prisma.class.create({
    data: { instituteId: iid, programId: jee.id, name: 'Class 12 (JEE)' },
  });

  const mkBatch = (classId: string, name: string) =>
    prisma.batch.create({ data: { instituteId: iid, classId, name } });
  const alpha = await mkBatch(class12.id, 'Alpha');
  const beta = await mkBatch(class12.id, 'Beta');
  const gamma = await mkBatch(class11.id, 'Gamma');
  const delta = await mkBatch(dropper.id, 'Delta');
  const jeeA = await mkBatch(jeeClass.id, 'JEE-A');

  // ── Admin + teachers ─────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      name: 'Demo Admin',
      email: 'admin@demo.local',
      roles: ['ADMIN'],
      status: 'ACTIVE',
      passwordHash: adminHash,
      instituteId: iid,
    },
  });

  const teacherDefs = [
    { name: 'Anil Kumar', email: 'anil@demo.local' },
    { name: 'Sunita Sharma', email: 'sunita@demo.local' },
    { name: 'Rahul Desai', email: 'rahul@demo.local' },
  ];
  const teachers = await Promise.all(
    teacherDefs.map((t) =>
      prisma.user.create({
        data: {
          name: t.name,
          email: t.email,
          roles: ['TEACHER'],
          status: 'ACTIVE',
          passwordHash: teacherHash,
          instituteId: iid,
          invitedById: admin.id,
        },
      }),
    ),
  );

  // ── Students (~25 across batches) ────────────────────────────────────
  const FIRST = [
    'Aarav',
    'Diya',
    'Vivaan',
    'Ananya',
    'Aditya',
    'Ishita',
    'Arjun',
    'Saanvi',
    'Reyansh',
    'Myra',
    'Kabir',
    'Aadhya',
    'Rohan',
    'Anika',
    'Krishna',
    'Navya',
    'Shaurya',
    'Kiara',
    'Vihaan',
    'Riya',
    'Dev',
    'Tara',
    'Ayaan',
    'Zara',
    'Ved',
  ];
  const LAST = [
    'Sharma',
    'Patel',
    'Reddy',
    'Nair',
    'Gupta',
    'Iyer',
    'Singh',
    'Rao',
    'Mehta',
    'Bose',
    'Kapoor',
    'Das',
    'Verma',
    'Menon',
    'Joshi',
  ];
  const batchPlan = [
    { batch: alpha, count: 6 },
    { batch: beta, count: 6 },
    { batch: gamma, count: 5 },
    { batch: delta, count: 4 },
    { batch: jeeA, count: 4 },
  ];

  interface SeededStudent {
    id: string;
    batchId: string;
  }
  const students: SeededStudent[] = [];
  let sIdx = 0;
  for (const { batch, count } of batchPlan) {
    for (let k = 0; k < count; k++) {
      const first = FIRST[sIdx % FIRST.length];
      const last = LAST[sIdx % LAST.length];
      // Matches the real generation scheme (§2.11): {yy}{institute code}{seq}.
      const roll = `${rollYear}${INSTITUTE_CODE}${String(sIdx + 1).padStart(4, '0')}`;
      const email = `${first}.${last}.${sIdx}@demo.local`.toLowerCase();
      const user = await prisma.user.create({
        data: {
          name: `${first} ${last}`,
          email,
          roles: ['STUDENT'],
          status: 'ACTIVE',
          passwordHash: studentHash,
          instituteId: iid,
          invitedById: admin.id,
        },
      });
      const student = await prisma.student.create({
        data: {
          userId: user.id,
          instituteId: iid,
          batchId: batch.id,
          rollNumber: roll,
        },
      });
      students.push({ id: student.id, batchId: batch.id });
      sIdx++;
    }
  }

  // ── Questions (~30) ──────────────────────────────────────────────────
  const SUBJECTS = ['Physics', 'Chemistry', 'Biology'];
  const CHAPTERS: Record<string, string[]> = {
    Physics: [
      'Kinematics',
      'Laws of Motion',
      'Thermodynamics',
      'Optics',
      'Electrostatics',
    ],
    Chemistry: [
      'Atomic Structure',
      'Chemical Bonding',
      'Thermochemistry',
      'Organic Basics',
      'Electrochemistry',
    ],
    Biology: [
      'Cell Structure',
      'Genetics',
      'Photosynthesis',
      'Human Physiology',
      'Ecology',
    ],
  };
  const DIFF = ['EASY', 'MEDIUM', 'HARD'] as const;
  // Per subject, 10 questions: 6 APPROVED, 2 REVIEW, 1 DRAFT, 1 ARCHIVED.
  const STATUS_BY_J = [
    'APPROVED',
    'APPROVED',
    'APPROVED',
    'APPROVED',
    'APPROVED',
    'APPROVED',
    'REVIEW',
    'REVIEW',
    'DRAFT',
    'ARCHIVED',
  ];

  const approvedBySubject: Record<string, string[]> = {
    Physics: [],
    Chemistry: [],
    Biology: [],
  };

  // Question-bank taxonomy (§2.4): a Subject/Chapter row per seeded name, and
  // one ExamCategory questions can point at — mirrors what an admin would
  // set up via /admin/question-taxonomy and /admin/exam-categories.
  const examCategory = await prisma.examCategory.create({
    data: { instituteId: iid, name: 'NEET', createdById: admin.id },
  });
  const subjectIdByName: Record<string, string> = {};
  const chapterIdByName: Record<string, Record<string, string>> = {};
  for (const subject of SUBJECTS) {
    const subjectRow = await prisma.subject.create({
      data: { instituteId: iid, name: subject },
    });
    subjectIdByName[subject] = subjectRow.id;
    chapterIdByName[subject] = {};
    for (const chapter of CHAPTERS[subject]) {
      const chapterRow = await prisma.chapter.create({
        data: { instituteId: iid, subjectId: subjectRow.id, name: chapter },
      });
      chapterIdByName[subject][chapter] = chapterRow.id;
    }
  }

  let qSeq = 0;
  for (const subject of SUBJECTS) {
    for (let j = 0; j < 10; j++) {
      const chapter = CHAPTERS[subject][j % 5];
      const status = STATUS_BY_J[j];
      const type = j % 5 === 4 ? 'INTEGER' : j % 5 === 2 ? 'MSQ' : 'MCQ';
      const options =
        type === 'INTEGER'
          ? undefined
          : ['A', 'B', 'C', 'D'].map((key, n) => ({
              key,
              text: `${chapter} option ${n + 1}`,
            }));
      const answerKey =
        type === 'INTEGER' ? 42 : type === 'MSQ' ? ['A', 'C'] : 'B';
      const approved = status === 'APPROVED';
      const q = await prisma.question.create({
        data: {
          instituteId: iid,
          subject,
          chapter,
          topic: `${chapter} basics`,
          subjectId: subjectIdByName[subject],
          chapterId: chapterIdByName[subject][chapter],
          examCategoryId: examCategory.id,
          difficulty: DIFF[j % 3],
          type: type,
          tags: [
            subject.toLowerCase(),
            chapter.toLowerCase().replace(/\s+/g, '-'),
          ],
          statement: `${subject} · ${chapter}: Sample ${type} question ${j + 1}. Which option is correct?`,
          options,
          answerKey,
          explanation: 'Seeded explanation for the correct answer.',
          marks: 4,
          negativeMarks: 1,
          status: status as 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ARCHIVED',
          isActive: status !== 'ARCHIVED',
          createdById: teachers[qSeq % teachers.length].id,
          approvedById: approved ? admin.id : null,
          approvedAt: approved ? new Date(now - 5 * DAY) : null,
        },
      });
      if (approved) approvedBySubject[subject].push(q.id);
      qSeq++;
    }
  }

  // ── Exams ────────────────────────────────────────────────────────────
  /** Build a 3-section exam from approved questions (5 per subject). */
  async function buildExam(opts: {
    title: string;
    status: 'DRAFT' | 'PUBLISHED';
    startAt: Date | null;
    endAt: Date | null;
    duration: number;
    batches: string[];
    withQuestions: boolean;
  }) {
    const exam = await prisma.exam.create({
      data: {
        instituteId: iid,
        programId: neet.id,
        title: opts.title,
        instructions: 'Read all instructions carefully.',
        durationMinutes: opts.duration,
        status: opts.status,
        resultPolicy: 'ON_PUBLISH',
        startAt: opts.startAt,
        endAt: opts.endAt,
        maxViolations: 3,
        fullscreenRequired: true,
        createdById: admin.id,
      },
    });
    for (const bId of opts.batches) {
      await prisma.examBatch.create({
        data: { examId: exam.id, batchId: bId, instituteId: iid },
      });
    }
    const sections: { id: string; name: string; questionIds: string[] }[] = [];
    if (opts.withQuestions) {
      let order = 0;
      let qOrder = 0;
      for (const subject of SUBJECTS) {
        const section = await prisma.examSection.create({
          data: {
            examId: exam.id,
            instituteId: iid,
            name: subject,
            order: order++,
            marksCorrect: 4,
            marksWrong: 1,
          },
        });
        const qids = approvedBySubject[subject].slice(0, 5);
        for (const qid of qids) {
          await prisma.examQuestion.create({
            data: {
              examId: exam.id,
              sectionId: section.id,
              questionId: qid,
              instituteId: iid,
              order: qOrder++,
              scoring: 'NORMAL',
            },
          });
        }
        sections.push({ id: section.id, name: subject, questionIds: qids });
      }
    }
    return { exam, sections };
  }

  // Completed (published, window in the past) — gets attempts + results.
  const completed = await buildExam({
    title: 'NEET Grand Test 03',
    status: 'PUBLISHED',
    startAt: new Date(now - 3 * DAY),
    endAt: new Date(now - 3 * DAY + 180 * MIN),
    duration: 180,
    batches: [alpha.id, beta.id],
    withQuestions: true,
  });
  // Live now (published, window straddles now).
  await buildExam({
    title: 'Physics Weekly Test',
    status: 'PUBLISHED',
    startAt: new Date(now - 30 * MIN),
    endAt: new Date(now + 90 * MIN),
    duration: 120,
    batches: [alpha.id],
    withQuestions: true,
  });
  // Scheduled (published, window in the future).
  await buildExam({
    title: 'Biology Olympiad Prep',
    status: 'PUBLISHED',
    startAt: new Date(now + 2 * DAY),
    endAt: new Date(now + 2 * DAY + 120 * MIN),
    duration: 120,
    batches: [gamma.id],
    withQuestions: true,
  });
  // Draft.
  await buildExam({
    title: 'JEE Physics Sprint',
    status: 'DRAFT',
    startAt: null,
    endAt: null,
    duration: 60,
    batches: [jeeA.id],
    withQuestions: false,
  });

  // ── Attempts + Results for the completed exam ────────────────────────
  const cohort = students.filter(
    (s) => s.batchId === alpha.id || s.batchId === beta.id,
  );
  const maxScore = 15 * 4; // 15 questions × 4 marks
  const startedAt = completed.exam.startAt!;

  // Compute scores in-memory first so we can rank before inserting.
  const scored = cohort.map((s, i) => {
    const correct = 7 + (i % 7); // 7..13
    const incorrect = i % 3; // 0..2
    const unattempted = 15 - correct - incorrect;
    const totalScore = correct * 4 - incorrect * 1;
    return { ...s, correct, incorrect, unattempted, totalScore };
  });
  const ranked = [...scored].sort((a, b) => b.totalScore - a.totalScore);
  const n = ranked.length;

  for (let r = 0; r < n; r++) {
    const s = ranked[r];
    const attempt = await prisma.attempt.create({
      data: {
        instituteId: iid,
        examId: completed.exam.id,
        studentId: s.id,
        status: 'SUBMITTED',
        startedAt,
        expiresAt: new Date(startedAt.getTime() + 180 * MIN),
        submittedAt: new Date(startedAt.getTime() + (120 + r) * MIN),
        violationCount: r % 5 === 0 ? 2 : 0,
        flagged: r % 9 === 0,
      },
    });
    const perSection = Math.round(s.totalScore / 3);
    const sectionCorrect = Math.round(s.correct / 3);
    const sectionIncorrect = Math.round(s.incorrect / 3);
    const sectionUnattempted = Math.round(s.unattempted / 3);
    const sectionScores = completed.sections.map((sec) => ({
      sectionId: sec.id,
      name: sec.name,
      score: perSection,
      maxScore: Math.round(maxScore / 3),
      questionCount: sectionCorrect + sectionIncorrect + sectionUnattempted,
      correct: sectionCorrect,
      incorrect: sectionIncorrect,
      unattempted: sectionUnattempted,
      // Plausible spread so the seeded result page exercises time analysis
      // rather than rendering every section as 0 seconds.
      seconds: 20 * 60 + ((r * 7) % 900),
    }));
    const batchPeers = ranked.filter((x) => x.batchId === s.batchId);
    const batchRank = batchPeers.findIndex((x) => x.id === s.id) + 1;
    await prisma.result.create({
      data: {
        instituteId: iid,
        examId: completed.exam.id,
        attemptId: attempt.id,
        studentId: s.id,
        batchId: s.batchId,
        totalScore: s.totalScore,
        maxScore,
        correctCount: s.correct,
        incorrectCount: s.incorrect,
        unattemptedCount: s.unattempted,
        sectionScores,
        overallRank: r + 1,
        batchRank,
        percentile: Math.round(((n - (r + 1)) / n) * 1000) / 10,
        published: true,
        publishedAt: new Date(startedAt.getTime() + 200 * MIN),
      },
    });
    // A couple of proctoring events on flagged/violation attempts.
    if (attempt.violationCount > 0) {
      await prisma.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          instituteId: iid,
          type: 'TAB_SWITCH',
          detail: 'Switched away from exam window',
        },
      });
    }
  }

  // A few in-progress attempts on the live exam are omitted (the live exam has
  // no results yet); the completed exam above drives the Results screen.

  // ── Audit logs (recent activity) ─────────────────────────────────────
  const auditRows = [
    {
      action: 'RESULT_PUBLISHED',
      entityType: 'Exam',
      entityId: completed.exam.id,
      actor: admin,
      at: 2 * MIN,
    },
    {
      action: 'QUESTION_APPROVED',
      entityType: 'Question',
      entityId: approvedBySubject.Biology[0],
      actor: admin,
      at: 18 * MIN,
    },
    {
      action: 'STUDENT_IMPORTED',
      entityType: 'Batch',
      entityId: alpha.id,
      actor: admin,
      at: 42 * MIN,
    },
    {
      action: 'EXAM_PUBLISHED',
      entityType: 'Exam',
      entityId: completed.exam.id,
      actor: teachers[0],
      at: 3 * 60 * MIN,
    },
    {
      action: 'LOGIN',
      entityType: 'User',
      entityId: admin.id,
      actor: admin,
      at: 5 * 60 * MIN,
    },
  ];
  for (const a of auditRows) {
    await prisma.auditLog.create({
      data: {
        instituteId: iid,
        actorId: a.actor.id,
        actorRole: a.actor.roles[0],
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        outcome: 'SUCCESS',
        statusCode: 200,
        createdAt: new Date(now - a.at),
      },
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const counts = {
    programs: await prisma.program.count({ where: { instituteId: iid } }),
    classes: await prisma.class.count({ where: { instituteId: iid } }),
    batches: await prisma.batch.count({ where: { instituteId: iid } }),
    teachers: await prisma.user.count({
      where: { instituteId: iid, roles: { has: 'TEACHER' } },
    }),
    students: await prisma.student.count({ where: { instituteId: iid } }),
    questions: await prisma.question.count({ where: { instituteId: iid } }),
    exams: await prisma.exam.count({ where: { instituteId: iid } }),
    attempts: await prisma.attempt.count({ where: { instituteId: iid } }),
    results: await prisma.result.count({ where: { instituteId: iid } }),
  };

  await app.close();

  console.log('\n✅ Demo tenant seeded.\n');
  console.table(counts);
  console.log('\n  Institute Code (slug):', SLUG);
  console.log('  ── Student login ─────────────────────');
  console.log(
    '   Candidate ID :',
    '2400183920 (…21, …22 … up to',
    String(2400183920 + sIdx - 1) + ')',
  );
  console.log('   Password     :', STUDENT_PASSWORD);
  console.log('  ── Admin login ───────────────────────');
  console.log('   Email / Pass : admin@demo.local /', ADMIN_PASSWORD);
  console.log('  ── Teacher login ─────────────────────');
  console.log('   Email / Pass : anil@demo.local /', TEACHER_PASSWORD);
  console.log('');
}

void devSeed();
