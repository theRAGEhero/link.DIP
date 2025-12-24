const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "..", "data", "links.json");

function normalizeUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = "";
    const params = parsed.searchParams;
    for (const key of Array.from(params.keys())) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(lower)
      ) {
        params.delete(key);
      }
    }
    parsed.search = params.toString();
    let normalized = parsed.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  } catch (error) {
    return rawUrl.trim().toLowerCase();
  }
}

function readLinks() {
  if (!fs.existsSync(dataPath)) {
    return [];
  }
  const raw = fs.readFileSync(dataPath, "utf-8");
  if (!raw.trim()) {
    return [];
  }
  return JSON.parse(raw);
}

function writeLinks(links) {
  fs.writeFileSync(dataPath, JSON.stringify(links, null, 2));
}

function addLink(entry) {
  const links = readLinks();
  const normalizedUrl = normalizeUrl(entry.url);
  const existing = links.find((item) => normalizeUrl(item.url) === normalizedUrl);
  if (existing) {
    return { entry: existing, isDuplicate: true };
  }
  links.unshift(entry);
  writeLinks(links);
  return { entry, isDuplicate: false };
}

module.exports = {
  readLinks,
  writeLinks,
  addLink,
  normalizeUrl,
};
