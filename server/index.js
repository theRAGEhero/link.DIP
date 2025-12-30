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
const { getChatSettings, setChatReplies, setChatReplyThread, setChatShowSource } = require("./lib/settings");
const { parseRss } = require("./lib/rss");
const { readFeeds, upsertFeed } = require("./lib/rssStore");

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

async function processLink({ url, source, sourceMeta }) {
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
    source_meta: sourceMeta || null,
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

app.get("/api/prompt", (req, res) => {
  const data = loadPromptForDisplay();
  res.json(data);
});

app.get("/rss.xml", (req, res) => {
  const links = readLinks().filter((link) => link.coherent);
  const siteUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const rss = buildRssFeed(links, siteUrl);
  res.type("application/rss+xml").send(rss);
});

app.post("/api/submit", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url" });
  }
  try {
    const maxItems = Number(process.env.RSS_MAX_ITEMS || 20);
    const rss = await parseRss(url, maxItems);
    if (rss.isFeed) {
      upsertFeed(url, rss.title);
      const results = [];
      for (const item of rss.items) {
        const result = await processLink({
          url: item.link,
          source: "rss",
          sourceMeta: rss.title ? { rss_title: rss.title } : null,
        });
        results.push(result);
      }
      const acceptedCount = results.filter((r) => r.entry.coherent).length;
      const rejectedCount = results.length - acceptedCount;
      const duplicateCount = results.filter((r) => r.isDuplicate).length;
      return res.json({
        mode: "rss",
        total: results.length,
        accepted: acceptedCount,
        rejected: rejectedCount,
        duplicates: duplicateCount,
        feedTitle: rss.title,
      });
    }

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

    const replyOptions = buildReplyOptions(msg);

    if (isBotRepliesCommand(msg.text)) {
      await handleBotRepliesCommand(bot, msg, replyOptions);
      return;
    }
    if (isBotThreadCommand(msg.text)) {
      await handleBotThreadCommand(bot, msg, replyOptions);
      return;
    }
    if (isBotHelpCommand(msg.text)) {
      await handleBotHelpCommand(bot, msg, replyOptions);
      return;
    }
    if (isBotStartCommand(msg.text)) {
      await handleBotStartCommand(bot, msg, replyOptions);
      return;
    }
    if (isBotSourceCommand(msg.text)) {
      await handleBotSourceCommand(bot, msg, replyOptions);
      return;
    }

    const urls = msg.text.match(/https?:\/\/[^\s]+/g);
    if (!urls || !urls.length) {
      return;
    }

    try {
      const settings = getChatSettings(msg.chat.id);
      const sourceMeta = settings.showSource
        ? { telegram_chat_title: msg.chat.title || "Telegram Group" }
        : null;

      const results = [];
      for (const url of urls) {
        const result = await processLink({ url, source: "telegram", sourceMeta });
        results.push(result);
      }

      if (!settings.replies) {
        return;
      }

      const acceptedCount = results.filter((r) => r.entry.coherent).length;
      const rejectedCount = results.length - acceptedCount;
      const duplicateCount = results.filter((r) => r.isDuplicate).length;

      const replyLines = [
        `Processed ${results.length} link${results.length === 1 ? "" : "s"}.`,
        `Accepted: ${acceptedCount}`,
        `Rejected: ${rejectedCount}`,
      ];
      if (duplicateCount) {
        replyLines.push(`Duplicates skipped: ${duplicateCount}`);
      }

      bot.sendMessage(msg.chat.id, replyLines.join("\n"), replyOptions);
    } catch (error) {
      logger.error("Failed to process telegram link", { error: error.message });
      bot.sendMessage(msg.chat.id, "Failed to evaluate the link.", replyOptions);
    }
  });

  logger.info("Telegram bot started.");
}

startTelegramBot();

app.listen(PORT, () => {
  logger.info(`Server listening on ${PORT}`);
});

startRssScheduler();

function isBotRepliesCommand(text) {
  return /^\/botreplies(@\w+)?\b/i.test(text.trim());
}

function isBotThreadCommand(text) {
  return /^\/botthread(@\w+)?\b/i.test(text.trim());
}

function isBotHelpCommand(text) {
  return /^\/help(@\w+)?\b/i.test(text.trim());
}

function isBotStartCommand(text) {
  return /^\/start(@\w+)?\b/i.test(text.trim());
}

function isBotSourceCommand(text) {
  return /^\/botsource(@\w+)?\b/i.test(text.trim());
}

