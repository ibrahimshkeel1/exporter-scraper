import fs from "fs";
import path from "path";

export type SpecialistConfigMeta = {
  slug: string;
  display_name: string;
  version: number;
  quality_tier: string;
  trigger_keywords: string[];
  keyword_count: number;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function assertSafeConfigSlug(slug: string) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new Error("Config slug must use lowercase letters, numbers, and hyphens.");
  }
  return normalized;
}

export function getConfigDir() {
  const candidates = [
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

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(`Config directory not found. Checked: ${candidates.join(", ")}`);
}

export function getConfigPath(slug: string) {
  return path.join(getConfigDir(), `${assertSafeConfigSlug(slug)}.yml`);
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

export function listSpecialistConfigs(): SpecialistConfigMeta[] {
  return fs
    .readdirSync(getConfigDir())
    .filter((file) => file.endsWith(".yml"))
    .sort()
    .map((file) => {
      const slug = file.replace(/\.yml$/, "");
      const yaml = fs.readFileSync(path.join(getConfigDir(), file), "utf-8");
      const triggerKeywords = extractTriggerKeywords(yaml);
      return {
        slug,
        display_name: extractString(yaml, "display_name", slug),
        version: extractNumber(yaml, "version", 1),
        quality_tier: extractString(yaml, "quality_tier", "unknown"),
        trigger_keywords: triggerKeywords.slice(0, 10),
        keyword_count: triggerKeywords.length,
      };
    });
}

export function readConfigYaml(slug: string) {
  const filePath = getConfigPath(slug);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config not found: ${slug}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

export function writeConfigYaml(slug: string, yaml: string) {
  const safeSlug = assertSafeConfigSlug(slug);
  if (!String(yaml || "").includes(`slug: ${safeSlug}`)) {
    throw new Error(`YAML slug must match ${safeSlug}.`);
  }
  const filePath = getConfigPath(safeSlug);
  fs.writeFileSync(filePath, yaml, "utf-8");
  return filePath;
}

function yamlList(values: string[]) {
  if (values.length === 0) return "[]";
  return `\n${values.map((value) => `    - ${JSON.stringify(value)}`).join("\n")}`;
}

export function createConfigFromGeneric(input: {
  slug: string;
  displayName: string;
  triggerKeywords?: string[];
  productSeeds?: string[];
}) {
  const slug = assertSafeConfigSlug(input.slug);
  const filePath = getConfigPath(slug);
  if (fs.existsSync(filePath)) {
    throw new Error(`Config already exists: ${slug}`);
  }

  const displayName = String(input.displayName || slug).trim();
  const triggerKeywords = (input.triggerKeywords || []).map((value) => value.trim()).filter(Boolean);
  const productSeeds = (input.productSeeds || triggerKeywords).map((value) => value.trim()).filter(Boolean);

  let yaml = readConfigYaml("generic-b2b");
  yaml = yaml.replace(/^slug:\s*.+$/m, `slug: ${slug}`);
  yaml = yaml.replace(/^display_name:\s*.+$/m, `display_name: ${JSON.stringify(displayName)}`);
  yaml = yaml.replace(/^version:\s*.+$/m, "version: 1");
  yaml = yaml.replace(/^quality_tier:\s*.+$/m, 'quality_tier: "C"');
  yaml = yaml.replace(/keywords:\s*\[\]/, `keywords:${yamlList(triggerKeywords)}`);
  if (productSeeds.length > 0) {
    yaml = yaml.replace(/product_seeds:\s*\n(?:\s{4}- .+\n)+/, `product_seeds:${yamlList(productSeeds)}\n`);
  }

  fs.writeFileSync(filePath, yaml, "utf-8");
  return filePath;
}
