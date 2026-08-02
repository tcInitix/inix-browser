# Inix Browser — Improvement Audit & Plan

## Summary

I read through the Inix v0.1.46 codebase (Electron 34 + React 19, sql.js persistence, single Windows/NSIS target) and mapped every panel, every Electron main module, the theme system, and the shortcut table. This document is my honest engineer's review: **what already ships well, what UI/UX friction I hit while reading the flows, and what feature gaps are worth prioritizing** against modern peers (Arc, Zen, Brave, Vivaldi).

Nothing in this plan is executed. It's a decision-ready menu — pick which bundles you want to build and I'll implement them.

---

## Current State — What's Already Strong

These are genuinely well-done and shouldn't be touched:

- **Local-first AI dual-engine** ([ai-engine.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/ai/ai-engine.ts)) — Ollama + BYO OpenAI-compatible with presets for OpenRouter/Groq/Together. The casual-chat + web-search heuristics in [casual-chat.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/ai/casual-chat.ts) are a nice touch.
- **Three-tier history** (standard / transient / vaulted) with FTS + vector index. Very few browsers do this.
- **Full vault** ([vault-crypto.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/storage/vault-crypto.ts)) — PBKDF2 100k, per-field AES envelope, 30-min idle auto-lock. Covers passwords, autofill profiles, vaulted history.
- **Chrome import** — bookmarks + DPAPI-decrypted passwords. Solid onboarding hook.
- **Panic switch** (Ctrl+Shift+P) — preloaded panic URLs, session swap in [App.tsx#L606-L705](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/App.tsx#L606-L705). This is genuinely unique.
- **Tab freezer** ([tab-freezer.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/session/tab-freezer.ts)) — 30-min idle memory reclaim with capture-before-freeze.
- **Relay/proxy** with prebuilt Texas exit ([relay-config.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/proxy/relay-config.ts)).
- **Theme system** ([theme.css](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/styles/theme.css)) — clean token variables, cohesive purple/teal identity, custom Cunia display font.

---

## Findings & Recommendations

I've grouped findings into **UI/UX polish** (things that feel off today) and **Feature gaps** (things missing vs. peers). Each item has a **priority** (P1 must, P2 should, P3 nice) and a **cost** (S / M / L) so you can pick a bundle.

### A. UI/UX Polish

| # | Finding | Recommendation | Priority | Cost |
|---|---------|----------------|----------|------|
| A1 | [WorkspaceSwitcher.tsx#L26-L29](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/components/WorkspaceSwitcher.tsx#L26-L29) uses the native `prompt()` for workspace creation — jarring against the polished shell. | Replace with an inline rename/create input matching the existing modal style (see `VaultUnlockModal` pattern). Add rename, delete, reorder, and an emoji/icon picker per workspace. | **P1** | S |
| A2 | No visual feedback when a tab is frozen ([tab-freezer.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/session/tab-freezer.ts)) beyond the [StatusBar.tsx](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/components/StatusBar.tsx) flag. Users won't know why a tab reloads. | Add a subtle ice/dim indicator on the frozen tab in [TabBar.tsx](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/components/TabBar.tsx) with a tooltip "Frozen to save memory — click to wake". | P2 | S |
| A3 | [ReaderView.tsx](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/components/ReaderView.tsx) is bare — plain paragraphs, no font/size, no theme, no save-to-library button. | Add font-family (serif/sans), size slider, sepia/dark toggle, "Save article to Library" button (reuse `bookmarks.saveFromTab`), and a read-time estimate. | P2 | M |
| A4 | No audio indicator on tabs playing sound; no per-tab mute. | Wire `webContents.audioMuted` + `webContents.isCurrentlyAudible()` events into tab-manager, expose in tab context menu and as a speaker icon on the tab. | P2 | M |
| A5 | Bookmark toggle in [NavBar.tsx](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/components/NavBar.tsx) currently just saves — no "edit tags/folder/workspace on save". | On first save, show a small popover (star-anchored) with title edit, workspace picker, tag chips, folder picker. Chrome/Firefox do this. | P2 | M |
| A6 | No loading progress bar on the address bar — only the small `.loading-indicator` inside the panel ([App.tsx#L1087-L1092](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/App.tsx#L1087-L1092)). | Thin 2px progress line under the NavBar driven by `did-start-loading` / `did-stop-loading` (fake-progress style). | P3 | S |
| A7 | Downloads toast fires on every update ([App.tsx#L1004-L1009](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/App.tsx#L1004-L1009)) — noisy. | Only toast on completion/failure; keep in-panel live progress. Add a small badge on the download button. | P1 | S |
| A8 | Address bar has no per-tab search-engine keyword (`g <query>`, `yt <query>`). | Extend [types.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/types.ts) `setSearchEngineConfig` + `normalizeUrl` to recognize keyword prefixes. Add engine list in Settings → General. | P2 | M |
| A9 | Boot splash + update prompt overlap awkwardly if an update is found during boot ([App.tsx#L1035-L1046](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/App.tsx#L1035-L1046)). | Fold update state into the splash itself with a "Continue" affordance, not a stacked layer. | P3 | S |
| A10 | Onboarding profile step doesn't preview the avatar in the actual chrome context. | Show a live mini-preview of the tab bar with the chosen color/avatar during onboarding. | P3 | S |
| A11 | No favicon in the address bar security region; the padlock is inferred from `secure: url.startsWith("https://")` ([App.tsx#L580](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/App.tsx#L580)) which is naive. | Read the real cert error state from Electron `did-fail-load` / `certificate-error` and show a red badge for mixed/invalid certs. | P1 | M |
| A12 | The AI sidebar always sits at 360px. On small windows it dominates. | Make it resizable (drag handle) and remember width per profile. | P3 | S |
| A13 | New Tab Page quick links top out at 12 with letter/favicon icons. No group/folder support. | Optional: allow a 2nd row or a "more" flyover, and let a quick link point at a bookmark folder. | P3 | M |

### B. Feature Gaps vs. Modern Browsers

| # | Gap | Recommendation | Priority | Cost |
|---|-----|----------------|----------|------|
| B1 | **No command palette.** Address bar handles URLs/search only. | Add Ctrl+K palette: navigate open tabs, run actions (New tab, Toggle AI, Panic, Import…), open bookmarks, run history search. Fuzzy match. Uses existing IPC. | **P1** | M |
| B2 | **No tab groups / stacks.** Only pinned vs. unpinned in [TabBar.tsx](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/components/TabBar.tsx). | Add colored, named tab groups (collapsible). Persist in session snapshot ([session-types.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/session/session-types.ts)). | P2 | L |
| B3 | **Workspaces don't own tabs** — they're only bookmark canvases. Arc's core value prop. | Extend `workspaces` table with an `active_tabs` blob. Switching a workspace swaps the tab set (like switching profiles but lighter, sharing session/vault). | P2 | L |
| B4 | **No vertical tabs option.** | Add a "Tab layout: horizontal / vertical" toggle in Settings → Tabs. Vertical mode moves TabBar into a left sidebar (280px, collapsible). | P2 | M |
| B5 | **No split view.** | Add "Split right / Split down" from tab context menu — two `BrowserView`s share the content area. Requires `tab-manager.ts` layout rework. | P3 | L |
| B6 | **Privacy blocker is a static ~30-domain hardcoded list** ([blocker.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/privacy/blocker.ts)). | Integrate `@ghostery/adblocker-electron` with EasyList + EasyPrivacy auto-updated. Show per-page block count in NavBar (Brave-style shield). | **P1** | M |
| B7 | **No password generator** in the vault save flow. | Add a "Generate strong password" button on [SavePasswordPrompt.tsx](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/src/components/SavePasswordPrompt.tsx) and in the vault manager. Simple: crypto.getRandomValues + configurable length/symbols. | P1 | S |
| B8 | **No WebAuthn / passkey UI.** Chromium supports it, but there's no Inix-side surface for enrolled credentials. | Wire the platform authenticator through Electron `select-webauthn-credential`, show a small prompt component. Later: store passkeys in the vault. | P2 | M |
| B9 | **No PWA / "install site as app".** | Add "Install [site] as app" in the tab menu when a manifest is detected. Creates a shell window with hidden chrome pointing at the URL. | P3 | M |
| B10 | **No Chrome extension support.** | Use `electron-chrome-extensions` (dubbed `crx`). Enables ad-blockers, password managers, and instantly closes the biggest complaint from Chrome refugees. This is a bigger architectural bet. | P2 | L |
| B11 | **No cross-device sync.** No server story either. | If Inix stays local-only, add **encrypted export/import** to a user file: bookmarks, history, vault-encrypted passwords, settings. Roll-your-own sync via a chosen folder (OneDrive/Dropbox) later. | P2 | M |
| B12 | **AI web search only fetches URLs the user pastes** ([web-context.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/ai/web-context.ts)). No general search backend. | Add a pluggable search provider (Brave Search API, Serper, or DuckDuckGo HTML scrape) behind a Settings toggle so `shouldSearchWebForMessage` can actually search. | **P1** | M |
| B13 | **No screenshot / annotate tool.** | Add a "Capture page/area" button (Ctrl+Shift+S). Use `webContents.capturePage()`, open in a small annotate modal (canvas draw), then save to Downloads or copy to clipboard. | P3 | M |
| B14 | **No macOS/Linux build target** ([package.json#L68-L73](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/package.json#L68-L73)). | Add `mac` (dmg, notarize later) and `linux` (AppImage, deb) targets to electron-builder. Verify shortcuts.ts already handles `input.meta`. | P2 | S |
| B15 | **Missing standard keyboard shortcuts** ([shortcuts.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/shortcuts.ts)): no Ctrl+D (bookmark), no Ctrl+1..8 (jump tab), no Ctrl+Shift+Delete (clear data), no Ctrl+K (search), no Ctrl+Shift+W (close window). | Add them all. Cheapest single-file win in this document. | **P1** | S |
| B16 | **No per-site zoom persistence surfaced in UI.** Global `default_zoom_level` only. | Persist `zoomLevel` per origin in the settings table; apply on `did-navigate`. | P2 | S |
| B17 | **No "read aloud" / TTS.** | Wire native Web Speech API into ReaderView with a "Play" button. Zero-dep. | P3 | S |

---

## Recommended Bundles

Rather than pick 30 items, here are three coherent shipping tranches. Each is roughly one release cycle.

### Bundle 1 — "Polish + Table Stakes" (release v0.2.0)
**Goal:** Close the biggest embarrassments so Inix feels finished.

- A1  Workspace switcher UX rewrite
- A7  Downloads toast noise fix
- A11 Real HTTPS/security state
- B1  Command palette (Ctrl+K)
- B6  Real ad/tracker blocker (Ghostery adblocker)
- B7  Password generator in save prompt
- B12 Pluggable AI web-search backend
- B15 Missing standard shortcuts (Ctrl+D, Ctrl+1..8, Ctrl+Shift+Delete)

### Bundle 2 — "Power User" (release v0.3.0)
**Goal:** Give Arc/Vivaldi refugees a reason to switch.

- A3  Reader mode redesign (fonts, theme, save)
- A4  Tab audio indicator + mute
- A5  Bookmark-on-save popover
- A8  Address bar keyword search
- B2  Tab groups
- B3  Workspaces own tabs (not just bookmarks)
- B4  Vertical tabs mode
- B14 macOS + Linux build targets

### Bundle 3 — "Ecosystem" (release v0.4.0)
**Goal:** Bet on the platform layer.

- B5  Split view
- B8  WebAuthn/passkey UI
- B9  PWA install
- B10 Chrome extensions (`electron-chrome-extensions`)
- B11 Encrypted export/import for portable sync
- B13 Screenshot + annotate

---

## Assumptions & Decisions

- **No backend server** — every recommendation respects the local-first stance. Sync uses a user-chosen folder, not Inix servers.
- **No telemetry added.** README claims none — I'm not adding any.
- **Ghostery adblocker (B6)** chosen over uBO because it's MIT-licensed with a clean Electron middleware; matches existing `session.webRequest` model in [blocker.ts](file:///c:/Users/Jayme%20Anthony/Desktop/initix%20browser/electron/privacy/blocker.ts).
- **`electron-chrome-extensions` (B10)** is technically an unofficial project. If that's unacceptable, drop B10 and keep the rest — it's the only architectural risk in the list.
- **AI search backend (B12)**: default to a free option (DuckDuckGo HTML) with a Settings hook to switch to Brave/Serper API keys, matching the existing OpenAI-compatible pattern.
- **Workspaces owning tabs (B3)** is the biggest UX shift and will need care around private tabs and the panic switch — those should ignore workspace boundaries.

---

## Verification (for whichever bundle you approve)

- `npm run dev` — verify no regressions in tab open/close, session restore after crash, panic mode round-trip.
- `npm run build:inix` — installer must still build clean on Windows; new mac/linux targets (if B14) verified with `--mac dmg` / `--linux AppImage` dry runs.
- Manual regression checklist per bundle:
  - Bundle 1: install, run onboarding, save a password (with new generator), verify shield count on a tracker-heavy page, Ctrl+K opens palette, Ctrl+D bookmarks.
  - Bundle 2: switch to vertical tabs, drag a tab into a group, switch workspace and confirm tab set swaps, reader mode reflows.
  - Bundle 3: install split view side-by-side, install an extension, export vault to file and re-import on a fresh profile.
- No new unit-test infra exists in the repo; verification is manual + build.

---

## Next Step

Tell me which bundle (or which specific items) you want. I'll turn it into a todo list and implement.
