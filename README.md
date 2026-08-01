# Inix

A fast, private browser — built by Inix, for you.

## Features

- **Private by default** — tracker blocking, no telemetry, private search
- **Fully themed** — customize colors via CSS variables in `src/styles/theme.css`
- **Tabbed browsing** — multi-tab with back/forward/reload
- **Inix AI** — on-device chat, page summaries, and selection explain
- **Inix Search** — natural-language search over your browsing history
- **Local storage** — pages, bookmarks, and search index stay on your device

## Local AI setup

Inix AI uses a local inference engine on your machine (default port `11434`).

1. Install and start your local model server
2. Open **Inix → Settings → Local AI Engine**
3. Set your chat and search models

AI and Inix Search require the local engine to be running.

## Quick Start (development)

```bash
npm install
npm run setup   # Windows — first-time Inix runtime setup
npm run dev
```

## Customize Your Theme

Edit the `:root` variables at the top of `src/styles/theme.css`:

```css
:root {
  --accent: #7c6aef;
  --bg-base: #09090e;
  --text-primary: #f4f4f8;
}
```

## Build Inix for Windows

```bash
npm run build:inix
```

Installer output lands in `release/` as `Inix Setup.exe`.

## Privacy

Inix blocks known tracker domains at the network layer. No data is sent to Inix servers or any third party. Your history, AI queries, and search index never leave your device.
