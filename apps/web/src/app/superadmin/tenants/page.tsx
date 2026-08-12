"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PlusIcon, SearchIcon } from "@/components/admin/icons";
import { Panel, StatusPill } from "@/components/staff/charts";
import { SuperadminShell } from "@/components/staff/superadmin-shell";
import { ApiError } from "@/lib/api";
import {
  createTenant,
  deleteTenant,
  listTenants,
  updateTenant,
  type Tenant,
} from "@/lib/platform";

export default function TenantsPage() {
  return (
    <Suspense fallback={null}>
      <TenantsScreen />
    </Suspense>
  );
}

function TenantsScreen() {
  const params = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(params.get("new") === "1");
  /** id of the tenant currently being mutated, so only its row shows a spinner */
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    try {
      const res = await listTenants(term || undefined);
      setTenants(res.items);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load institutes");
      setTenants([]);
    }
  }, []);

  // Debounced search doubles as the initial load: the first run fires with an
  // empty term, so there is no separate mount effect to keep in step.
  useEffect(() => {
    const id = setTimeout(() => void load(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search, load]);

  async function toggleActive(t: Tenant) {
    setBusy(t.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateTenant(t.id, { isActive: !t.isActive });
      setTenants((prev) =>
        (prev ?? []).map((x) => (x.id === t.id ? { ...x, ...updated } : x)),
      );
      setNotice(
        updated.isActive
          ? `${updated.name} restored — its users can sign in again.`
          : `${updated.name} suspended — nobody in it can sign in.`,
      );
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not update the institute",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: Tenant, force: boolean) {
    setBusy(t.id);
    setError(null);
    setNotice(null);
    try {
      await deleteTenant(t.id, force);
      setTenants((prev) => (prev ?? []).filter((x) => x.id !== t.id));
      setNotice(`${t.name} deleted.`);
    } catch (e: unknown) {
      // The API refuses to delete a populated tenant. Surface that refusal
      // rather than quietly retrying with force — it is not reversible.
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not delete the institute",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <SuperadminShell title="Institutes">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex max-w-sm flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="h-11 w-full rounded-full border border-admin-line bg-white pl-10 pr-4 text-sm outline-none focus:border-admin"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-full bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" />
          New institute
        </button>
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
        title={tenants ? `${tenants.length} institutes` : "Institutes"}
        subtitle="Every tenant on the platform, with what it holds"
      >
        {tenants === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-admin-line/15"
              />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
            No institutes match that search.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-admin-line text-xs font-bold uppercase tracking-wide text-admin-muted">
                  <th className="px-3 py-3">Institute</th>
                  <th className="px-3 py-3">Students</th>
                  <th className="px-3 py-3">Exams</th>
                  <th className="px-3 py-3">Questions</th>
                  <th className="px-3 py-3">Attempts</th>
                  <th className="px-3 py-3">Staff</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    className={`border-b border-admin-line/50 ${busy === t.id ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-4">
                      <p className="font-bold text-admin-ink">{t.name}</p>
                      <p className="text-xs text-admin-muted">
                        {t.slug} · since{" "}
                        {new Date(t.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </td>
                    <td className="px-3 py-4">{t.stats.students}</td>
                    <td className="px-3 py-4">{t.stats.exams}</td>
                    <td className="px-3 py-4">{t.stats.questions}</td>
                    <td className="px-3 py-4">{t.stats.attempts}</td>
                    <td className="px-3 py-4">{t.stats.staff}</td>
                    <td className="px-3 py-4">
                      <StatusPill tone={t.isActive ? "good" : "bad"}>
                        {t.isActive ? "Active" : "Suspended"}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy === t.id}
                          onClick={() => void toggleActive(t)}
                          className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                        >
                          {t.isActive ? "Suspend" : "Restore"}
                        </button>
                        <button
                          type="button"
                          disabled={busy === t.id}
                          onClick={() => void remove(t, false)}
                          className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/5 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {creating && (
        <CreateTenantModal
          onClose={() => setCreating(false)}
          onCreated={(t) => {
            setTenants((prev) => [t, ...(prev ?? [])]);
            setNotice(`${t.name} created. Invite its administrator next.`);
            setCreating(false);
          }}
        />
      )}
    </SuperadminShell>
  );
}

function CreateTenantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: Tenant) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The slug is what candidates type at login, so it is derived from the name
  // until someone deliberately edits it.
  const effectiveSlug = touchedSlug ? slug : slugify(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createTenant({
        name: name.trim(),
        slug: effectiveSlug,
      });
      onCreated(created);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not create the institute",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-admin-ink">New institute</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Creates an empty tenant. Its administrator is invited separately.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="DRSK Academy"
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Institute code
            </span>
            <input
              value={effectiveSlug}
              onChange={(e) => {
                setTouchedSlug(true);
                setSlug(slugify(e.target.value));
              }}
              required
              placeholder="drsk-academy"
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
            <span className="text-xs text-admin-muted">
              Candidates type this at sign-in. It cannot be changed later.
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-admin-line px-4 py-2 text-sm font-bold text-admin-ink hover:bg-admin-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !effectiveSlug}
              className="rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create institute"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
