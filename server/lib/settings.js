const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "..", "..", "data", "bot-settings.json");

function readSettings() {
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  const raw = fs.readFileSync(settingsPath, "utf-8");
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

function writeSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function getChatSettings(chatId) {
  const settings = readSettings();
  return settings[String(chatId)] || { replies: true, replyThreadId: null, showSource: true };
}

function setChatReplies(chatId, enabled) {
  const settings = readSettings();
  const current = settings[String(chatId)] || { replies: true, replyThreadId: null, showSource: true };
  settings[String(chatId)] = { ...current, replies: Boolean(enabled) };
  writeSettings(settings);
  return settings[String(chatId)];
}

function setChatReplyThread(chatId, threadId) {
  const settings = readSettings();
  const current = settings[String(chatId)] || { replies: true, replyThreadId: null, showSource: true };
  settings[String(chatId)] = { ...current, replyThreadId: threadId ? Number(threadId) : null };
  writeSettings(settings);
  return settings[String(chatId)];
}

function setChatShowSource(chatId, enabled) {
  const settings = readSettings();
  const current = settings[String(chatId)] || { replies: true, replyThreadId: null, showSource: true };
  settings[String(chatId)] = { ...current, showSource: Boolean(enabled) };
  writeSettings(settings);
  return settings[String(chatId)];
}

module.exports = {
  getChatSettings,
  setChatReplies,
  setChatReplyThread,
  setChatShowSource,
};
