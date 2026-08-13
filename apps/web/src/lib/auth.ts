/**
 * Auth helpers for the student portal — login call + client-side session store.
 *
 * The backend issues a short-lived RS256 access token backed by a stateful
 * session row. For the browser we keep it in localStorage keyed per app; a
 * production hardening pass can move this to an httpOnly cookie via a Next route
 * handler, but the token contract stays the same.
 */

import { ApiError, apiFetch } from "./api";

export type Role = "SUPERADMIN" | "ADMIN" | "TEACHER" | "STUDENT";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  instituteId: string | null;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

export interface StudentLoginInput {
  /** Institute code / slug — identifies the tenant. */
  instituteSlug: string;
  /** Candidate ID / roll number — unique within an institute. */
  rollNumber: string;
  password: string;
}

const TOKEN_KEY = "drsk.accessToken";
const USER_KEY = "drsk.user";

export interface MeResponse extends AuthUser {
  status: "PENDING" | "ACTIVE" | "DISABLED";
}

/** POST /auth/student/login — authenticates a candidate by institute + roll. */
export async function studentLogin(
  input: StudentLoginInput,
): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>("/auth/student/login", {
    method: "POST",
    body: input,
  });
  saveSession(result);
  return result;
}

export interface StaffLoginInput {
  email: string;
  password: string;
}

/**
 * POST /auth/login — institute staff (administrator or teacher) by email.
 *
 * The caller does not say which role they are: the server decides from the
 * account and returns it. Platform accounts are refused here and must use
 * `platformLogin`.
 */
export async function staffLogin(input: StaffLoginInput): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>("/auth/login", {
    method: "POST",
    body: input,
  });
  saveSession(result);
  return result;
}

/**
 * POST /auth/google — staff sign-in with a Google credential.
 *
 * The credential is only an assertion of identity; the server verifies it and
 * looks up the role and institute from the existing account. Nothing is
 * provisioned by signing in.
 */
export async function googleLogin(credential: string): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>("/auth/google", {
    method: "POST",
    body: { credential },
  });
  saveSession(result);
  return result;
}

/** POST /auth/platform/login — platform owner only, on its own endpoint. */
export async function platformLogin(
  input: StaffLoginInput,
): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>("/auth/platform/login", {
    method: "POST",
    body: input,
  });
  saveSession(result);
  return result;
}

/**
 * GET /auth/me — validates the stored session against the server and returns the
 * canonical user. Throws ApiError(401) if the token is missing/expired/revoked.
 */
export async function fetchMe(): Promise<MeResponse> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<MeResponse>("/auth/me", { token });
}

/** POST /auth/logout — revokes the server session, then clears local state. */
export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await apiFetch("/auth/logout", { method: "POST", token });
    } catch {
      // Even if the server call fails, drop local credentials below.
    }
  }
  clearSession();
}

export function saveSession(result: LoginResult): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, result.accessToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  notify();
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  return getUserSnapshot();
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  notify();
}

/* ------------------------------------------------------------------ *
 * External-store plumbing for React's useSyncExternalStore.
 * getUserSnapshot() MUST return a stable reference while the stored JSON is
 * unchanged (parsing on every call would loop the store), so we cache by the
 * raw string. saveSession/clearSession notify subscribers in this tab; the
 * native "storage" event covers other tabs.
 * ------------------------------------------------------------------ */

let cachedRaw: string | null = null;
let cachedUser: AuthUser | null = null;

/** Cached snapshot of the stored user. Safe to call every render. */
export function getUserSnapshot(): AuthUser | null {
  const raw = window.localStorage.getItem(USER_KEY);
  if (raw === cachedRaw) return cachedUser;
  cachedRaw = raw;
  try {
    cachedUser = raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

/** Subscribe to session changes (this tab via notify(), other tabs via event). */
export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/* ------------------------------------------------------------------ *
 * PROFILE — the signed-in user's own record                           *
 * ------------------------------------------------------------------ */

export interface MyProfile extends AuthUser {
  phone: string | null;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  createdAt: string;
  institute: { name: string; slug: string } | null;
  /** Candidate details; null for staff. */
  student: {
    rollNumber: string;
    batch: string;
    class: string;
    program: string;
    enrolledAt: string;
  } | null;
}

/** GET /auth/me/profile — identity plus, for a candidate, their enrolment. */
export function fetchMyProfile(): Promise<MyProfile> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<MyProfile>("/auth/me/profile", { token });
}

/**
 * PATCH /auth/me/profile — the fields a user owns.
 *
 * Email and roll number are not editable here: one is a login identifier
 * needing verification, the other identifies a candidate in an examination
 * record and belongs to the administrator.
 */
export async function updateMyProfile(body: {
  name?: string;
  phone?: string;
}): Promise<MyProfile> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  const updated = await apiFetch<MyProfile>("/auth/me/profile", {
    method: "PATCH",
    body,
    token,
  });
  // Keep the cached session in step so the sidebar name updates immediately.
  const current = getUserSnapshot();
  if (current) {
    window.localStorage.setItem(
      USER_KEY,
      JSON.stringify({ ...current, name: updated.name }),
    );
    notify();
  }
  return updated;
}

/** POST /auth/me/password — requires the current password. */
export function changeMyPassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ changed: boolean }> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch("/auth/me/password", { method: "POST", body, token });
}
