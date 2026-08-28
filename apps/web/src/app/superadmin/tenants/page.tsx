"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  BarChartIcon,
  PlusIcon,
  SearchIcon,
  UserPlusIcon,
} from "@/components/admin/icons";
import { useKeyedAsyncAction } from "@/hooks/use-async-action";
import { Panel, StatusPill } from "@/components/staff/charts";
import { InstituteUsageModal } from "@/components/superadmin/institute-usage-modal";
import { SuperadminShell } from "@/components/staff/superadmin-shell";
import {
  createTenant,
  deleteTenant,
  inviteAdmin,
  listTenants,
  type TenantQuery,
  type TenantSort,
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
  const [invitingFor, setInvitingFor] = useState<Tenant | null>(null);
  const [usageFor, setUsageFor] = useState<Tenant | null>(null);
  /**
   * Filter and sort live in state, not in the URL. They are a way of reading
   * one screen rather than a place to link someone to, and the search term
   * beside them is already ephemeral.
   */
  const [status, setStatus] = useState<"" | "active" | "suspended">("");
  const [sort, setSort] = useState<TenantSort>("created");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const load = useCallback(
    async (term: string, query: Omit<TenantQuery, "search">) => {
      try {
        // Sorted and filtered on the server so the order is over every tenant,
        // not just the ones a client-side pass happens to be holding.
        const res = await listTenants({ search: term || undefined, ...query });
        setTenants(res.items);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load institutes");
        setTenants([]);
      }
    },
    [],
  );

  // Debounced search doubles as the initial load: the first run fires with an
  // empty term, so there is no separate mount effect to keep in step. Changing
  // a filter re-runs it through the same path.
  useEffect(() => {
    const id = setTimeout(
      () =>
        void load(search.trim(), {
          status: status || undefined,
          sort,
          order,
        }),
      300,
    );
    return () => clearTimeout(id);
  }, [search, status, sort, order, load]);

  const reload = () =>
    load(search.trim(), { status: status || undefined, sort, order });

  /**
   * One lock per institute, shared by both actions.
   *
   * The single-slot `busy` id it replaced was released by whichever action
   * finished first, so starting a second row re-enabled the first row's buttons
   * while its request was still running — and on this screen those buttons
   * suspend and delete whole tenants.
   */
  const rowAction = useKeyedAsyncAction(
    async (_id: string, work: () => Promise<void>) => work(),
    {
      onError: (_id, message) => setError(message),
      fallbackMessage: "That did not complete. Try again.",
    },
  );

  function start(t: Tenant, work: () => Promise<void>) {
    setError(null);
    setNotice(null);
    void rowAction.run(t.id, work);
  }

  function toggleActive(t: Tenant) {
    start(t, async () => {
      const updated = await updateTenant(t.id, { isActive: !t.isActive });
      setTenants((prev) =>
        (prev ?? []).map((x) => (x.id === t.id ? { ...x, ...updated } : x)),
      );
      setNotice(
        updated.isActive
          ? `${updated.name} restored — its users can sign in again.`
          : `${updated.name} suspended — nobody in it can sign in.`,
      );
    });
  }

  function remove(t: Tenant, force: boolean) {
    start(t, async () => {
      // The API refuses to delete a populated tenant; that refusal surfaces
      // through the shared error path rather than being retried with force,
      // which is not reversible.
      await deleteTenant(t.id, force);
      setTenants((prev) => (prev ?? []).filter((x) => x.id !== t.id));
      setNotice(`${t.name} deleted.`);
    });
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

        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "" | "active" | "suspended")
          }
          aria-label="Filter by status"
          className="h-11 rounded-full border border-admin-line bg-white px-4 text-sm text-admin-ink outline-none focus:border-admin"
        >
          <option value="">All statuses</option>
          <option value="active">Active only</option>
          <option value="suspended">Suspended only</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as TenantSort)}
          aria-label="Sort by"
          className="h-11 rounded-full border border-admin-line bg-white px-4 text-sm text-admin-ink outline-none focus:border-admin"
        >
          <option value="created">Newest first</option>
          <option value="name">Name</option>
          <option value="students">Students</option>
          <option value="exams">Exams</option>
          <option value="attempts">Attempts</option>
        </select>

        {/* One button rather than a second dropdown: direction only ever has
            two values, and the arrow says which one is active. */}
        <button
          type="button"
          onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
          aria-label={
            order === "asc" ? "Sorted ascending" : "Sorted descending"
          }
          title={
            order === "asc"
              ? "Ascending — click for descending"
              : "Descending — click for ascending"
          }
          className="flex h-11 items-center gap-1.5 rounded-full border border-admin-line bg-white px-4 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
        >
          {order === "asc" ? "↑" : "↓"}
          <span className="text-admin-muted">
            {order === "asc" ? "Asc" : "Desc"}
          </span>
        </button>

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
                    className={`border-b border-admin-line/50 ${rowAction.isPending(t.id) ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-4">
                      <p className="font-bold text-admin-ink">{t.name}</p>
                      <p className="text-xs text-admin-muted">
                        {t.slug} · code{" "}
                        <span
                          className="font-mono"
                          title="Embedded in every student roll number this institute issues"
                        >
                          {t.code}
                        </span>{" "}
                        · since{" "}
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
                          onClick={() => setUsageFor(t)}
                          className="flex items-center gap-1.5 rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg"
                        >
                          <BarChartIcon className="size-3.5" />
                          Usage
                        </button>
                        <button
                          type="button"
                          disabled={rowAction.isPending(t.id)}
                          onClick={() => setInvitingFor(t)}
                          className="flex items-center gap-1.5 rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                        >
                          <UserPlusIcon className="size-3.5" />
                          Invite admin
                        </button>
                        <button
                          type="button"
                          disabled={rowAction.isPending(t.id)}
                          onClick={() => void toggleActive(t)}
                          className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                        >
                          {t.isActive ? "Suspend" : "Restore"}
                        </button>
                        <button
                          type="button"
                          disabled={rowAction.isPending(t.id)}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete ${t.name}? This cannot be undone — the institute must already be empty (no students, staff, or exams) for this to succeed.`,
                              )
                            ) {
                              void remove(t, false);
                            }
                          }}
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
            // Refetched rather than prepended: with a sort applied, the top of
            // the list is not where a new tenant belongs, and putting it there
            // makes the ordering look broken.
            void reload();
            setCreating(false);
            // Chain straight into the invite step — an institute with nobody
            // who can sign in to it isn't actually usable yet.
            setInvitingFor(t);
          }}
        />
      )}

      <InstituteUsageModal
        instituteId={usageFor?.id ?? null}
        instituteName={usageFor?.name}
        onClose={() => setUsageFor(null)}
      />

      {invitingFor && (
        <InviteAdminModal
          tenant={invitingFor}
          onClose={() => setInvitingFor(null)}
          onInvited={(name) => {
            setNotice(
              `${name} invited as administrator of ${invitingFor.name}. ` +
                "Email sending isn't configured, so the accept-invite link is printed to the API's server console instead — copy it from there.",
            );
            setInvitingFor(null);
            // The tenant row's staff count is stale until this reloads it.
            void reload();
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
              placeholder="Sunrise Academy"
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
              placeholder="sunrise-academy"
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

/**
 * Invite an institute's first administrator. The one invite door a
 * superadmin uses directly — every other invite (teacher, student) is issued
 * by the institute's own admin instead.
 */
function InviteAdminModal({
  tenant,
  onClose,
  onInvited,
}: {
  tenant: Tenant;
  onClose: () => void;
  onInvited: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await inviteAdmin({
        name: name.trim(),
        email: email.trim(),
        instituteId: tenant.id,
      });
      onInvited(name.trim());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not send the invite.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-admin-ink">
          Invite administrator
        </h2>
        <p className="mt-1 text-sm text-admin-muted">
          For{" "}
          <span className="font-semibold text-admin-ink">{tenant.name}</span>.
          They receive a link to set their own password and sign in.
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
              placeholder="Priya Sharma"
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="priya@institute.edu"
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
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
              disabled={saving || !name.trim() || !email.trim()}
              className="rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Sending…" : "Send invite"}
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
