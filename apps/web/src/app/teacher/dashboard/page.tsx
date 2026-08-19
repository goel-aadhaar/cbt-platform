"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ClipboardIcon,
  DatabaseIcon,
  UsersIcon,
} from "@/components/admin/icons";
import {
  BarList,
  Panel,
  StatCard,
  StatusPill,
} from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { getMyBatches } from "@/lib/admin";
import { getUserSnapshot } from "@/lib/auth";
import { examDisplayStatus, listExams, type ExamListItem } from "@/lib/exams";
import { listQuestions } from "@/lib/questions";
import { listStudents } from "@/lib/students";

interface Snapshot {
  exams: ExamListItem[];
  questions: number;
  myQuestions: number;
  students: number;
  batches: { id: string; name: string }[];
}

export default function TeacherDashboardPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = getUserSnapshot();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listExams(),
      listQuestions({ limit: 1 }),
      listQuestions({ limit: 1, mine: true }),
      listStudents({ limit: 1 }),
      getMyBatches(),
    ])
      .then(([exams, all, mine, students, batches]) => {
        if (cancelled) return;
        setData({
          exams,
          questions: all.total,
          myQuestions: mine.total,
          students: students.total,
          batches,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load your dashboard",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Mine" is by author, so a teacher sees their own work first rather than
  // the whole institute's.
  const mine = (data?.exams ?? []).filter((e) => e.createdBy?.id === me?.id);
  const awaitingApproval = mine.filter((e) => e.status === "REVIEW");
  const rejected = mine.filter(
    (e) => e.rejectionReason && e.status === "DRAFT",
  );
  const drafts = mine.filter((e) => e.status === "DRAFT" && !e.rejectionReason);

  return (
    <TeacherShell
      title={`Welcome back, ${me?.name?.split(" ")[0] ?? "Teacher"}`}
    >
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClipboardIcon}
          label="My exams"
          value={data ? mine.length : undefined}
          hint={
            data
              ? awaitingApproval.length > 0
                ? `${awaitingApproval.length} awaiting approval`
                : "none pending"
              : undefined
          }
          tone={awaitingApproval.length > 0 ? "warn" : "default"}
        />
        <StatCard
          icon={DatabaseIcon}
          label="Questions I wrote"
          value={data?.myQuestions}
          hint={data ? `${data.questions} in the bank` : undefined}
        />
        <StatCard
          icon={ClipboardIcon}
          label="Drafts in progress"
          value={data ? drafts.length : undefined}
        />
        <StatCard icon={UsersIcon} label="Students" value={data?.students} />
      </div>

      {rejected.length > 0 && (
        <div className="mt-6">
          <Panel
            title="Sent back for changes"
            subtitle="An administrator asked for revisions before these can run"
          >
            <ul className="flex flex-col gap-3">
              {rejected.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-[#f0ad4e]/40 bg-[#fff8ec] p-4"
                >
                  <p className="font-bold text-admin-ink">{e.title}</p>
                  <p className="mt-1 text-sm text-admin-muted">
                    {e.rejectionReason}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="My recent exams"
          subtitle="Newest first"
          action={
            <Link
              href="/teacher/exams"
              className="text-xs font-bold uppercase text-admin hover:underline"
            >
              All exams
            </Link>
          }
        >
          {data === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg bg-admin-line/15"
                />
              ))}
            </div>
          ) : mine.length === 0 ? (
            <div className="rounded-xl border border-dashed border-admin-line p-8 text-center">
              <p className="text-sm text-admin-muted">
                You have not created an exam yet.
              </p>
              <Link
                href="/teacher/exams?new=1"
                className="mt-3 inline-block rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95"
              >
                Build your first paper
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.slice(0, 5).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-admin-line/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-admin-ink">
                      {e.title}
                    </p>
                    <p className="text-xs text-admin-muted">
                      {e._count.questions} questions · {e.durationMinutes} min
                    </p>
                  </div>
                  <ExamStatusPill exam={e} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Where my papers stand"
          subtitle="Across every exam you have authored"
        >
          <BarList
            items={[
              { label: "Draft", value: drafts.length },
              { label: "Awaiting approval", value: awaitingApproval.length },
              {
                label: "Approved / scheduled",
                value: mine.filter((e) =>
                  ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(
                    examDisplayStatus(e),
                  ),
                ).length,
              },
              {
                label: "Completed",
                value: mine.filter((e) => examDisplayStatus(e) === "COMPLETED")
                  .length,
              },
            ].filter((i) => i.value > 0)}
            empty="Nothing authored yet"
          />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="My Batches"
          subtitle="What you may see across exams, students and results"
        >
          {data === null ? (
            <div className="h-8 w-48 animate-pulse rounded-lg bg-admin-line/15" />
          ) : data.batches.length === 0 ? (
            <p className="text-sm text-admin-muted">
              You have not been assigned to a batch yet — ask an administrator
              to assign one from the Teachers page.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.batches.map((b) => (
                <span
                  key={b.id}
                  className="rounded-full bg-admin-mint/40 px-3 py-1.5 text-sm font-medium text-admin"
                >
                  {b.name}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </TeacherShell>
  );
}

export function ExamStatusPill({ exam }: { exam: ExamListItem }) {
  const status = examDisplayStatus(exam);
  const tone =
    status === "REVIEW"
      ? "warn"
      : status === "DRAFT" || status === "ARCHIVED"
        ? "muted"
        : "good";
  const label = status === "REVIEW" ? "Awaiting approval" : status;
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
