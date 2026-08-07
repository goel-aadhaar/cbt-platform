/**
 * Thin fetch wrapper around the DRSK backend API.
 *
 * Spring Boot analogy: this is our RestTemplate/WebClient — one place that knows
 * the base URL, attaches the bearer token, and normalises error handling so
 * callers just get parsed JSON or a typed ApiError.
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

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, body: Partial<ApiErrorBody> | null) {
    const raw = body?.message;
    const message = Array.isArray(raw)
      ? raw.join(", ")
      : (raw ?? `Request failed (${status})`);
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
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
    // HTTP status. Surface a friendly message rather than a raw TypeError.
    throw new ApiError(0, {
      message: "Cannot reach the server. Check your connection and try again.",
    });
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(res.status, payload as ApiErrorBody | null);
  }

  return payload as T;
}
