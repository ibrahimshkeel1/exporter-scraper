export const leadPacks = [
  {
    id: "starter",
    name: "Starter",
    leads: 10,
    priceUsd: 50,
    description: "Proof pack for a narrow apparel/textile niche."
  },
  {
    id: "growth",
    name: "Growth",
    leads: 25,
    priceUsd: 100,
    description: "Best first paid run for a serious exporter."
  },
  {
    id: "pro",
    name: "Pro",
    leads: 60,
    priceUsd: 200,
    description: "Larger pack for teams ready to work a focused pipeline."
  }
] as const;

export const regions = ["USA", "UK", "Europe"] as const;

export const buyerTypes = [
  "Importers",
  "Wholesalers",
  "Distributors",
  "Retailers",
  "Private-label brands",
  "Procurement/vendor portals"
] as const;

export const exportFormats = [
  { id: "all", label: "XLSX + CSV + JSON" },
  { id: "xlsx", label: "Excel only" },
  { id: "csv", label: "CSV only" },
  { id: "json", label: "JSON only" }
] as const;

export function getLeadPack(packId: string) {
  return leadPacks.find((pack) => pack.id === packId) ?? leadPacks[0];
}