async function handleBotRepliesCommand(bot, msg, replyOptions) {
  const chatId = msg.chat.id;
  const commandText = msg.text.trim();
  const parts = commandText.split(/\s+/);
  const action = parts[1] ? parts[1].toLowerCase() : "";

  if (!msg.from) {
    return;
  }

  const isAdmin = await isChatAdmin(bot, chatId, msg.from.id);
  if (!isAdmin) {
    bot.sendMessage(chatId, "Only admins can change bot reply settings.", replyOptions);
    return;
  }

  if (action === "on") {
    setChatReplies(chatId, true);
    bot.sendMessage(chatId, "Bot replies enabled for this group.", replyOptions);
    return;
  }
  if (action === "off") {
    setChatReplies(chatId, false);
    bot.sendMessage(chatId, "Bot replies disabled for this group.", replyOptions);
    return;
  }
  if (action === "status") {
    const settings = getChatSettings(chatId);
    bot.sendMessage(
      chatId,
      `Bot replies are currently ${settings.replies ? "enabled" : "disabled"} for this group.`,
      replyOptions
    );
    return;
  }

  bot.sendMessage(
    chatId,
    "Usage: /botreplies on | off | status",
    replyOptions
  );
}

async function handleBotThreadCommand(bot, msg, replyOptions) {
  const chatId = msg.chat.id;
  const commandText = msg.text.trim();
  const parts = commandText.split(/\s+/);
  const action = parts[1] ? parts[1].toLowerCase() : "";
  const threadId = parts[2];

  if (!msg.from) {
    return;
  }

  const isAdmin = await isChatAdmin(bot, chatId, msg.from.id);
  if (!isAdmin) {
    bot.sendMessage(chatId, "Only admins can change bot thread settings.", replyOptions);
    return;
  }

  if (action === "set" && threadId) {
    setChatReplyThread(chatId, threadId);
    bot.sendMessage(chatId, `Bot replies will go to thread ${threadId}.`, replyOptions);
    return;
  }
  if (action === "clear") {
    setChatReplyThread(chatId, null);
    bot.sendMessage(chatId, "Bot reply thread cleared.", replyOptions);
    return;
  }
  if (action === "status") {
    const settings = getChatSettings(chatId);
    const status = settings.replyThreadId ? `thread ${settings.replyThreadId}` : "no fixed thread";
    bot.sendMessage(chatId, `Bot replies are set to: ${status}.`, replyOptions);
    return;
  }

  bot.sendMessage(
    chatId,
    "Usage: /botthread set <thread_id> | clear | status",
    replyOptions
  );
}

async function handleBotHelpCommand(bot, msg, replyOptions) {
  const helpText = [
    "Link.DIP Bot commands:",
    "/botreplies on | off | status — enable/disable bot replies for this group (admins only).",
    "/botthread set <thread_id> | clear | status — set a fixed reply thread (admins only).",
    "/botsource on | off | status — show/hide Telegram group name on the website (admins only).",
    "/help — show this message.",
    "",
    "How it works:",
    "- Post a link and the bot evaluates it with AI.",
    "- Replies show Accepted/Rejected with reasons (if replies are enabled).",
    "- If a fixed thread is set, replies go there; otherwise they stay in the same topic.",
  ].join("\n");
  bot.sendMessage(msg.chat.id, helpText, replyOptions);
}

async function handleBotStartCommand(bot, msg, replyOptions) {
  const welcomeText = [
    "Democracy Link Observatory is available at:",
    "https://link.democracyinnovators.com",
    "",
    "To contribute:",
    "1) Submit a link on the platform (AI evaluates and categorizes it).",
    "2) Add this bot as admin in a group: @DemocracyLinkObservatoryBot (links are evaluated and indexed).",
    "",
    "Commands:",
    "/help shows available settings.",
  ].join("\n");
  bot.sendMessage(msg.chat.id, welcomeText, replyOptions);
}

