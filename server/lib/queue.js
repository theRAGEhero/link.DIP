const fs = require("fs");
const path = require("path");
const { normalizeUrl } = require("./storage");

const queuePath = path.join(__dirname, "..", "..", "data", "pending.json");

function readQueue() {
  if (!fs.existsSync(queuePath)) {
    return [];
  }
  const raw = fs.readFileSync(queuePath, "utf-8");
  if (!raw.trim()) {
    return [];
  }
  return JSON.parse(raw);
}

function writeQueue(queue) {
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

function enqueue(item) {
  const queue = readQueue();
  const normalized = normalizeUrl(item.url);
  const existing = queue.find((entry) => normalizeUrl(entry.url) === normalized);
  if (existing) {
    return { queuedItem: existing, alreadyQueued: true };
  }

  const queuedItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: item.url,
    source: item.source,
    source_meta: item.source_meta || null,
    attempts: 0,
    created_at: new Date().toISOString(),
    last_attempt_at: null,
    last_error: item.last_error || "",
  };
  queue.push(queuedItem);
  writeQueue(queue);
  return { queuedItem, alreadyQueued: false };
}

function updateQueueItem(id, updates) {
  const queue = readQueue();
  const index = queue.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return null;
  }
  queue[index] = { ...queue[index], ...updates };
  writeQueue(queue);
  return queue[index];
}

function removeQueueItem(id) {
  const queue = readQueue();
  const next = queue.filter((entry) => entry.id !== id);
  writeQueue(next);
  return next.length !== queue.length;
}

module.exports = {
  readQueue,
  writeQueue,
  enqueue,
  updateQueueItem,
  removeQueueItem,
};
