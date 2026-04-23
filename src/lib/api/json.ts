import { z } from "zod";

export function json<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export function jsonError(
  message: string,
  status = 400,
  details?: unknown,
): Response {
  return json({ error: message, details }, { status });
}

export async function parseJson<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw jsonError("invalid_json", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw jsonError("validation_error", 422, z.treeifyError(parsed.error));
  }
  return parsed.data;
}
