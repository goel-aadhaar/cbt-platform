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

export function listTenants(search?: string): Promise<{
  items: Tenant[];
  total: number;
}> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/institutes${q}`, { token: token() });
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
    staff: number;
    exams: number;
    questions: number;
    attempts: number;
  };
  last30Days: { attempts: number; newInstitutes: number };
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
