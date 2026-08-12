-- Practice library progress (§2.4). Separate from exams by design: no attempt,
-- no result, nothing that reaches a report card. These tables only back the
-- student's own progress view.

CREATE TABLE "practice_sessions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "chapter" TEXT,
    "topic" TEXT,
    "total_count" INTEGER NOT NULL,
    "answered_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "timed" BOOLEAN NOT NULL DEFAULT false,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_answers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "practice_sessions_student_id_subject_idx" ON "practice_sessions"("student_id", "subject");
CREATE INDEX "practice_sessions_student_id_completed_at_idx" ON "practice_sessions"("student_id", "completed_at");
CREATE INDEX "practice_sessions_institute_id_idx" ON "practice_sessions"("institute_id");
CREATE INDEX "practice_answers_question_id_idx" ON "practice_answers"("question_id");
CREATE UNIQUE INDEX "practice_answers_session_id_question_id_key" ON "practice_answers"("session_id", "question_id");

ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
