import fs from "fs";
import path from "path";

import { createAdminSupabase } from "./supabase-admin";

export type SpecialistConfigMeta = {
  slug: string;
  display_name: string;
  version: number;
  quality_tier: string;
  trigger_keywords: string[];
  keyword_count: number;
};

export type TuningHistoryContext = {
  scenario?: string;
  refinedIndustry?: string;
  region?: string;
  searchTerms?: string;
  testLimit?: number;
  maxAnalyzed?: number;
  jobSummary?: string;
  auditSummary?: string;
};

export type TuningHistoryEntry = {
  id: string;
  type: "analysis" | "applied" | "test_run" | "critic" | "saved" | "created";
  timestamp: number;
  message: string;
  context?: TuningHistoryContext;
  jobId?: string;
  score?: number;
  approved?: boolean;
  tier?: string;
  verdict?: string;
  warnings?: string[];
};

type ConfigManifestEntry = {
  yaml: string;
  updated_at?: string;
  version?: number;
};

type ConfigManifest = {
  _format?: string;
  configs: Record<string, ConfigManifestEntry | string>;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const CONFIG_BUCKET = process.env.EXPORTFLOW_CONFIG_BUCKET || "specialist-configs";
const CONFIG_MANIFEST_PATH = process.env.EXPORTFLOW_CONFIG_MANIFEST || "index.json";
const TUNING_HISTORY_LIMIT = 100;

const LOCAL_CONFIG_CANDIDATES = [
  process.env.EXPORTFLOW_CONFIG_DIR,
  process.env.EXPORTFLOW_CONFIG_ROOT ? path.join(process.env.EXPORTFLOW_CONFIG_ROOT, "scraper", "configs") : "",
  path.resolve(process.cwd(), "scraper", "configs"),
  path.resolve(process.cwd(), "..", "scraper", "configs"),
  path.resolve(process.cwd(), "..", "configs"),
  "/srv/exportflow/scraper/configs",
  "/var/scraper/scraper/configs",
  "/var/scraper/configs",
]
  .map((value) => String(value || "").trim())
  .filter(Boolean);

export function assertSafeConfigSlug(slug: string) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new Error("Config slug must use lowercase letters, numbers, and hyphens.");
  }
  return normalized;
}

