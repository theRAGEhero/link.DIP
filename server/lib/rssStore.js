const fs = require("fs");
const path = require("path");

const feedsPath = path.join(__dirname, "..", "..", "data", "rss-feeds.json");

function readFeeds() {
  if (!fs.existsSync(feedsPath)) {
    return [];
  }
  const raw = fs.readFileSync(feedsPath, "utf-8");
  if (!raw.trim()) {
    return [];
  }
  return JSON.parse(raw);
}

function writeFeeds(feeds) {
  fs.writeFileSync(feedsPath, JSON.stringify(feeds, null, 2));
}

function upsertFeed(url, title) {
  const feeds = readFeeds();
  const existing = feeds.find((feed) => feed.url === url);
  if (existing) {
    if (title && existing.title !== title) {
      existing.title = title;
      existing.updated_at = new Date().toISOString();
      writeFeeds(feeds);
    }
    return existing;
  }
  const entry = {
    url,
    title: title || "",
    added_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  feeds.push(entry);
  writeFeeds(feeds);
  return entry;
}

module.exports = {
  readFeeds,
  writeFeeds,
  upsertFeed,
};
