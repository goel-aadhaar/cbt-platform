import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { AttemptStatus, ResponseStatus } from './attempt.types';
import { SaveResponseDto } from './dto/attempt.dto';

// NOTE: the question select deliberately omits answerKey/explanation — students
// must never receive the correct answers.
const stateSelect = {
  id: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  submittedAt: true,
  exam: {
    select: {
      id: true,
      title: true,
      durationMinutes: true,
      instructions: true,
      calculatorEnabled: true,
      sections: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          order: true,
          marksCorrect: true,
          marksWrong: true,
          questions: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              question: {
                select: {
                  id: true,
                  type: true,
                  statement: true,
                  options: true,
                  marks: true,
                },
              },
            },
          },
        },
      },
    },
  },
  responses: { select: { questionId: true, status: true, answer: true } },
} satisfies Prisma.AttemptSelect;

/**
 * Candidate exam engine (§2.2). A student starts one attempt per exam; the
 * server owns the clock (expiresAt) so it's refresh/reconnection-safe and
 * auto-submits on timeout. Responses auto-save with NTA palette states.
 */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private async currentStudent() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true, instituteId: true, batchId: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');
    return student;
  }

  async start(examId: string) {
    const student = await this.currentStudent();
    const exam = await this.prisma.exam.findFirst({
      where: {
        id: examId,
        instituteId: student.instituteId,
        status: 'PUBLISHED',
      },
      select: { id: true, durationMinutes: true, startAt: true, endAt: true },
    });
    if (!exam) throw new NotFoundException('Exam not found or not published');

    const now = new Date();
    if (!exam.startAt || !exam.endAt || now < exam.startAt) {
      throw new BadRequestException('The exam has not started yet');
    }
    if (now > exam.endAt) throw new BadRequestException('The exam has ended');

    const assigned = await this.prisma.examBatch.findFirst({
      where: { examId, batchId: student.batchId },
    });
    if (!assigned) {
      throw new ForbiddenException('You are not assigned to this exam');
    }

    const existing = await this.prisma.attempt.findUnique({
      where: { examId_studentId: { examId, studentId: student.id } },
    });
    if (existing) {
      if (existing.status !== AttemptStatus.IN_PROGRESS) {
        throw new ConflictException('You have already submitted this exam');
      }
      return this.buildState(existing.id, student.instituteId);
    }

    // Server-owned deadline: earlier of (now + duration) and the exam window end.
    const durationEnd = new Date(now.getTime() + exam.durationMinutes * 60_000);
    const expiresAt = durationEnd < exam.endAt ? durationEnd : exam.endAt;

    const examQuestions = await this.prisma.examQuestion.findMany({
      where: { examId },
      select: { questionId: true },
    });

    const attempt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attempt.create({
        data: {
          instituteId: student.instituteId,
          examId,
          studentId: student.id,
          startedAt: now,
          expiresAt,
        },
      });
      await tx.response.createMany({
        data: examQuestions.map((eq) => ({
          attemptId: created.id,
          questionId: eq.questionId,
          instituteId: student.instituteId,
        })),
      });
      return created;
    });

    return this.buildState(attempt.id, student.instituteId);
  }

  async getState(attemptId: string) {
    const student = await this.currentStudent();
    await this.ensureOwned(attemptId, student.id);
    await this.autoSubmitIfExpired(attemptId, student.id);
    return this.buildState(attemptId, student.instituteId);
  }

  async saveResponse(
    attemptId: string,
    questionId: string,
    dto: SaveResponseDto,
  ) {
    const student = await this.currentStudent();
    await this.getActiveAttempt(attemptId, student.id);

    const response = await this.prisma.response.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
    });
    if (!response) throw new NotFoundException('Question not in this attempt');

    const hasAnswer =
      dto.answer !== undefined &&
      dto.answer !== null &&
      !(Array.isArray(dto.answer) && dto.answer.length === 0);
    const marked = dto.markedForReview ?? false;

    return this.prisma.response.update({
      where: { id: response.id },
      data: {
        answer: hasAnswer
          ? (dto.answer as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        status: this.computeStatus(hasAnswer, marked),
      },
      select: { questionId: true, status: true, answer: true },
    });
  }

  async submit(attemptId: string) {
    const student = await this.currentStudent();
    await this.getActiveAttempt(attemptId, student.id);
    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { status: AttemptStatus.SUBMITTED, submittedAt: new Date() },
    });
    return this.summary(attemptId);
  }

  async summary(attemptId: string) {
    const student = await this.currentStudent();
    const attempt = await this.ensureOwned(attemptId, student.id);

    const grouped = await this.prisma.response.groupBy({
      by: ['status'],
      where: { attemptId },
      _count: { _all: true },
    });
    const counts: Record<ResponseStatus, number> = {
      NOT_VISITED: 0,
      NOT_ANSWERED: 0,
      ANSWERED: 0,
      MARKED: 0,
      ANSWERED_MARKED: 0,
    };
    for (const row of grouped) counts[row.status] = row._count._all;

    return {
      attemptId,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      answered: counts.ANSWERED + counts.ANSWERED_MARKED,
      markedForReview: counts.MARKED + counts.ANSWERED_MARKED,
      notAnswered: counts.NOT_ANSWERED,
      notVisited: counts.NOT_VISITED,
    };
  }

  private computeStatus(hasAnswer: boolean, marked: boolean): ResponseStatus {
    if (hasAnswer && marked) return ResponseStatus.ANSWERED_MARKED;
    if (hasAnswer) return ResponseStatus.ANSWERED;
    if (marked) return ResponseStatus.MARKED;
    return ResponseStatus.NOT_ANSWERED;
  }

  private async buildState(attemptId: string, instituteId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, instituteId },
      select: stateSelect,
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    const remainingSeconds = Math.max(
      0,
      Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000),
    );
    return { ...attempt, remainingSeconds };
  }

  private async ensureOwned(attemptId: string, studentId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, studentId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }

  /** Returns the attempt only if it's live; auto-submits (and rejects) if expired. */
  private async getActiveAttempt(attemptId: string, studentId: string) {
    const attempt = await this.ensureOwned(attemptId, studentId);
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('This attempt is already submitted');
    }
    if (new Date() > attempt.expiresAt) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { status: AttemptStatus.AUTO_SUBMITTED, submittedAt: new Date() },
      });
      throw new BadRequestException(
        'Time is up — the attempt was auto-submitted',
      );
    }
    return attempt;
  }

  private async autoSubmitIfExpired(attemptId: string, studentId: string) {
    const attempt = await this.ensureOwned(attemptId, studentId);
    if (
      attempt.status === AttemptStatus.IN_PROGRESS &&
      new Date() > attempt.expiresAt
    ) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { status: AttemptStatus.AUTO_SUBMITTED, submittedAt: new Date() },
      });
    }
  }
}