function getLocalConfigDir() {
  for (const candidate of LOCAL_CONFIG_CANDIDATES) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

function extractString(yaml: string, key: string, fallback: string) {
  const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return fallback;
  return match[1].trim().replace(/^["']|["']$/g, "") || fallback;
}

function extractNumber(yaml: string, key: string, fallback: number) {
  const value = Number(extractString(yaml, key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function extractTriggerKeywords(yaml: string) {
  const triggers = yaml.match(/triggers:\s*\n([\s\S]*?)(?=\n\S|$)/)?.[1] || "";
  const keywords = triggers.match(/keywords:\s*\n([\s\S]*?)(?=\n\s{0,2}\S|$)/)?.[1] || "";
  return keywords
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function manifestEntryYaml(entry: ConfigManifestEntry | string | undefined) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return String(entry.yaml || "");
}

function tuningHistoryPath(slug: string) {
  return `tuning-history/${slug}.json`;
}

function normalizeManifest(raw: unknown): ConfigManifest {
  const manifest: ConfigManifest = { _format: "specialist-config-manifest-v1", configs: {} };
  if (!raw || typeof raw !== "object") {
    return manifest;
  }

  const payload = raw as Record<string, unknown>;
  const configs = payload.configs && typeof payload.configs === "object" && !Array.isArray(payload.configs)
    ? (payload.configs as Record<string, unknown>)
    : payload;

  for (const [slug, value] of Object.entries(configs)) {
    if (slug.startsWith("_")) continue;

    if (typeof value === "string") {
      manifest.configs[slug] = { yaml: value };
      continue;
    }

    if (value && typeof value === "object") {
      const entry = value as Record<string, unknown>;
      const yaml = String(entry.yaml || entry.content || "");
      if (!yaml) continue;

      manifest.configs[slug] = {
        yaml,
        updated_at: typeof entry.updated_at === "string" ? entry.updated_at : undefined,
        version: typeof entry.version === "number" ? entry.version : undefined,
      };
    }
  }

  return manifest;
}

function loadLocalManifest(): ConfigManifest | null {
  const dir = getLocalConfigDir();
  if (!dir) return null;

  const configs: Record<string, ConfigManifestEntry> = {};
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".yml")).sort()) {
    const slug = file.replace(/\.yml$/, "");
    const yaml = fs.readFileSync(path.join(dir, file), "utf-8");
    configs[slug] = { yaml };
  }

  if (Object.keys(configs).length === 0) {
    return null;
  }

  return {
    _format: "specialist-config-manifest-v1",
    configs,
  };
}

async function ensureConfigBucket() {
  const supabase = createAdminSupabase();
  const { error: createError } = await supabase.storage.createBucket(CONFIG_BUCKET, { public: true });

  if (createError) {
    const message = createError.message.toLowerCase();
    if (!message.includes("exist")) {
      throw createError;
    }

    const { error: updateError } = await supabase.storage.updateBucket(CONFIG_BUCKET, { public: true });
    if (updateError) {
      throw updateError;
    }
  }

  return supabase;
}

async function loadRemoteManifest(): Promise<ConfigManifest | null> {
  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase.storage.from(CONFIG_BUCKET).download(CONFIG_MANIFEST_PATH);
    if (error || !data) {
      return null;
    }

    const text = await data.text();
    if (!text.trim()) {
      return null;
    }

    return normalizeManifest(JSON.parse(text));
  } catch {
    return null;
  }
}

async function saveManifest(manifest: ConfigManifest) {
  const supabase = await ensureConfigBucket();
  const payload = JSON.stringify(normalizeManifest(manifest), null, 2);
  const { error } = await supabase.storage.from(CONFIG_BUCKET).upload(
    CONFIG_MANIFEST_PATH,
    Buffer.from(payload, "utf-8"),
    {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    },
  );

  if (error) {
    throw error;
  }
}

function normalizeTuningHistoryEntry(value: unknown): TuningHistoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entry = value as Record<string, unknown>;
  const type = String(entry.type || "");
  if (!["analysis", "applied", "test_run", "critic", "saved", "created"].includes(type)) {
    return null;
  }

  const context = entry.context && typeof entry.context === "object" && !Array.isArray(entry.context)
    ? entry.context as Record<string, unknown>
    : {};

  return {
    id: String(entry.id || `${type}-${Date.now()}`),
    type: type as TuningHistoryEntry["type"],
    timestamp: Number(entry.timestamp || Date.now()),
    message: String(entry.message || ""),
    context: {
      scenario: typeof context.scenario === "string" ? context.scenario : undefined,
      refinedIndustry: typeof context.refinedIndustry === "string" ? context.refinedIndustry : undefined,
      region: typeof context.region === "string" ? context.region : undefined,
      searchTerms: typeof context.searchTerms === "string" ? context.searchTerms : undefined,
      testLimit: typeof context.testLimit === "number" ? context.testLimit : undefined,
      maxAnalyzed: typeof context.maxAnalyzed === "number" ? context.maxAnalyzed : undefined,
      jobSummary: typeof context.jobSummary === "string" ? context.jobSummary : undefined,
      auditSummary: typeof context.auditSummary === "string" ? context.auditSummary : undefined,
    },
    jobId: typeof entry.jobId === "string" ? entry.jobId : undefined,
    score: typeof entry.score === "number" ? entry.score : undefined,
    approved: typeof entry.approved === "boolean" ? entry.approved : undefined,
    tier: typeof entry.tier === "string" ? entry.tier : undefined,
    verdict: typeof entry.verdict === "string" ? entry.verdict : undefined,
    warnings: Array.isArray(entry.warnings) ? entry.warnings.map(String).slice(0, 8) : undefined,
  };
}

function normalizeTuningHistory(raw: unknown): TuningHistoryEntry[] {
  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).history)
      ? (raw as Record<string, unknown>).history as unknown[]
      : [];

  const normalizedEntries = entries
    .map(normalizeTuningHistoryEntry)
    .filter((entry): entry is TuningHistoryEntry => Boolean(entry));

  return normalizedEntries
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-TUNING_HISTORY_LIMIT);
}

async function loadManifest() {
  const remoteManifest = await loadRemoteManifest();
  if (remoteManifest) {
    return remoteManifest;
  }

  const localManifest = loadLocalManifest();
  if (localManifest) {
    try {
      await saveManifest(localManifest);
    } catch {
      // Local-only development still works if storage is unreachable.
    }
    return localManifest;
  }

  throw new Error(
    `Config store not found. Checked Supabase bucket ${CONFIG_BUCKET}/${CONFIG_MANIFEST_PATH} and local dirs: ${LOCAL_CONFIG_CANDIDATES.join(", ")}`
  );
}

function configMetaFromYaml(slug: string, yaml: string): SpecialistConfigMeta {
  const triggerKeywords = extractTriggerKeywords(yaml);
  return {
    slug,
    display_name: extractString(yaml, "display_name", slug),
    version: extractNumber(yaml, "version", 1),
    quality_tier: extractString(yaml, "quality_tier", "unknown"),
    trigger_keywords: triggerKeywords.slice(0, 10),
    keyword_count: triggerKeywords.length,
  };
}

