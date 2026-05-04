import { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no"
};

function getWorkerBaseUrl() {
  const rawUrl = process.env.WORKER_API_URL || process.env.NEXT_PUBLIC_WORKER_URL || "";
  return rawUrl.replace(/\/+$/, "");
}

function sseMessage(message: string) {
  return new Response(`data: ${JSON.stringify({ message, source: "system" })}\n\n`, {
    status: 200,
    headers: SSE_HEADERS
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const workerBaseUrl = getWorkerBaseUrl();

  if (!workerBaseUrl) {
    return sseMessage("WORKER_API_URL is not configured on the frontend deployment.");
  }

  const workerSecret = process.env.WORKER_API_SECRET || process.env.N8N_WEBHOOK_SECRET;
  const workerLogsUrl = `${workerBaseUrl}/api/logs/${encodeURIComponent(id)}`;

  let workerResponse: Response;
  try {
    workerResponse = await fetch(workerLogsUrl, {
      headers: {
        Accept: "text/event-stream",
        ...(workerSecret ? { "x-exportflow-secret": workerSecret } : {})
      },
      cache: "no-store",
      signal: request.signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return sseMessage(`Could not reach worker log stream at ${workerBaseUrl}: ${message}`);
  }

  if (!workerResponse.ok || !workerResponse.body) {
    const body = await workerResponse.text().catch(() => "");
    const detail = body ? `: ${body.slice(0, 300)}` : "";
    return sseMessage(`Worker log stream returned HTTP ${workerResponse.status}${detail}.`);
  }

  return new Response(workerResponse.body, {
    status: 200,
    headers: SSE_HEADERS
  });
}
