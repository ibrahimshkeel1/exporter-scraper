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