export async function listSpecialistConfigs(): Promise<SpecialistConfigMeta[]> {
  const manifest = await loadManifest();
  return Object.entries(manifest.configs)
    .map(([slug, entry]) => [slug, manifestEntryYaml(entry)] as const)
    .filter(([, yaml]) => Boolean(yaml))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, yaml]) => configMetaFromYaml(slug, yaml));
}

export async function readConfigYaml(slug: string) {
  const safeSlug = assertSafeConfigSlug(slug);
  const manifest = await loadManifest();
  const manifestEntry = manifest.configs[safeSlug];
  if (manifestEntry) {
    return manifestEntryYaml(manifestEntry);
  }

  const localDir = getLocalConfigDir();
  if (localDir) {
    const filePath = path.join(localDir, `${safeSlug}.yml`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  }

  throw new Error(`Config not found: ${safeSlug}`);
}

export async function writeConfigYaml(slug: string, yaml: string) {
  const safeSlug = assertSafeConfigSlug(slug);
  if (!String(yaml || "").includes(`slug: ${safeSlug}`)) {
    throw new Error(`YAML slug must match ${safeSlug}.`);
  }

  const manifest = await loadManifest();
  manifest.configs[safeSlug] = {
    yaml,
    updated_at: new Date().toISOString(),
  };
  await saveManifest(manifest);
  return `${CONFIG_BUCKET}/${CONFIG_MANIFEST_PATH}`;
}

export async function readTuningHistory(slug: string) {
  const safeSlug = assertSafeConfigSlug(slug);

  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase.storage.from(CONFIG_BUCKET).download(tuningHistoryPath(safeSlug));
    if (error || !data) {
      return [];
    }

    const text = await data.text();
    if (!text.trim()) {
      return [];
    }

    return normalizeTuningHistory(JSON.parse(text));
  } catch {
    return [];
  }
}

export async function appendTuningHistory(slug: string, entry: Partial<TuningHistoryEntry>) {
  const safeSlug = assertSafeConfigSlug(slug);
  const normalizedEntry = normalizeTuningHistoryEntry({
    ...entry,
    id: entry.id || `${entry.type || "step"}-${Date.now()}`,
    timestamp: entry.timestamp || Date.now(),
  });

  if (!normalizedEntry) {
    throw new Error("Invalid tuning history entry.");
  }

  const history = normalizeTuningHistory([...(await readTuningHistory(safeSlug)), normalizedEntry]);
  const supabase = await ensureConfigBucket();
  const { error } = await supabase.storage.from(CONFIG_BUCKET).upload(
    tuningHistoryPath(safeSlug),
    Buffer.from(JSON.stringify({ slug: safeSlug, history }, null, 2), "utf-8"),
    {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    },
  );

  if (error) {
    throw error;
  }

  return history;
}

function yamlList(values: string[]) {
  if (values.length === 0) return "[]";
  return `\n${values.map((value) => `    - ${JSON.stringify(value)}`).join("\n")}`;
}

export async function createConfigFromGeneric(input: {
  slug: string;
  displayName: string;
  triggerKeywords?: string[];
  productSeeds?: string[];
}) {
  const slug = assertSafeConfigSlug(input.slug);
  const manifest = await loadManifest();
  if (manifest.configs[slug]) {
    throw new Error(`Config already exists: ${slug}`);
  }

  const displayName = String(input.displayName || slug).trim();
  const triggerKeywords = (input.triggerKeywords || []).map((value) => value.trim()).filter(Boolean);
  const productSeeds = (input.productSeeds || triggerKeywords).map((value) => value.trim()).filter(Boolean);

  let yaml = await readConfigYaml("generic-b2b");
  yaml = yaml.replace(/^slug:\s*.+$/m, `slug: ${slug}`);
  yaml = yaml.replace(/^display_name:\s*.+$/m, `display_name: ${JSON.stringify(displayName)}`);
  yaml = yaml.replace(/^version:\s*.+$/m, "version: 1");
  yaml = yaml.replace(/^quality_tier:\s*.+$/m, 'quality_tier: "C"');
  yaml = yaml.replace(/keywords:\s*\[\]/, `keywords:${yamlList(triggerKeywords)}`);
  if (productSeeds.length > 0) {
    yaml = yaml.replace(/product_seeds:\s*\n(?:\s{4}- .+\n)+/, `product_seeds:${yamlList(productSeeds)}\n`);
  }

  manifest.configs[slug] = {
    yaml,
    updated_at: new Date().toISOString(),
  };
  await saveManifest(manifest);
  return `${CONFIG_BUCKET}/${CONFIG_MANIFEST_PATH}`;
}
