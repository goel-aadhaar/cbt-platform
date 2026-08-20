"use client";

import Link from "next/link";

import type { ComponentType, SVGProps } from "react";
import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { ExamCalendarModal } from "@/components/admin/exam-calendar-modal";
import { ExamReviewDrawer } from "@/components/admin/exam-review-drawer";
import { ExamScheduleModal } from "@/components/admin/exam-schedule-modal";
import { ExamStatusPill } from "@/components/admin/exam-status-pill";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClipboardIcon,
  FileTextIcon,
  PlusCircleIcon,
  RadioIcon,
} from "@/components/admin/icons";
import { InstructionTemplatesModal } from "@/components/admin/instruction-templates-modal";
import { RejectExamModal } from "@/components/admin/reject-exam-modal";
import { useAdminData } from "@/hooks/use-admin-data";
import { approveExam, rejectExam } from "@/lib/admin";
import {
  type ExamDisplayStatus,
  type ExamListItem,
  examDisplayStatus,
  formatSchedule,
  listExams,
} from "@/lib/exams";

const TABS: { label: string; match: ExamDisplayStatus[] | null }[] = [
  { label: "All Exams", match: null },
  { label: "Draft", match: ["DRAFT"] },
  { label: "Awaiting Approval", match: ["REVIEW"] },
  { label: "Qualified", match: ["APPROVED"] },
  { label: "Scheduled", match: ["SCHEDULED"] },
  {
    label: "Published",
    match: ["PUBLISHED", "SCHEDULED", "LIVE", "COMPLETED"],
  },
  { label: "Live", match: ["LIVE"] },
  { label: "Completed", match: ["COMPLETED"] },
  { label: "Cancelled", match: ["ARCHIVED"] },
];

