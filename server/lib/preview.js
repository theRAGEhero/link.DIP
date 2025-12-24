const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const previewDir = path.join(__dirname, "..", "..", "data", "previews");
const placeholderPath = path.join(previewDir, "placeholder.svg");

async function fetchPreview(url) {
  let ogTitle = "";
  let ogImage = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LinkDIPBot/1.0" },
    });
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = await res.text();
        ogImage = extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || "";
        ogTitle = extractMeta(html, "og:title") || extractTitle(html) || "";
      }
    }
  } catch (error) {
    // ignore and fall back to favicon/placeholder
  }

  const resolvedImage = resolveUrl(ogImage, url) || buildFaviconUrl(url);
  const localImage = await downloadImageToLocal(resolvedImage);

  return { image: localImage, title: ogTitle };
}

function extractMeta(html, property) {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(regex);
  return match ? match[1] : "";
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "";
}

function resolveUrl(candidate, baseUrl) {
  if (!candidate) return "";
  if (candidate.startsWith("//")) {
    return `https:${candidate}`;
  }
  try {
    return new URL(candidate, baseUrl).toString();
  } catch (error) {
    return "";
  }
}

function buildFaviconUrl(pageUrl) {
  try {
    const parsed = new URL(pageUrl);
    return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(parsed.origin)}`;
  } catch (error) {
    return "";
  }
}

async function downloadImageToLocal(imageUrl) {
  ensurePreviewDir();
  if (!imageUrl) {
    return "/previews/placeholder.svg";
  }

  const hash = crypto.createHash("sha256").update(imageUrl).digest("hex").slice(0, 16);
  const existing = fs.readdirSync(previewDir).find((file) => file.startsWith(hash));
  if (existing) {
    return `/previews/${existing}`;
  }

  try {
    const res = await fetch(imageUrl, { headers: { "User-Agent": "LinkDIPBot/1.0" } });
    if (!res.ok) {
      return "/previews/placeholder.svg";
    }
    const contentType = res.headers.get("content-type") || "";
    const ext = extensionFromContentType(contentType) || extensionFromUrl(imageUrl) || ".jpg";
    const filename = `${hash}${ext}`;
    const filePath = path.join(previewDir, filename);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return `/previews/${filename}`;
  } catch (error) {
    return "/previews/placeholder.svg";
  }
}

function extensionFromContentType(type) {
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
  };
  return map[type.toLowerCase()] || "";
}

function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext && ext.length <= 5 ? ext : "";
  } catch (error) {
    return "";
  }
}

function ensurePreviewDir() {
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  if (!fs.existsSync(placeholderPath)) {
    fs.writeFileSync(
      placeholderPath,
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="100%" height="100%" fill="#f2e6d3"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="18" fill="#6b645c" text-anchor="middle" dominant-baseline="middle">No preview</text></svg>`
    );
  }
}

module.exports = { fetchPreview };
