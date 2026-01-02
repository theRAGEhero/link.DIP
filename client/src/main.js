import "./style.css";

const app = document.querySelector("#app");

if (window.location.pathname === "/info") {
  app.innerHTML = `
    <div class="page">
      <header class="hero">
        <div class="hero-left">
          <img class="hero-logo" src="/logo.png" alt="Link.DIP logo" />
          <p class="eyebrow">Link.DIP</p>
          <h1>AI Agent Instructions</h1>
          <p class="subtitle">
            Transparency on the AI instructions used to evaluate links.
          </p>
          <a class="ghost link-button" href="/">Back to homepage</a>
        </div>
      </header>

      <section class="info">
        <div class="info-header">
          <h2>AI Prompt</h2>
          <span id="prompt-source" class="muted"></span>
        </div>
        <pre id="prompt-box" class="prompt-box">Loading prompt...</pre>
      </section>

      <footer class="footer">
        <a href="https://github.com/theRAGEhero/link.DIP" target="_blank" rel="noreferrer">Open Source Code</a>.
        Part of the <a href="https://democracyinnovators.com" target="_blank" rel="noreferrer">Democracy Innovators Podcast</a>.
        Made by <a href="https://alexoppo.com" target="_blank" rel="noreferrer">Alexoppo.com</a> with &#10084;.
      </footer>
    </div>
  `;

  const promptBox = document.querySelector("#prompt-box");
  const promptSource = document.querySelector("#prompt-source");
  fetch("/api/prompt")
    .then((res) => res.json())
    .then((data) => {
      promptBox.textContent = data.prompt || "Prompt not available.";
      promptSource.textContent = data.source ? `Source: ${data.source}` : "";
    })
    .catch(() => {
      promptBox.textContent = "Unable to load prompt.";
    });
} else {
  app.innerHTML = `
    <div class="page">
      <header class="hero">
        <div class="hero-left">
          <div class="hero-title">
            <img class="hero-logo" src="/logo.png" alt="Link.DIP logo" />
            <div class="hero-title-text">
              <p class="eyebrow">Link.DIP</p>
              <h1>Digital Democracy Link Observatory</h1>
            </div>
          </div>
          <p class="subtitle">
            Curated links about civic tech, govtech, innovation in governance, and the future of politics.
          </p>
        </div>
        <div class="hero-meta">
          <p class="subtitle compact">
            <strong>AI managed platform</strong><br />
            Add <a href="https://t.me/DemocracyLinkObservatoryBot" target="_blank" rel="noreferrer">@DemocracyLinkObservatoryBot</a> as admin to contribute links from your chats.
          </p>
          <a class="ghost link-button" href="/info">AI Agent Instructions</a>
        </div>
      </header>

      <section class="submit">
        <h2>Submit a link</h2>
        <form id="submit-form" class="submit-form">
          <input
            id="url-input"
            type="url"
            name="url"
            placeholder="https://example.com/article"
            required
          />
          <button type="submit">Send to curator</button>
        </form>
        <p id="submit-status" class="status"></p>
      </section>

      <section class="feed">
        <div class="feed-header">
          <h2>Latest evaluations</h2>
          <div class="feed-actions">
            <button id="toggle-view" class="ghost">List view</button>
            <button id="refresh" class="ghost">Refresh</button>
          </div>
        </div>
        <div id="filters" class="filters"></div>
        <div id="links" class="cards"></div>
      </section>

      <footer class="footer">
        <a href="https://github.com/theRAGEhero/link.DIP" target="_blank" rel="noreferrer">Open Source Code</a>.
        Part of the <a href="https://democracyinnovators.com" target="_blank" rel="noreferrer">Democracy Innovators Podcast</a>.
        Made by <a href="https://alexoppo.com" target="_blank" rel="noreferrer">Alexoppo.com</a> with &#10084;.
      </footer>
    </div>
  `;
}

const linksEl = document.querySelector("#links");
const statusEl = document.querySelector("#submit-status");
const filtersEl = document.querySelector("#filters");
let activeCategory = "All";
let cachedLinks = [];
let viewMode = "grid";

