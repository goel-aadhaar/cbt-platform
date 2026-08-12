"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { SearchIcon } from "@/components/admin/icons";
import { QuestionDetailDrawer } from "@/components/admin/question-detail-drawer";
import { Panel, StatusPill } from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { getUserSnapshot } from "@/lib/auth";
import { actOnQuestion } from "@/lib/admin";
import {
  listQuestions,
  type QuestionListItem,
  type QuestionStatus,
} from "@/lib/questions";

type Scope = "mine" | "all";

const STATUS_TONE: Record<QuestionStatus, "good" | "warn" | "muted"> = {
  DRAFT: "muted",
  REVIEW: "warn",
  APPROVED: "good",
  ARCHIVED: "muted",
};

export default function TeacherQuestionsPage() {
  return (
    <Suspense fallback={null}>
      <QuestionsScreen />
    </Suspense>
  );
}

function QuestionsScreen() {
  const me = getUserSnapshot();
  const [scope, setScope] = useState<Scope>("mine");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<QuestionListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (s: Scope, term: string) => {
    setRows(null);
    try {
      const res = await listQuestions({
        limit: 50,
        ...(s === "mine" ? { mine: true } : {}),
        ...(term ? { search: term } : {}),
      });
      setRows(res.items);
      setTotal(res.total);
      setError(null);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not load the question bank",
      );
      setRows([]);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(scope, search.trim()), 250);
    return () => clearTimeout(id);
  }, [scope, search, load]);

  /**
   * Submit a draft for an administrator to approve. A teacher cannot approve
   * their own work, so this is the end of their side of the workflow.
   */
  async function submitForApproval(q: QuestionListItem) {
    setBusy(q.id);
    setError(null);
    setNotice(null);
    try {
      await actOnQuestion(q.id, "submit");
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === q.id ? { ...r, status: "REVIEW" as QuestionStatus } : r,
        ),
      );
      setNotice("Sent for approval. An administrator will review it.");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not submit the question",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <TeacherShell title="Question Bank">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(["mine", "all"] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                scope === s
                  ? "bg-admin text-white"
                  : "border border-admin-line bg-white text-admin-ink hover:bg-admin-bg"
              }`}
            >
              {s === "mine" ? "My questions" : "Whole bank"}
            </button>
          ))}
        </div>
        <div className="relative flex max-w-sm flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions…"
            className="h-11 w-full rounded-full border border-admin-line bg-white pl-10 pr-4 text-sm outline-none focus:border-admin"
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-xl border border-admin/30 bg-admin/5 px-4 py-3 text-sm font-semibold text-admin">
          {notice}
        </p>
      )}

      <Panel
        title={
          rows ? `${total.toLocaleString("en-IN")} questions` : "Questions"
        }
        subtitle={
          scope === "mine"
            ? "Questions you wrote. Drafts can be sent for approval."
            : "Every question in your institute's bank."
        }
      >
        {rows === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-admin-line/15"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
            {scope === "mine"
              ? "You have not written any questions yet."
              : "No questions match that search."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((q) => (
              <li
                key={q.id}
                className={`flex items-start justify-between gap-4 rounded-xl border border-admin-line/60 p-4 ${
                  busy === q.id ? "opacity-50" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(q.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="line-clamp-2 text-sm font-semibold text-admin-ink">
                    {q.statement}
                  </p>
                  <p className="mt-1 text-xs text-admin-muted">
                    {q.subject} · {q.chapter} · {q.type} · {q.marks} marks
                    {q.createdBy && scope === "all"
                      ? ` · ${q.createdBy.id === me?.id ? "you" : q.createdBy.name}`
                      : ""}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill tone={STATUS_TONE[q.status]}>
                    {q.status === "REVIEW" ? "In review" : q.status}
                  </StatusPill>
                  {q.status === "DRAFT" && q.createdBy?.id === me?.id && (
                    <button
                      type="button"
                      disabled={busy === q.id}
                      onClick={() => void submitForApproval(q)}
                      className="rounded-lg bg-admin px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
                    >
                      Send for approval
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <QuestionDetailDrawer
        questionId={openId ?? undefined}
        open={openId !== null}
        onClose={() => setOpenId(null)}
      />
    </TeacherShell>
  );
}
