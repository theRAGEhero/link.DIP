const Parser = require("rss-parser");
const logger = require("./logger");

const parser = new Parser();

async function parseRss(url, maxItems = 20) {
  try {
    const feed = await parser.parseURL(url);
    if (!feed || !Array.isArray(feed.items) || !feed.items.length) {
      return { isFeed: false, items: [], title: "" };
    }
    const items = feed.items
      .map((item) => ({
        title: item.title || "",
        link: item.link || item.guid || "",
      }))
      .filter((item) => item.link)
      .slice(0, maxItems);
    if (!items.length) {
      return { isFeed: false, items: [], title: feed.title || "" };
    }
    return { isFeed: true, items, title: feed.title || "" };
  } catch (error) {
    logger.info("RSS parse failed", { url, error: error.message });
    return { isFeed: false, items: [], title: "" };
  }
}

module.exports = { parseRss };
