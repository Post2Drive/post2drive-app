/**
 * Read a request body as strict UTF-8 while enforcing a byte cap during streaming.
 * The byte cap applies even when Content-Length is absent or the request is chunked.
 */
export type BoundedTextResult =
  | { ok: true; text: string; byteLength: number }
  | { ok: false; status: 400 | 413 };

export async function readBoundedText(request: Request, maxBytes: number): Promise<BoundedTextResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("A positive safe integer maxBytes is required.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\\d+$/.test(declaredLength)) return { ok: false, status: 400 };
    if (Number(declaredLength) > maxBytes) return { ok: false, status: 413 };
  }

  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text, byteLength: totalBytes };
  } catch {
    return { ok: false, status: 400 };
  }
}

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

export async function readBoundedJson(request: Request, maxBytes: number): Promise<BoundedJsonResult> {
  const bounded = await readBoundedText(request, maxBytes);
  if (!bounded.ok) return { ok: false, status: bounded.status };

  try {
    return { ok: true, value: JSON.parse(bounded.text) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}
