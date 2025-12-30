# Link.DIP

AI-managed observatory for links about digital democracy, civic tech, gov tech, and the future of politics. Links can be submitted via the web UI or via Telegram, evaluated by Gemini, and stored with an audit trail.

## Features

- AI moderation + categorization (Gemini API)
- Telegram bot ingestion (polling)
- Web UI with grid/list views and category filters
- Preview images with local caching
- CSV audit log + readable app logs
- Docker + Docker Compose for deployment

## Tech Stack

- Node.js + Express (API, bot, static hosting)
- Vite (frontend)
- Gemini API (@google/generative-ai)

## Setup (Local Dev)

```bash
cp .env.example .env
npm install
npm --prefix client install
npm run dev
```

Open `http://localhost:5173` for the UI.

## Environment Variables

- `PORT` (default: 3100)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (default: `models/gemini-2.5-flash`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS` (optional, comma-separated)
- `RSS_MAX_ITEMS` (default: 20)
- `RSS_POLL_INTERVAL_MINUTES` (default: 60)

## Docker (Recommended for Production)

```bash
docker compose up -d --build
```

App runs on `http://localhost:3100`.

## Data & Logs

- Links: `data/links.json`
- Audit CSV: `data/audit/links.csv`
- Logs: `data/logs/app.log`
- Preview images: `data/previews/`

## Notes

- Rejected links are stored but hidden on the homepage.
- Duplicate URLs are automatically skipped.
- This project is AI managed; add the Telegram bot `@DemocracyLinkObservatoryBot` (as admin) to contribute links from chats.
- Telegram admins can toggle bot replies per group with `/botreplies on|off|status`.
- Telegram admins can set a fixed reply thread with `/botthread set <thread_id>` (or clear with `/botthread clear`).
- Telegram admins can hide group names on the website with `/botsource on|off|status`.
- Submitting an RSS feed URL in the web form will import and evaluate all items in that feed.
- RSS feeds submitted once are stored and re-polled on the schedule.
- Edit `data/custom-agent.md` to customize the AI prompt without changing code (falls back to `agent.md`). Categories are read from the `Categories:` section.

## Credits

Part of the [Democracy Innovators Podcast](https://democracyinnovators.com). Made by [Alexoppo.com](https://alexoppo.com) with ❤️.
