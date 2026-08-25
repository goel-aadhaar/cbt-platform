/**
 * Superadmin platform client — mirrors `apps/api/src/modules/institutes` and
 * `apps/api/src/modules/platform`. Every route here is SUPERADMIN-only and
 * deliberately crosses tenants; no other role can call them.
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";

function token(): string {
  const t = getToken();
  if (!t) throw new ApiError(401, { message: "Not authenticated" });
  return t;
}

export interface TenantStats {
  students: number;
  exams: number;
  questions: number;
  attempts: number;
  staff: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  /** 4-digit code embedded in every student roll number this tenant issues. */
  code: string;
  isActive: boolean;
  createdAt: string;
  stats: TenantStats;
}

export interface TenantDetail extends Tenant {
  staff: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "TEACHER";
    status: "PENDING" | "ACTIVE" | "DISABLED";
    createdAt: string;
  }[];
  lastActivityAt: string | null;
}

export type TenantSort = "created" | "name" | "students" | "exams" | "attempts";

export interface TenantQuery {
  search?: string;
  status?: "active" | "suspended";
  sort?: TenantSort;
  order?: "asc" | "desc";
}

export function listTenants(query: TenantQuery = {}): Promise<{
  items: Tenant[];
  total: number;
}> {
  const q = new URLSearchParams();
  if (query.search) q.set("search", query.search);
  if (query.status) q.set("status", query.status);
  if (query.sort) q.set("sort", query.sort);
  if (query.order) q.set("order", query.order);
  const qs = q.size ? `?${q}` : "";
  return apiFetch(`/institutes${qs}`, { token: token() });
}

/** What one tenant consumes — storage included, which the list cannot show. */
export interface InstituteUsage {
  institute: {
    id: string;
    name: string;
    slug: string;
    code: string;
    isActive: boolean;
    createdAt: string;
  };
  windowDays: number;
  students: {
    total: number;
    active: number;
    pending: number;
    disabled: number;
  };
  staff: { total: number; admins: number; teachers: number };
  content: { exams: number; examsInWindow: number; questions: number };
  activity: {
    attempts: number;
    attemptsInWindow: number;
    liveAttempts: number;
    lastAttemptAt: string | null;
  };
  storage: { mediaCount: number; mediaBytes: number };
}

export function fetchInstituteUsage(id: string): Promise<InstituteUsage> {
  return apiFetch(`/institutes/${id}/usage`, { token: token() });
}

export function getTenant(id: string): Promise<TenantDetail> {
  return apiFetch(`/institutes/${id}`, { token: token() });
}

export function createTenant(body: {
  name: string;
  slug: string;
}): Promise<Tenant> {
  return apiFetch("/institutes", { method: "POST", body, token: token() });
}

/** Rename, suspend or restore. Suspension blocks every login for the tenant. */
export function updateTenant(
  id: string,
  body: { name?: string; isActive?: boolean },
): Promise<Tenant> {
  return apiFetch(`/institutes/${id}`, {
    method: "PATCH",
    body,
    token: token(),
  });
}

/**
 * Delete a tenant. The API refuses while it still holds records unless `force`
 * is set — callers should surface that refusal rather than retrying with force.
 */
export function deleteTenant(
  id: string,
  force = false,
): Promise<{ id: string; deleted: boolean }> {
  return apiFetch(`/institutes/${id}${force ? "?force=true" : ""}`, {
    method: "DELETE",
    token: token(),
  });
}

export interface InvitedUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: "PENDING" | "ACTIVE" | "DISABLED";
}

/**
 * Invite an institute's first administrator. SUPERADMIN-only — mirrors
 * POST /invitations/admin. Every other invite (teacher, student) is issued by
 * an institute's own admin instead; this is the one door a superadmin has to
 * seed a tenant that otherwise has nobody who can sign in to it.
 */
export function inviteAdmin(body: {
  name: string;
  email: string;
  instituteId: string;
}): Promise<InvitedUser> {
  return apiFetch("/invitations/admin", {
    method: "POST",
    body,
    token: token(),
  });
}

