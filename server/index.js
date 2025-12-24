require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const logger = require("./lib/logger");
const { fetchPreview } = require("./lib/preview");
const { evaluateLink } = require("./lib/ai");
const { addLink, readLinks, normalizeUrl } = require("./lib/storage");
const { appendAudit } = require("./lib/audit");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/previews", express.static(path.join(__dirname, "..", "data", "previews")));

const clientDist = path.join(__dirname, "..", "client", "dist");
const hasClientDist = fs.existsSync(clientDist);
if (hasClientDist) {
  app.use(express.static(clientDist));
}

const PORT = process.env.PORT || 3100;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ALLOWED_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

function isAllowedChat(chatId) {
  if (!TELEGRAM_ALLOWED_CHAT_IDS.length) {
    return true;
  }
  return TELEGRAM_ALLOWED_CHAT_IDS.includes(String(chatId));
}

async function processLink({ url, source }) {
  const existing = readLinks().find(
    (item) => normalizeUrl(item.url) === normalizeUrl(url)
  );
  if (existing) {
    logger.info("Duplicate link skipped", { url, source });
    return { entry: existing, isDuplicate: true };
  }
  const preview = await fetchPreview(url);
  const evaluation = await evaluateLink({
    url,
    title: preview.title,
    source,
  });

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    url,
    title: evaluation.title || preview.title || url,
    image: preview.image,
    coherent: Boolean(evaluation.coherent),
    category: evaluation.category,
    reason: evaluation.reason,
    category_reason: evaluation.category_reason,
    source,
  };

  addLink(entry);

  await appendAudit({
    timestamp: entry.created_at,
    source,
    url,
    title: entry.title,
    image: entry.image,
    coherent: entry.coherent,
    category: entry.category,
    reason: entry.reason,
    category_reason: entry.category_reason,
    raw_ai: evaluation.raw,
  });

  logger.info("Processed link", { url, source, coherent: entry.coherent });
  return { entry, isDuplicate: false };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/links", (req, res) => {
  const links = readLinks();
  res.json({ links });
});

app.post("/api/submit", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url" });
  }
  try {
    const result = await processLink({ url, source: "user" });
    res.json(result);
  } catch (error) {
    logger.error("Failed to process user link", { error: error.message });
    res.status(500).json({ error: "Failed to evaluate link" });
  }
});

if (hasClientDist) {
  app.use((req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }
    if (req.path.startsWith("/api") || req.path.startsWith("/previews")) {
      return next();
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

function startTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.info("Telegram bot token not set, skipping bot startup.");
    return;
  }

  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on("message", async (msg) => {
    if (!msg.text) return;
    if (!isAllowedChat(msg.chat.id)) {
      return;
    }

    const urls = msg.text.match(/https?:\/\/[^\s]+/g);
    if (!urls || !urls.length) {
      return;
    }

    const url = urls[0];
    try {
      const result = await processLink({ url, source: "telegram" });
      const entry = result.entry;
      if (result.isDuplicate) {
        bot.sendMessage(msg.chat.id, "Already saved. Skipping duplicate link.");
        return;
      }
      if (entry.coherent) {
        bot.sendMessage(
          msg.chat.id,
          `Accepted: ${entry.title}\nCategory: ${entry.category}\nReason: ${entry.reason}`
        );
      } else {
        bot.sendMessage(
          msg.chat.id,
          `Rejected: ${entry.reason}`
        );
      }
    } catch (error) {
      logger.error("Failed to process telegram link", { error: error.message });
      bot.sendMessage(msg.chat.id, "Failed to evaluate the link.");
    }
  });

  logger.info("Telegram bot started.");
}

startTelegramBot();

app.listen(PORT, () => {
  logger.info(`Server listening on ${PORT}`);
});
