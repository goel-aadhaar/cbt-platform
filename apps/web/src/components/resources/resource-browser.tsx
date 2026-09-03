"use client";

import { useCallback, useEffect, useState } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  ResourcePreview,
  ResourceRow,
} from "@/components/resources/resource-views";
import {
  listResourceChapters,
  listResourceSubjects,
  listResources,
  type ResourceChapter,
  type ResourceItem,
  type ResourceSubject,
  type ResourceType,
} from "@/lib/resources";

/**
 * Subject > Chapter > Resource, shared by both portals.
 *
 * One component because the navigation IS the feature and it is identical for
 * a teacher and a student — the server already decided what each may see, so
 * neither view filters anything itself. Only the per-row actions differ, and
 * those arrive as a render prop.
 *
 * Counts come from the server at every level. Counting client-side would mean
 * fetching the whole library to render "42 resources", and would show a
 * student a number that included material they cannot open.
 */

type Level =
  | { at: "subjects" }
  | { at: "chapters"; subject: ResourceSubject }
  | {
      at: "resources";
      subject: ResourceSubject;
      chapter: ResourceChapter;
    };

export function ResourceBrowser({
  emptyMessage,
  renderActions,
}: {
  emptyMessage: string;
  renderActions?: (item: ResourceItem) => React.ReactNode;
}) {
  const [level, setLevel] = useState<Level>({ at: "subjects" });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ResourceType | "">("");
  const [preview, setPreview] = useState<ResourceItem | null>(null);

  const [subjects, setSubjects] = useState<ResourceSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetched rows remember which request they answer.
   *
   * Navigating deeper has to show a spinner rather than the previous chapter's
   * list, but clearing the state on the way INTO the effect would set state
   * during render and cascade an extra render per keystroke. So staleness is
   * derived instead: a result whose key no longer matches the open level is
   * simply not shown.
   */
  const [chapters, setChapters] = useState<{
    forSubject: string;
    rows: ResourceChapter[];
  } | null>(null);
  const [items, setItems] = useState<{
    forKey: string;
    rows: ResourceItem[];
  } | null>(null);

  // The input stays instant; the QUERY waits for typing to settle. Without
  // this, "kinematics" is ten requests, nine already obsolete on arrival.
  const query = useDebouncedValue(search.trim());

  const searching = query !== "" || typeFilter !== "";
  const openSubjectId = level.at === "subjects" ? null : level.subject.id;
  const itemsKey = searching
    ? `q:${query}:${typeFilter}:${openSubjectId ?? ""}`
    : `c:${openSubjectId ?? ""}:${
        level.at === "resources" ? (level.chapter.id ?? "unfiled") : ""
      }`;

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Could not load resources.");
  }, []);

  // Shelves.
  useEffect(() => {
    let cancelled = false;
    listResourceSubjects()
      .then((r) => !cancelled && setSubjects(r))
      .catch((e) => {
        if (!cancelled) {
          fail(e);
          setSubjects([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fail]);

  // Chapters for the open subject.
  useEffect(() => {
    if (openSubjectId === null) return;
    let cancelled = false;
    listResourceChapters(openSubjectId)
      .then(
        (r) =>
          !cancelled && setChapters({ forSubject: openSubjectId, rows: r }),
      )
      .catch((e) => {
        if (!cancelled) {
          fail(e);
          setChapters({ forSubject: openSubjectId, rows: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [openSubjectId, fail]);

  /**
   * Resources for the open chapter — or, while searching, across everything
   * the caller may see.
   *
   * A search deliberately escapes the hierarchy: someone who types "projectile"
   * wants it found wherever it was filed, not only in the chapter they happen
   * to have open.
   */
  useEffect(() => {
    if (level.at !== "resources" && !searching) return;
    let cancelled = false;
    const q = searching
      ? {
          q: query || undefined,
          type: typeFilter || undefined,
          ...(level.at !== "subjects" ? { subjectId: level.subject.id } : {}),
        }
      : {
          subjectId: (level as Extract<Level, { at: "resources" }>).subject.id,
          ...((level as Extract<Level, { at: "resources" }>).chapter.id
            ? {
                chapterId: (level as Extract<Level, { at: "resources" }>)
                  .chapter.id!,
              }
            : {}),
        };
    listResources(q)
      .then((r) => {
        if (cancelled) return;
        // The Unfiled bucket has no id to filter on, so it is selected here.
        const unfiled =
          level.at === "resources" && level.chapter.id === null && !searching;
        setItems({
          forKey: itemsKey,
          rows: unfiled ? r.filter((x) => x.chapter === null) : r,
        });
      })
      .catch((e) => {
        if (!cancelled) {
          fail(e);
          setItems({ forKey: itemsKey, rows: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [level, query, typeFilter, searching, itemsKey, fail]);

  // Only show rows that answer the level currently open.
  const chapterRows =
    chapters && chapters.forSubject === openSubjectId ? chapters.rows : null;
  const itemRows = items && items.forKey === itemsKey ? items.rows : null;

  return (
    <div>
      {/* Breadcrumbs — every segment navigates, not just the last. */}
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-1 text-sm"
      >
        <Crumb
          label="Resources"
          onClick={() => setLevel({ at: "subjects" })}
          current={level.at === "subjects"}
        />
        {level.at !== "subjects" && (
          <>
            <span aria-hidden className="text-admin-muted">
              /
            </span>
            <Crumb
              label={level.subject.name}
              onClick={() =>
                setLevel({ at: "chapters", subject: level.subject })
              }
              current={level.at === "chapters"}
            />
          </>
        )}
        {level.at === "resources" && (
          <>
            <span aria-hidden className="text-admin-muted">
              /
            </span>
            <Crumb label={level.chapter.name} current />
          </>
        )}
      </nav>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search resources…"
          aria-label="Search resources"
          className="h-10 min-w-0 flex-1 rounded-lg border border-admin-line px-3 text-sm outline-none focus:border-admin"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ResourceType | "")}
          aria-label="Filter by type"
          className="h-10 rounded-lg border border-admin-line px-3 text-sm outline-none focus:border-admin"
        >
          <option value="">All types</option>
          <option value="FILE">Files</option>
          <option value="YOUTUBE">Videos</option>
        </select>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {searching ? (
        <List
          items={itemRows}
          empty="No resources match your search."
          onOpen={setPreview}
          renderActions={renderActions}
        />
      ) : level.at === "subjects" ? (
        <Grid
          loading={subjects === null}
          empty={subjects?.length === 0 ? emptyMessage : null}
        >
          {(subjects ?? []).map((s) => (
            <Tile
              key={s.id}
              title={s.name}
              subtitle={`${s.chapterCount} chapter${s.chapterCount === 1 ? "" : "s"} · ${s.resourceCount} resource${s.resourceCount === 1 ? "" : "s"}`}
              onClick={() => setLevel({ at: "chapters", subject: s })}
            />
          ))}
        </Grid>
      ) : level.at === "chapters" ? (
        <Grid
          loading={chapterRows === null}
          empty={
            chapterRows?.length === 0
              ? "No resources available for this subject yet."
              : null
          }
        >
          {(chapterRows ?? []).map((c) => (
            <Tile
              key={c.id ?? "unfiled"}
              title={c.name}
              subtitle={`${c.resourceCount} resource${c.resourceCount === 1 ? "" : "s"}`}
              onClick={() =>
                setLevel({
                  at: "resources",
                  subject: level.subject,
                  chapter: c,
                })
              }
            />
          ))}
        </Grid>
      ) : (
        <List
          items={itemRows}
          empty="No resources available for this chapter yet."
          onOpen={setPreview}
          renderActions={renderActions}
        />
      )}

      <ResourcePreview item={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function Crumb({
  label,
  onClick,
  current,
}: {
  label: string;
  onClick?: () => void;
  current?: boolean;
}) {
  if (current || !onClick) {
    return (
      <span aria-current="page" className="font-semibold text-admin-ink">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-semibold text-admin hover:underline"
    >
      {label}
    </button>
  );
}

function Grid({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: string | null;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <LoadingSpinner size={28} />
      </div>
    );
  }
  if (empty) {
    return (
      <p className="rounded-xl border border-dashed border-admin-line bg-white p-10 text-center text-sm text-admin-muted">
        {empty}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function Tile({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-admin-line bg-white p-4 text-left transition-colors hover:border-admin/50 hover:bg-admin/[0.03]"
    >
      <span className="block truncate text-base font-bold text-admin-ink">
        {title}
      </span>
      <span className="mt-1 block text-xs text-admin-muted">{subtitle}</span>
    </button>
  );
}

function List({
  items,
  empty,
  onOpen,
  renderActions,
}: {
  items: ResourceItem[] | null;
  empty: string;
  onOpen: (item: ResourceItem) => void;
  renderActions?: (item: ResourceItem) => React.ReactNode;
}) {
  if (items === null) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <LoadingSpinner size={28} />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-admin-line bg-white p-10 text-center text-sm text-admin-muted">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-admin-line bg-white">
      {items.map((item) => (
        <ResourceRow
          key={item.id}
          item={item}
          onOpen={() => onOpen(item)}
          actions={renderActions?.(item)}
        />
      ))}
    </div>
  );
}
