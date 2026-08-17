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
  /** The role this session is acting as; null until one has been chosen. */
  role: Role | null;
  /** Every role the account holds — what a switcher could offer. */
  roles: Role[];
  instituteId: string | null;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
  /**
   * Roles valid for the door just used. More than one means the user must be
   * asked; the session can do nothing until `selectRole` is called.
   */
  selectableRoles: Role[];
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
 * What a non-student login returns instead of a session: the password was
 * accepted, but a mailed code is still required. No token exists yet.
 */
export interface OtpChallenge {
  otpRequired: true;
  challengeId: string;
  expiresAt: string;
  /** Masked address, e.g. `pr•••@school.edu`. */
  sentTo: string;
}

/**
 * POST /auth/login — institute staff (administrator or teacher) by email.
 *
 * Step 1 of 2. A correct password does not sign you in: it emails a one-time
 * code and returns a challenge to redeem with `verifyLoginOtp`. The caller
 * never says which role they are — the server decides from the account.
 * Platform accounts are refused here and must use `platformLogin`.
 */
export function staffLogin(input: StaffLoginInput): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>("/auth/login", {
    method: "POST",
    body: input,
  });
}

/** POST /auth/platform/login — platform owner only. Also step 1 of 2. */
export function platformLogin(input: StaffLoginInput): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>("/auth/platform/login", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /auth/login/verify — step 2 for staff and platform alike.
 *
 * Redeems the emailed code for a real session. Which roles the session may
 * act as is decided by the challenge (i.e. the door used in step 1), not by
 * anything sent here.
 */
export async function verifyLoginOtp(
  challengeId: string,
  code: string,
): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>("/auth/login/verify", {
    method: "POST",
    body: { challengeId, code },
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

/**
 * Cached snapshot of the stored user. Safe to call every render — including
 * during a "use client" page's server-side prerender pass, where `window`
 * does not exist yet. That pass always sees `null` (there is no session to
 * read on the server); the real value appears after hydration.
 */
export function getUserSnapshot(): AuthUser | null {
  if (typeof window === "undefined") return null;
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

/**
 * POST /auth/session/role — commit this session to one of the user's roles.
 *
 * The server validates the pick against the account's own roles, so this is a
 * request, not an assertion: naming a role the account does not hold is
 * refused. Authorization for every later call is decided from the stored
 * choice, never from anything the browser remembers.
 */
export async function selectRole(role: Role): Promise<Role> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  const result = await apiFetch<{ role: Role }>("/auth/session/role", {
    method: "POST",
    body: { role },
    token,
  });
  // Reflect the committed role locally so the shells route correctly.
  const current = getUserSnapshot();
  if (current) {
    window.localStorage.setItem(
      USER_KEY,
      JSON.stringify({ ...current, role: result.role }),
    );
    notify();
  }
  return result.role;
}

/**
 * POST /auth/session/switch — change the role this session is acting as
 * without re-authenticating. Same validation as selectRole (the pick is
 * checked against the account's own roles), so the browser cannot grant
 * itself a role it does not hold.
 */
export async function switchRole(role: Role): Promise<Role> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  const result = await apiFetch<{ role: Role }>("/auth/session/switch", {
    method: "POST",
    body: { role },
    token,
  });
  const current = getUserSnapshot();
  if (current) {
    window.localStorage.setItem(
      USER_KEY,
      JSON.stringify({ ...current, role: result.role }),
    );
    notify();
  }
  return result.role;
}