if (!linksEl) {
  // Info page only.
} else {

async function fetchLinks() {
  linksEl.innerHTML = "<p class=\"muted\">Loading links...</p>";
  try {
    const res = await fetch("/api/links");
    if (!res.ok) {
      throw new Error("Failed to load links");
    }
    const data = await res.json();
    cachedLinks = (data.links || []).filter((link) => link.coherent);
    renderFilters(cachedLinks);
    renderLinks(filterByCategory(cachedLinks));
  } catch (error) {
    linksEl.innerHTML = "<p class=\"muted\">Unable to load links. Is the API running?</p>";
  }
}

function renderLinks(links) {
  if (!links.length) {
    linksEl.innerHTML = "<p class=\"muted\">No links yet. Submit the first one.</p>";
    return;
  }
  linksEl.classList.toggle("list", viewMode === "list");
  if (viewMode === "list") {
    linksEl.innerHTML = links.map(renderListItem).join("");
  } else {
    linksEl.innerHTML = links.map(renderCard).join("");
  }
}

function renderCard(link) {
  const badgeClass = link.coherent ? "accepted" : "rejected";
  const image = link.image
    ? `<img src="${link.image}" alt="${escapeHtml(link.title)}" loading="lazy" />`
    : `<div class="placeholder">No preview</div>`;
  const sourceLine = buildSourceLine(link);

  return `
    <article class="card">
      <div class="preview ${badgeClass}">${image}</div>
      <div class="card-body">
        <div class="card-meta">
          <span class="badge ${badgeClass}">${link.coherent ? "Accepted" : "Rejected"}</span>
          <span class="category">${escapeHtml(link.category)}</span>
        </div>
        <h3>${escapeHtml(link.title)}</h3>
        <p class="reason">${escapeHtml(link.reason || "")}</p>
        <p class="category-reason">${escapeHtml(link.category_reason || "")}</p>
        <a href="${link.url}" target="_blank" rel="noreferrer">Open link</a>
        <span class="source">${sourceLine}</span>
      </div>
    </article>
  `;
}

function renderListItem(link) {
  const badgeClass = link.coherent ? "accepted" : "rejected";
  const imageSrc = link.image || "/previews/placeholder.svg";
  const sourceLine = buildSourceLine(link);
  return `
    <article class="list-item">
      <img class="list-thumb" src="${imageSrc}" alt="${escapeHtml(link.title)}" loading="lazy" />
      <div class="list-body">
        <div class="card-meta">
          <span class="badge ${badgeClass}">${link.coherent ? "Accepted" : "Rejected"}</span>
          <span class="category">${escapeHtml(link.category)}</span>
        </div>
        <h3>${escapeHtml(link.title)}</h3>
        <p class="reason">${escapeHtml(link.reason || "")}</p>
        <a href="${link.url}" target="_blank" rel="noreferrer">Open link</a>
        <span class="source">${sourceLine}</span>
      </div>
    </article>
  `;
}

function buildSourceLine(link) {
  if (link.source === "telegram") {
    const groupName = link.source_meta && link.source_meta.telegram_chat_title;
    return groupName
      ? `Source: Telegram — ${escapeHtml(groupName)}`
      : "Source: Telegram";
  }
  if (link.source === "rss") {
    const rssTitle = link.source_meta && link.source_meta.rss_title;
    return rssTitle
      ? `Source: RSS — ${escapeHtml(rssTitle)}`
      : "Source: RSS";
  }
  return `Source: ${escapeHtml(link.source)}`;
}

function renderFilters(links) {
  const categories = Array.from(
    new Set(links.map((link) => link.category).filter(Boolean))
  ).sort();
  const buttons = ["All", ...categories]
    .map((category) => {
      const isActive = category === activeCategory;
      return `<button class="filter ${isActive ? "active" : ""}" data-category="${escapeHtml(
        category
      )}">${escapeHtml(category)}</button>`;
    })
    .join("");
  filtersEl.innerHTML = buttons;
}

function filterByCategory(links) {
  if (activeCategory === "All") {
    return links;
  }
  return links.filter((link) => link.category === activeCategory);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const form = document.querySelector("#submit-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = document.querySelector("#url-input").value.trim();
  if (!url) return;

  statusEl.textContent = "Submitting...";
  statusEl.classList.remove("error");
  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      throw new Error("Submission failed");
    }

    const data = await res.json();
    if (data.mode === "rss") {
      const queuedText = data.queued ? ` Queued: ${data.queued}.` : "";
      statusEl.textContent = `RSS import: ${data.total} links processed. Accepted: ${data.accepted}. Rejected: ${data.rejected}. Duplicates: ${data.duplicates}.${queuedText}`;
      fetchLinks();
      return;
    }
    if (data.queued) {
      statusEl.textContent = "Queued for later evaluation due to rate limits.";
      return;
    }
    if (data.isDuplicate) {
      statusEl.textContent = "Link already saved. Skipping duplicate.";
      return;
    }
    statusEl.textContent = data.entry.coherent
      ? "Link accepted and added to the feed."
      : "Link rejected by the curator.";
    document.querySelector("#url-input").value = "";
    fetchLinks();
  } catch (error) {
    statusEl.textContent = "Failed to submit link.";
    statusEl.classList.add("error");
  }
});

const refreshBtn = document.querySelector("#refresh");
refreshBtn.addEventListener("click", fetchLinks);
const toggleViewBtn = document.querySelector("#toggle-view");
toggleViewBtn.addEventListener("click", () => {
  viewMode = viewMode === "grid" ? "list" : "grid";
  toggleViewBtn.textContent = viewMode === "grid" ? "List view" : "Grid view";
  renderLinks(filterByCategory(cachedLinks));
});
filtersEl.addEventListener("click", (event) => {
  const button = event.target.closest(".filter");
  if (!button) return;
  activeCategory = button.dataset.category || "All";
  renderFilters(cachedLinks);
  renderLinks(filterByCategory(cachedLinks));
});

fetchLinks();
}
