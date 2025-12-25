import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">Link.DIP</p>
        <h1>Digital Democracy Link Observatory</h1>
        <p class="subtitle">
          Curated links about civic tech, govtech, innovation in governance, and the future of politics.
        </p>
        <p class="subtitle">
          This website is AI managed. Add the Telegram bot @DemocracyLinkObservatoryBot as an admin to contribute links
          directly from your chats.
        </p>
      </div>
      <div class="legend">
        <span class="legend-dot accepted"></span> Accepted
        <span class="legend-dot rejected"></span> Rejected
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
      Open source platform on <a href="https://github.com/theRAGEhero/link.DIP" target="_blank" rel="noreferrer">GitHub</a>.
      Part of the <a href="https://democracyinnovators.com" target="_blank" rel="noreferrer">Democracy Innovators Podcast</a>.
      Made by <a href="https://alexoppo.com" target="_blank" rel="noreferrer">Alexoppo.com</a> with &#10084;.
    </footer>
  </div>
`;

const linksEl = document.querySelector("#links");
const statusEl = document.querySelector("#submit-status");
const filtersEl = document.querySelector("#filters");
let activeCategory = "All";
let cachedLinks = [];
let viewMode = "grid";

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
        <span class="source">Source: ${escapeHtml(link.source)}</span>
      </div>
    </article>
  `;
}

function renderListItem(link) {
  const badgeClass = link.coherent ? "accepted" : "rejected";
  const imageSrc = link.image || "/previews/placeholder.svg";
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
        <span class="source">Source: ${escapeHtml(link.source)}</span>
      </div>
    </article>
  `;
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
