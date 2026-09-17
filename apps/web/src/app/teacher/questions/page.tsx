"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { PlusIcon, SearchIcon, UploadIcon } from "@/components/admin/icons";
import { PaginationBar } from "@/components/pagination-bar";
import { CreateDppModal } from "@/components/admin/create-dpp-modal";
import { QuestionAuthorDrawer } from "@/components/admin/question-author-drawer";
import { QuestionDetailDrawer } from "@/components/admin/question-detail-drawer";
import { QuestionImportModal } from "@/components/admin/question-modals";
import { Panel, StatusPill } from "@/components/staff/charts";
import { useAdminData } from "@/hooks/use-admin-data";
import { useKeyedAsyncAction } from "@/hooks/use-async-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { getUserSnapshot } from "@/lib/auth";
import { actOnQuestion, getMyBatches } from "@/lib/admin";
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
  // Not "muted": a sent-back question is the one item in this list that
  // needs the author to do something.
  REJECTED: "warn",
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
  const [offset, setOffset] = useState(0);
  const PAGE = 50;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [authorOpen, setAuthorOpen] = useState(false);
  // Bulk import was reachable only from the admin console, even though the API
  // has always allowed TEACHER — and a teacher is who actually builds a bank.
  const [importOpen, setImportOpen] = useState(false);
  /** Manually ticked rows — the source for "Create DPP" below. */
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [dppOpen, setDppOpen] = useState(false);
  // Only the batches this teacher actually teaches — the server checks again,
  // this list is convenience, not the control (same as the exam scheduler).
  const { data: myBatches } = useAdminData(() => getMyBatches(), []);

  const load = useCallback(
    async (s: Scope, term: string, at: number) => {
      setRows(null);
      try {
        const res = await listQuestions({
          limit: PAGE,
          offset: at,
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
    },
    [PAGE],
  );

  // Only the typed term is debounced — scope changes and pagination clicks
  // resolve in a single change, so delaying those would be lag with nothing
  // to gain.
  const debouncedSearch = useDebouncedValue(search, 250);

  /**
   * A changed scope or (settled) search term invalidates whatever page was
   * loaded — reset during render (React's documented "adjust state when a
   * prop changes" pattern) rather than in an effect, to avoid an extra
   * render and a flash of the stale page before the reset lands.
   */
  const filterKey = JSON.stringify([scope, debouncedSearch]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setOffset(0);
  }

  useEffect(() => {
    // Deferred a tick (not a real delay — debouncing already happened above
    // for the search term) so `load`'s synchronous `setRows(null)` runs
    // outside the effect body itself, same as the timer this replaced.
    const id = setTimeout(
      () => void load(scope, debouncedSearch.trim(), offset),
    );
    return () => clearTimeout(id);
  }, [scope, debouncedSearch, offset, load]);

  /**
   * Submit a draft for an administrator to approve. A teacher cannot approve
   * their own work, so this is the end of their side of the workflow.
   */
  /**
   * Keyed so a second row cannot steal the lock.
   *
   * The single-slot `busy` id had a hole: starting an action on another row
   * overwrote the id, which re-enabled the first row's button while its request
   * was still in flight, and the first request finishing then re-enabled the
   * second the same way. The keyed lock is synchronous and only ever releases
   * the row it belongs to.
   */
  const submitAction = useKeyedAsyncAction(
    async (id: string) => {
      await actOnQuestion(id, "submit");
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === id ? { ...r, status: "REVIEW" as QuestionStatus } : r,
        ),
      );
      setNotice("Sent for approval. An administrator will review it.");
    },
    {
      onError: (_id, message) => setError(message),
      fallbackMessage: "Could not submit the question",
    },
  );

  function submitForApproval(q: QuestionListItem) {
    setError(null);
    setNotice(null);
    void submitAction.run(q.id);
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
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-full border border-admin-line bg-white px-5 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
        >
          <UploadIcon className="size-4" /> Bulk Import
        </button>
        <button
          type="button"
          onClick={() => setAuthorOpen(true)}
          className="flex items-center gap-2 rounded-full bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" /> Add Question
        </button>
      </div>

      {/* Selection bar — the direct Question Bank → tick → Create DPP flow
          (§ Product Structure); no separate "add to Practice Bank" step. */}
      {ticked.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-admin-line/60 bg-admin/5 px-4 py-3">
          <span className="text-sm font-semibold text-admin-ink">
            {ticked.size} selected
          </span>
          <button
            type="button"
            onClick={() => setTicked(new Set())}
            className="text-sm font-semibold text-admin hover:underline"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setDppOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-lg bg-admin px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Create DPP
          </button>
        </div>
      )}

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
                  submitAction.isPending(q.id) ? "opacity-50" : ""
                }`}
              >
                {/* Only APPROVED questions may go into a DPP — same rule the
                    server enforces, so an unapproved row gets no checkbox at
                    all rather than one that would fail on submit. */}
                {q.status === "APPROVED" ? (
                  <input
                    type="checkbox"
                    checked={ticked.has(q.id)}
                    onChange={() =>
                      setTicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(q.id)) next.delete(q.id);
                        else next.add(q.id);
                        return next;
                      })
                    }
                    aria-label="Select for DPP"
                    className="mt-1.5 size-4 shrink-0 accent-admin"
                  />
                ) : (
                  <span className="mt-1.5 size-4 shrink-0" />
                )}
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
                    {q.status === "REVIEW"
                      ? "In review"
                      : q.status === "REJECTED"
                        ? "Sent back"
                        : q.status}
                  </StatusPill>
                  {/* A rejected question is re-submittable, or the rejection is
                      a dead end rather than a request for changes. */}
                  {(q.status === "DRAFT" || q.status === "REJECTED") &&
                    q.createdBy?.id === me?.id && (
                      <button
                        type="button"
                        disabled={submitAction.isPending(q.id)}
                        onClick={() => void submitForApproval(q)}
                        className="rounded-lg bg-admin px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
                      >
                        {q.status === "REJECTED"
                          ? "Resubmit for approval"
                          : "Send for approval"}
                      </button>
                    )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {rows !== null && rows.length > 0 && (
        <PaginationBar
          offset={offset}
          pageSize={PAGE}
          total={total}
          onOffsetChange={setOffset}
          itemLabel="questions"
          className="mt-4"
        />
      )}

      <QuestionDetailDrawer
        questionId={openId ?? undefined}
        open={openId !== null}
        onClose={() => setOpenId(null)}
      />
      <QuestionAuthorDrawer
        open={authorOpen}
        onClose={() => setAuthorOpen(false)}
        onCreated={() => void load(scope, debouncedSearch.trim(), offset)}
      />
      <QuestionImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(summary) => {
          setNotice(
            `${summary.imported.length} question(s) imported as drafts` +
              (summary.failed.length
                ? `, ${summary.failed.length} row(s) could not be read.`
                : "."),
          );
          void load(scope, debouncedSearch.trim(), offset);
        }}
      />
      <CreateDppModal
        // A fresh key per open so the form mounts blank instead of being
        // reset by an effect after the fact.
        key={dppOpen ? `open-${ticked.size}` : "closed"}
        open={dppOpen}
        questionIds={[...ticked]}
        batches={myBatches ?? []}
        onClose={() => setDppOpen(false)}
        onCreated={() => {
          setNotice(
            "DPP created — students in the assigned batches can attempt it now.",
          );
          setTicked(new Set());
        }}
      />
    </TeacherShell>
  );
}
