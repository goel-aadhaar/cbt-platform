/**
 * Thin fetch wrapper around the DRSK backend API.
 *
 * Spring Boot analogy: this is our RestTemplate/WebClient — one place that knows
 * the base URL, attaches the bearer token, and normalises error handling so
 * callers just get parsed JSON or a typed ApiError.
 *
 * Error messages are built to say what actually went wrong. A generic
 * "Request failed (404)" tells a candidate nothing and tells whoever is on
 * support even less, so every failure is turned into a sentence naming the
 * cause — and, where the cause is a misconfiguration rather than the user,
 * saying so plainly instead of blaming their credentials.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

/** Shape the NestJS AllExceptionsFilter returns on error responses. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** Some domain errors attach a machine-readable code + details. */
  code?: string;
  details?: unknown;
}

/** Sentinel status for a request that never reached the server. */
export const NETWORK_ERROR = 0;

/**
 * Plain-language fallbacks, used only when the server sent no message of its
 * own. Deliberately specific about WHO can fix it.
 */
function fallbackMessage(status: number, path: string): string {
  switch (status) {
    case NETWORK_ERROR:
      return `Cannot reach the server at ${BASE_URL}. It may be down, or your connection dropped.`;
    case 400:
      return "The server rejected that request as invalid.";
    case 401:
      return "Your session has expired or is no longer valid. Please sign in again.";
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return `Not found: ${path}`;
    case 408:
      return "The server took too long to respond. Try again.";
    case 409:
      return "That conflicts with something that already exists.";
    case 413:
      return "That upload is too large.";
    case 422:
      return "The server could not process those values.";
    case 429:
      return "Too many requests. Wait a moment and try again.";
    case 500:
      return "The server hit an unexpected error. Try again shortly.";
    case 502:
    case 503:
    case 504:
      return "The server is temporarily unavailable. Try again shortly.";
    default:
      return `The server responded with an unexpected status (${status}).`;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  /** API path that failed — included so support can act on the message. */
  readonly path?: string;

  constructor(status: number, body: Partial<ApiErrorBody> | null, path = "") {
    const raw = body?.message;
    const fromServer = Array.isArray(raw)
      ? // NestJS returns an array for validation failures; each entry is a
        // complete sentence fragment, so read them as a list.
        raw.filter(Boolean).join(". ")
      : typeof raw === "string" && raw.trim() !== ""
        ? raw
        : null;

    super(fromServer ?? fallbackMessage(status, path));
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
    this.path = path;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON-serialisable body; sets Content-Type automatically. */
  body?: unknown;
  /** Bearer token to attach for authenticated calls. */
  token?: string;
}

export async function apiFetch<T>(
  path: string,
  { body, token, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const finalHeaders = new Headers(headers);
  if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network-level failure (server down, CORS, DNS) — fetch rejects with no
    // HTTP status.
    throw new ApiError(NETWORK_ERROR, null, path);
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    /**
     * A non-JSON error means we did NOT reach the API — something else
     * answered (a dev server, a proxy, a login wall). The usual cause is
     * NEXT_PUBLIC_API_URL pointing somewhere that isn't the API, and telling
     * the user "invalid credentials" for that would be a lie.
     */
    if (!isJson) {
      throw new ApiError(
        res.status,
        {
          message:
            `The API did not answer at ${BASE_URL}${path} (HTTP ${res.status}). ` +
            `Something other than the API is serving that address — check that the API is running and that NEXT_PUBLIC_API_URL points at it.`,
        },
        path,
      );
    }
    throw new ApiError(res.status, payload as ApiErrorBody | null, path);
  }

  return payload as T;
}