export interface PlatformOverview {
  totals: {
    institutes: number;
    activeInstitutes: number;
    suspendedInstitutes: number;
    students: number;
    activeStudents: number;
    pendingStudents: number;
    disabledStudents: number;
    staff: number;
    exams: number;
    attempts: number;
  };
  last30Days: { attempts: number; newInstitutes: number; exams: number };
  liveExams: number;
  busiestInstitutes: {
    id: string;
    name: string;
    slug: string;
    attempts: number;
  }[];
  growth: { month: string; value: number }[];
}

export function fetchOverview(): Promise<PlatformOverview> {
  return apiFetch("/platform/overview", { token: token() });
}

export interface UsageMetric {
  key: string;
  label: string;
  value: number;
  unit: "bytes" | "count" | "ms" | "percent";
  series: { date: string; value: number }[];
  origin: string;
}

export interface UsageSnapshot {
  source: string;
  note: string;
  metrics: UsageMetric[];
}

export function fetchUsage(days = 30): Promise<UsageSnapshot> {
  return apiFetch(`/platform/usage?days=${days}`, { token: token() });
}

/** Render a metric in its own unit — a byte count and a request count differ. */
export function formatMetric(value: number, unit: UsageMetric["unit"]): string {
  if (unit === "bytes") {
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
    return `${(value / 1024 ** 3).toFixed(2)} GB`;
  }
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "ms") return `${Math.round(value)} ms`;
  return value.toLocaleString();
}

/* ------------------------------------------------------------------ *
 * SYSTEM HEALTH — the machine and this process                        *
 * ------------------------------------------------------------------ */

export interface ApiMetrics {
  windowMinutes: number;
  truncated: boolean;
  since: string | null;
  requests: number;
  requestsPerMinute: number;
  errors: { total: number; client: number; server: number; rate: number };
  responseTime: { p50: number; p95: number; p99: number; max: number } | null;
  byStatusFamily: Record<string, number>;
  processUptimeSeconds: number;
}

export interface SystemHealth {
  host: {
    platform: string;
    release: string;
    hostname: string;
    uptimeSeconds: number;
    cpu: {
      cores: number;
      model: string | null;
      utilisationPercent: number;
      loadAverage: [number, number, number] | null;
    };
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    };
    disk: {
      path: string;
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    } | null;
  };
  process: {
    pid: number;
    nodeVersion: string;
    uptimeSeconds: number;
    memory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number };
  };
  api: ApiMetrics;
}

/** GET /platform/system — SUPERADMIN. */
export function fetchSystemHealth(): Promise<SystemHealth> {
  return apiFetch(`/platform/system`, { token: token() });
}

/** Seconds as "3d 4h" / "2h 15m" / "45s" — uptime is read at a glance. */
export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

/* ------------------------------------------------------------------ *
 * INSTITUTE-SELF — the row for the tenant the caller works in.       *
 *                                                                     *
 * Distinct from `getTenant` (superadmin-only, id-keyed). The actor's *
 * instituteId comes from the JWT, not a path param, so a probe with   *
 * another tenant's id is structurally impossible.                      *
 * ------------------------------------------------------------------ */

export interface MyInstitute {
  id: string;
  name: string;
  slug: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  /**
   * The institute's own logo (§ institute branding), already resolved to a
   * fetchable URL — null means no custom logo, so every surface falls back
   * to the platform default mark.
   */
  logoUrl: string | null;
}

/** GET /institutes/me — the institute this session is bound to. */
export function getMyInstitute(): Promise<MyInstitute> {
  return apiFetch<MyInstitute>("/institutes/me", { token: token() });
}

/** PATCH /institutes/me — rename (and only rename) the caller's institute. */
export function renameMyInstitute(name: string): Promise<MyInstitute> {
  return apiFetch<MyInstitute>("/institutes/me", {
    method: "PATCH",
    body: { name },
    token: token(),
  });
}

/**
 * PATCH /institutes/me — set or clear the institute's logo. `logoKey` is the
 * `key` returned by `uploadMedia()` — upload first, then attach it here.
 * Pass `null` to clear a custom logo and fall back to the default mark.
 * ADMIN-only (enforced server-side).
 */
export function setMyInstituteLogo(
  logoKey: string | null,
): Promise<MyInstitute> {
  return apiFetch<MyInstitute>("/institutes/me", {
    method: "PATCH",
    body: { logoKey },
    token: token(),
  });
}
