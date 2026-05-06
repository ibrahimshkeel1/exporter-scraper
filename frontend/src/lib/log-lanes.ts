export type WorkerLane = "bing" | "duckduckgo" | "yahoo" | "enrichment";

type LanePayload = {
  source?: string;
  lane?: string;
  engine?: string;
  message?: string;
};

function toKey(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function hasToken(value: string, token: string) {
  return value === token || value.includes(token);
}

export function laneFromPayload(payload: LanePayload): WorkerLane {
  const source = toKey(payload.source);
  const lane = toKey(payload.lane);
  const engine = toKey(payload.engine);
  const message = toKey(payload.message);
  const joined = `${source} ${lane} ${engine} ${message}`;

  if (hasToken(joined, "bing")) return "bing";
  if (hasToken(joined, "duckduckgo") || hasToken(joined, "duckduck") || hasToken(joined, "ddg")) return "duckduckgo";
  if (hasToken(joined, "yahoo")) return "yahoo";

  if (source === "enrichment" || source === "scoring") return "enrichment";
  if (source === "discovery" && lane === "main") return "bing";
  return "enrichment";
}