async function handleBotSourceCommand(bot, msg, replyOptions) {
  const chatId = msg.chat.id;
  const commandText = msg.text.trim();
  const parts = commandText.split(/\s+/);
  const action = parts[1] ? parts[1].toLowerCase() : "";

  if (!msg.from) {
    return;
  }

  const isAdmin = await isChatAdmin(bot, chatId, msg.from.id);
  if (!isAdmin) {
    bot.sendMessage(chatId, "Only admins can change source visibility.", replyOptions);
    return;
  }

  if (action === "on") {
    setChatShowSource(chatId, true);
    bot.sendMessage(chatId, "Telegram group name will be shown on the website.", replyOptions);
    return;
  }
  if (action === "off") {
    setChatShowSource(chatId, false);
    bot.sendMessage(chatId, "Telegram group name will be hidden on the website.", replyOptions);
    return;
  }
  if (action === "status") {
    const settings = getChatSettings(chatId);
    bot.sendMessage(
      chatId,
      `Telegram group name is currently ${settings.showSource ? "visible" : "hidden"}.`,
      replyOptions
    );
    return;
  }

  bot.sendMessage(
    chatId,
    "Usage: /botsource on | off | status",
    replyOptions
  );
}

function buildReplyOptions(msg) {
  const settings = getChatSettings(msg.chat.id);
  if (settings.replyThreadId) {
    return { message_thread_id: settings.replyThreadId };
  }
  if (msg.message_thread_id) {
    return { message_thread_id: msg.message_thread_id };
  }
  return {};
}

function loadPromptForDisplay() {
  const customPromptPath = path.join(__dirname, "..", "data", "custom-agent.md");
  const promptPath = path.join(__dirname, "..", "agent.md");
  try {
    const raw = fs.readFileSync(customPromptPath, "utf-8");
    if (raw.trim()) {
      return { source: "custom-agent.md", prompt: raw.trim() };
    }
  } catch (error) {
    // fall back
  }
  try {
    const raw = fs.readFileSync(promptPath, "utf-8");
    if (raw.trim()) {
      return { source: "agent.md", prompt: raw.trim() };
    }
  } catch (error) {
    // fall back
  }
  return { source: "default", prompt: "" };
}

function startRssScheduler() {
  const intervalMinutes = Number(process.env.RSS_POLL_INTERVAL_MINUTES || 60);
  if (!intervalMinutes || intervalMinutes <= 0) {
    return;
  }
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(() => {
    pollRssFeeds().catch((error) => {
      logger.error("RSS polling failed", { error: error.message });
    });
  }, intervalMs);
  logger.info(`RSS polling scheduled every ${intervalMinutes} minutes.`);
}

async function pollRssFeeds() {
  const feeds = readFeeds();
  if (!feeds.length) {
    return;
  }
  const maxItems = Number(process.env.RSS_MAX_ITEMS || 20);
  for (const feed of feeds) {
    const rss = await parseRss(feed.url, maxItems);
    if (!rss.isFeed) {
      continue;
    }
    if (rss.title && rss.title !== feed.title) {
      upsertFeed(feed.url, rss.title);
    }
    for (const item of rss.items) {
      await processLink({
        url: item.link,
        source: "rss",
        sourceMeta: rss.title ? { rss_title: rss.title } : null,
      });
    }
    logger.info("RSS feed polled", { url: feed.url, items: rss.items.length });
  }
}

function buildRssFeed(links, siteUrl) {
  const items = links
    .map((link) => {
      const title = escapeXml(link.title || link.url);
      const descriptionParts = [
        link.reason ? `Reason: ${link.reason}` : "",
        link.category ? `Category: ${link.category}` : "",
        link.source === "telegram" && link.source_meta && link.source_meta.telegram_chat_title
          ? `Source: Telegram — ${link.source_meta.telegram_chat_title}`
          : `Source: ${link.source}`,
      ].filter(Boolean);
      const description = escapeXml(descriptionParts.join(" | "));
      const pubDate = new Date(link.created_at).toUTCString();
      return [
        "<item>",
        `<title>${title}</title>`,
        `<link>${escapeXml(link.url)}</link>`,
        `<guid>${escapeXml(link.url)}</guid>`,
        `<pubDate>${pubDate}</pubDate>`,
        `<description>${description}</description>`,
        "</item>",
      ].join("");
    })
    .join("");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\">",
    "<channel>",
    `<title>Link.DIP — Digital Democracy Link Observatory</title>`,
    `<link>${escapeXml(siteUrl)}</link>`,
    "<description>Curated links about civic tech, gov tech, and digital democracy.</description>",
    `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    items,
    "</channel>",
    "</rss>",
  ].join("");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function isChatAdmin(bot, chatId, userId) {
  try {
    const admins = await bot.getChatAdministrators(chatId);
    return admins.some((admin) => admin.user && admin.user.id === userId);
  } catch (error) {
    logger.error("Failed to check chat admins", { error: error.message });
    return false;
  }
}