export default function ExamsPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [scheduling, setScheduling] = useState<{
    id: string;
    title: string;
    status: "APPROVED" | "PUBLISHED";
  } | null>(null);

  /** Approve straight from the list — no confirmation here (unlike the
   * review workspace's), since the admin is acting on a row they can already see. */
  async function approveFromList(exam: ExamListItem) {
    setBusy(exam.id);
    setNotice(null);
    try {
      await approveExam(exam.id);
      setNotice(`"${exam.title}" approved — it is now a qualified test.`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const [rejectingExam, setRejectingExam] = useState<ExamListItem | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);

  async function rejectFromList(
    exam: ExamListItem,
    reason: string | undefined,
  ) {
    setBusy(exam.id);
    setRejectError(null);
    try {
      await rejectExam(exam.id, reason);
      setRejectingExam(null);
      setNotice(`"${exam.title}" sent back to the author.`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const { data, loading, error } = useAdminData(() => listExams());
  const exams = useMemo(() => data ?? [], [data]);

  const withStatus = useMemo(
    () => exams.map((e) => ({ e, s: examDisplayStatus(e) })),
    [exams],
  );
  const countS = (s: ExamDisplayStatus) =>
    withStatus.filter((x) => x.s === s).length;

  const match = TABS[tab].match;
  const rows = match
    ? withStatus.filter((x) => match.includes(x.s))
    : withStatus;

  const approvedQ = exams.reduce((n, e) => n + e._count.questions, 0);

  return (
    <AdminShell title="Exams">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {notice && (
          <p
            role="status"
            className="rounded-lg border border-admin/30 bg-admin/5 px-4 py-2.5 text-sm text-admin"
          >
            {notice}
          </p>
        )}
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-admin-ink">Exams</h2>
            <p className="mt-1 text-sm text-admin-muted">
              {exams.length} exams · {approvedQ} questions in use
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <OutlineBtn
              icon={ClipboardIcon}
              onClick={() => setTemplatesOpen(true)}
            >
              Instruction Templates
            </OutlineBtn>
            <OutlineBtn
              icon={CalendarIcon}
              onClick={() => setCalendarOpen(true)}
            >
              Exam Calendar
            </OutlineBtn>
            {/* Authoring is a teacher's job (§2.3) — an administrator who
                wrote the paper would be approving their own work. The link
                leads to the catalogue that names every paper instead. */}
            <Link
              href="/admin/exam-categories"
              className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              <PlusCircleIcon className="size-4" /> Exam Categories
            </Link>
          </div>
        </div>

        {/* Stat cards (live counts) */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <ExamStat
            icon={FileTextIcon}
            tint="bg-admin-surface text-admin-muted"
            label="Draft Exams"
            value={pad(countS("DRAFT"))}
          />
          <ExamStat
            icon={AlertTriangleIcon}
            tint="bg-warn/15 text-warn"
            label="Awaiting Approval"
            value={pad(countS("REVIEW"))}
          />
          <ExamStat
            icon={CheckCircleIcon}
            tint="bg-admin/10 text-admin"
            label="Qualified"
            value={pad(countS("APPROVED"))}
          />
          <ExamStat
            icon={RadioIcon}
            tint="bg-danger-soft/50 text-danger"
            label="Live Now"
            value={pad(countS("LIVE"))}
            dot
          />
          <ExamStat
            icon={CheckCircleIcon}
            tint="bg-admin-mint/40 text-admin"
            label="Completed"
            value={pad(countS("COMPLETED"))}
          />
        </div>

        {/* Two-column */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {TABS.map((t, i) => {
                const active = i === tab;
                const c = t.match
                  ? withStatus.filter((x) => t.match!.includes(x.s)).length
                  : exams.length;
                return (
                  <button
                    key={t.label}
                    onClick={() => setTab(i)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-admin text-white" : "bg-white text-admin-muted hover:bg-admin-bg"}`}
                  >
                    {t.label}
                    <span
                      className={active ? "text-white/80" : "text-admin-subtle"}
                    >
                      {c}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-line/60 bg-white p-3">
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-admin-muted">
                  Sort by:{" "}
                  <span className="font-semibold text-admin-ink">
                    Newest First
                  </span>
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-admin-line/60 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-admin-line/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" className="size-4 accent-admin" />
                    </th>
                    <th className="px-4 py-3">Exam Name</th>
                    <th className="px-4 py-3">Batches</th>
                    <th className="px-4 py-3">Schedule</th>
                    <th className="px-4 py-3">Questions</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-line/50">
                  {loading && <Msg>Loading exams…</Msg>}
                  {!loading && error && <Msg tone="error">{error}</Msg>}
                  {!loading && !error && rows.length === 0 && (
                    <Msg>No exams in this view.</Msg>
                  )}
                  {!loading &&
                    !error &&
                    rows.map(({ e, s }) => (
                      <ExamRow
                        key={e.id}
                        e={e}
                        s={s}
                        busy={busy !== null}
                        onApprove={() => void approveFromList(e)}
                        onReject={() => setRejectingExam(e)}
                        onOpen={() => setReviewingId(e.id)}
                        onSchedule={(status) =>
                          setScheduling({ id: e.id, title: e.title, status })
                        }
                      />
                    ))}
                </tbody>
              </table>
              <div className="border-t border-admin-line/60 px-4 py-3 text-sm text-admin-muted">
                Showing {rows.length} of {exams.length} exams
              </div>
            </div>
          </div>

          {/* Right rail (static) */}
          <div className="flex flex-col gap-6">
            <Card>
              <h3 className="text-lg font-bold text-admin-ink">
                Live Snapshot
              </h3>
              <div className="mt-4 rounded-xl bg-admin-bg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-admin-muted">Live exams</span>
                  <span className="text-lg font-bold text-admin-ink">
                    {countS("LIVE")}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-admin-muted">Scheduled</span>
                  <span className="font-semibold text-admin">
                    {countS("SCHEDULED")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-admin-muted">Completed</span>
                  <span className="font-semibold text-admin-ink">
                    {countS("COMPLETED")}
                  </span>
                </div>
              </div>
            </Card>
            <Card>
              <h3 className="text-lg font-bold text-admin-ink">
                Critical Alerts
              </h3>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft/30 p-4">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-danger" />
                <p className="text-sm text-admin-ink">
                  Monitor live exams from the Live Monitoring section.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <InstructionTemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />
      <ExamCalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        exams={exams}
        onOpenExam={(examId) => {
          setCalendarOpen(false);
          setReviewingId(examId);
        }}
      />
      <ExamReviewDrawer
        key={reviewingId ?? "none"}
        open={reviewingId !== null}
        onClose={() => setReviewingId(null)}
        examId={reviewingId ?? undefined}
        onActioned={(action) => {
          setNotice(
            action === "approve"
              ? "Exam approved — it is now a qualified test."
              : "Exam sent back to the author.",
          );
          setTimeout(() => window.location.reload(), 1000);
        }}
      />
      <ExamScheduleModal
        key={scheduling?.id ?? "none"}
        open={scheduling !== null}
        onClose={() => setScheduling(null)}
        examId={scheduling?.id}
        examTitle={scheduling?.title}
        examStatus={scheduling?.status}
        onScheduled={() => {
          setNotice(
            scheduling?.status === "APPROVED"
              ? `"${scheduling.title}" scheduled and published.`
              : `"${scheduling?.title}" rescheduled.`,
          );
          setTimeout(() => window.location.reload(), 1000);
        }}
      />
      {rejectingExam && (
        <RejectExamModal
          examTitle={rejectingExam.title}
          authorName={rejectingExam.createdBy?.name ?? "its author"}
          busy={busy !== null}
          error={rejectError}
          onCancel={() => setRejectingExam(null)}
          onConfirm={(reason) => void rejectFromList(rejectingExam, reason)}
        />
      )}
    </AdminShell>
  );
}

function ExamRow({
  e,
  s,
  busy,
  onApprove,
  onReject,
  onOpen,
  onSchedule,
}: {
  e: ExamListItem;
  s: ExamDisplayStatus;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpen: () => void;
  onSchedule: (status: "APPROVED" | "PUBLISHED") => void;
}) {
  const code = `EX-${e.id.slice(0, 5).toUpperCase()}`;
  return (
    <tr className="hover:bg-admin-bg/50">
      <td className="px-4 py-4">
        <input type="checkbox" className="size-4 accent-admin" />
      </td>
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-admin-mint/40 text-admin">
            <FileTextIcon className="size-4" />
          </span>
          <div>
            <p className="font-bold text-admin-ink hover:underline">
              {e.title}
            </p>
            <p className="font-mono text-xs text-admin-subtle">ID: {code}</p>
          </div>
        </button>
      </td>
      <td className="px-4 py-4 text-admin-ink">{e._count.batches}</td>
      <td className="px-4 py-4">
        <p className="font-semibold text-admin-ink">{formatSchedule(e)}</p>
        <p className="text-xs text-admin-subtle">
          Duration: {e.durationMinutes} min
        </p>
      </td>
      <td className="px-4 py-4 text-admin-ink">{e._count.questions}</td>
      <td className="px-4 py-4">
        <ExamStatusPill status={s} />
        {s === "REVIEW" && e.reviewer && (
          <p className="mt-1 text-xs text-admin-subtle">
            for {e.reviewer.name}
          </p>
        )}
        {s === "DRAFT" && e.rejectionReason && (
          <p className="mt-1 max-w-[180px] text-xs text-danger">
            Sent back: {e.rejectionReason}
          </p>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-2">
          {s === "REVIEW" && (
            <>
              <button
                disabled={busy}
                onClick={onReject}
                className="rounded-lg border border-admin-line bg-white px-3 py-1.5 text-xs font-bold uppercase text-danger hover:bg-danger-soft/30 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                disabled={busy}
                onClick={onApprove}
                className="rounded-lg bg-admin px-3 py-1.5 text-xs font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
              >
                Approve
              </button>
            </>
          )}
          {s === "APPROVED" && (
            <button
              disabled={busy}
              onClick={() => onSchedule("APPROVED")}
              className="rounded-lg bg-admin px-3 py-1.5 text-xs font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
            >
              Schedule Exam
            </button>
          )}
          {s === "SCHEDULED" && (
            <button
              disabled={busy}
              onClick={() => onSchedule("PUBLISHED")}
              className="rounded-lg border border-admin-line bg-white px-3 py-1.5 text-xs font-bold uppercase text-admin-ink hover:bg-admin-bg disabled:opacity-50"
            >
              Reschedule
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {children}
    </section>
  );
}

function ExamStat({
  icon: Icon,
  tint,
  label,
  value,
  dot,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tint: string;
  label: string;
  value: string;
  dot?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <span
          className={`flex size-11 items-center justify-center rounded-full ${tint}`}
        >
          <Icon className="size-5" />
        </span>
        {dot && <span className="size-2 rounded-full bg-danger" />}
      </div>
      <p className="mt-4 text-sm text-admin-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-admin-ink">{value}</p>
    </Card>
  );
}

function OutlineBtn({
  icon: Icon,
  children,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
    >
      <Icon className="size-4 text-admin-muted" />
      {children}
    </button>
  );
}

function Msg({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <tr>
      <td
        colSpan={6}
        className={`px-4 py-10 text-center ${tone === "error" ? "text-danger" : "text-admin-muted"}`}
      >
        {children}
      </td>
    </tr>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
