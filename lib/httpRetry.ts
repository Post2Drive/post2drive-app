/**
 * Outbound HTTP for provider adapters: a hard timeout on every attempt and
 * exponential backoff with jitter on transient failures.
 *
 * Retries happen only for network errors and for the statuses listed in
 * `retryOn`. Callers must pass statuses that are safe to repeat for that
 * provider (for example 429/503, or any 5xx when an idempotency key is sent).
 * Response bodies are never logged here.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: readonly number[];
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const TRANSIENT_STATUSES: readonly number[] = [429, 502, 503, 504];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  // Full jitter keeps simultaneous retries from re-colliding.
  return Math.floor(ceiling * (0.5 + random() * 0.5));
}

export async function fetchWithRetry(url: string, init: RequestInit = {}, options: RetryOptions = {}): Promise<Response> {
  const {
    timeoutMs = 10_000,
    retries = 2,
    baseDelayMs = 300,
    maxDelayMs = 4_000,
    retryOn = TRANSIENT_STATUSES,
    fetchImpl = fetch as FetchLike,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!retryOn.includes(response.status) || attempt === retries) return response;
      // Drain so the connection can be reused; the body is not inspected.
      await response.arrayBuffer().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await sleep(backoffDelayMs(attempt, baseDelayMs, maxDelayMs, random));
  }
  throw lastError ?? new Error("Request failed.");
}
