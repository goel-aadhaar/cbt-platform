/**
 * UAT fixture — creates an isolated second tenant ("uatb") alongside the demo
 * tenant so multi-tenant isolation (UAT §19) can be tested with real, equivalent
 * records on both sides.
 *
 * Deliberately does NOT touch the demo tenant, and does not reuse the dev seed
 * (whose emails/institute code are hardcoded to demo and globally unique).
 *
 * Idempotent: drops and recreates only the `uatb` institute.
 */
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const SLUG = 'uatb';
const CODE = '2000';
const ADMIN_EMAIL = 'admin@uatb.local';
const TEACHER_EMAIL = 'teacher@uatb.local';
const ADMIN_PASSWORD = 'Admin@123';
const TEACHER_PASSWORD = 'Teacher@123';
const STUDENT_PASSWORD = 'Student@123';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const existing = await prisma.institute.findUnique({ where: { slug: SLUG } });
  if (existing) {
    await prisma.auditLog.deleteMany({ where: { instituteId: existing.id } });
    await prisma.institute.delete({ where: { id: existing.id } });
    console.log('dropped existing', SLUG);
  }

  const [adminHash, teacherHash, studentHash] = await Promise.all([
    hash(ADMIN_PASSWORD),
    hash(TEACHER_PASSWORD),
    hash(STUDENT_PASSWORD),
  ]);

  const inst = await prisma.institute.create({
    data: { name: 'UAT Tenant B', slug: SLUG, code: CODE },
  });

  const admin = await prisma.user.create({
    data: {
      instituteId: inst.id,
      name: 'UAT B Admin',
      email: ADMIN_EMAIL,
      roles: ['ADMIN'],
      status: 'ACTIVE',
      passwordHash: adminHash,
    },
  });
  const teacher = await prisma.user.create({
    data: {
      instituteId: inst.id,
      name: 'UAT B Teacher',
      email: TEACHER_EMAIL,
      roles: ['TEACHER'],
      status: 'ACTIVE',
      passwordHash: teacherHash,
    },
  });

  const program = await prisma.program.create({
    data: { instituteId: inst.id, name: 'NEET' },
  });
  const klass = await prisma.class.create({
    data: { instituteId: inst.id, programId: program.id, name: 'Class 12' },
  });
  const batch = await prisma.batch.create({
    data: { instituteId: inst.id, classId: klass.id, name: 'Alpha' },
  });

  // Two students so cohort maths has something to work with.
  const students = [];
  for (let i = 1; i <= 2; i++) {
    const u = await prisma.user.create({
      data: {
        instituteId: inst.id,
        name: `UAT B Student ${i}`,
        email: `student${i}@uatb.local`,
        roles: ['STUDENT'],
        status: 'ACTIVE',
        passwordHash: studentHash,
      },
    });
    const s = await prisma.student.create({
      data: {
        userId: u.id,
        instituteId: inst.id,
        batchId: batch.id,
        rollNumber: `26${CODE}00000${i}`,
      },
    });
    students.push(s);
  }

  // Taxonomy + one approved question so the question bank has tenant-B content.
  const subject = await prisma.subject.create({
    data: { instituteId: inst.id, name: 'Physics' },
  });
  const chapter = await prisma.chapter.create({
    data: { instituteId: inst.id, subjectId: subject.id, name: 'Kinematics' },
  });
  const question = await prisma.question.create({
    data: {
      instituteId: inst.id,
      subject: 'Physics',
      chapter: 'Kinematics',
      subjectId: subject.id,
      chapterId: chapter.id,
      difficulty: 'EASY',
      type: 'MCQ',
      language: 'EN',
      statement: 'TENANT-B-SECRET-QUESTION: which option is correct?',
      options: [
        { key: 'A', text: 'Alpha' },
        { key: 'B', text: 'Beta' },
      ],
      answerKey: 'A',
      marks: 4,
      negativeMarks: 1,
      status: 'APPROVED',
      createdById: teacher.id,
      approvedById: admin.id,
      approvedAt: new Date(),
    },
  });

  const exam = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: 'TENANT-B-SECRET-EXAM',
      durationMinutes: 60,
      status: 'PUBLISHED',
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 3 * 60 * 60_000),
      createdById: teacher.id,
      programId: program.id,
    },
  });
  const section = await prisma.examSection.create({
    data: {
      examId: exam.id,
      instituteId: inst.id,
      name: 'Physics',
      order: 0,
      marksCorrect: 4,
      marksWrong: 1,
    },
  });
  await prisma.examQuestion.create({
    data: {
      examId: exam.id,
      sectionId: section.id,
      questionId: question.id,
      instituteId: inst.id,
      order: 0,
    },
  });
  await prisma.examBatch.create({
    data: { examId: exam.id, batchId: batch.id, instituteId: inst.id },
  });

  await prisma.announcement.create({
    data: {
      instituteId: inst.id,
      title: 'TENANT-B-SECRET-ANNOUNCEMENT',
      body: 'Only tenant B should ever see this.',
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });

  console.log(
    JSON.stringify(
      {
        instituteId: inst.id,
        slug: SLUG,
        code: CODE,
        adminEmail: ADMIN_EMAIL,
        teacherEmail: TEACHER_EMAIL,
        studentRolls: students.map((s) => s.rollNumber),
        programId: program.id,
        classId: klass.id,
        batchId: batch.id,
        subjectId: subject.id,
        questionId: question.id,
        examId: exam.id,
        sectionId: section.id,
        studentIds: students.map((s) => s.id),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FIXTURE FAILED:', e?.message ?? e);
  process.exit(1);
});
