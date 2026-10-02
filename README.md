# Noob31 Bookmark Vault 🔖⚡

A Manifest V3 (MV3) Chrome Bookmark Manager built with React 19, TypeScript, and Tailwind CSS. Directly hooks into **Chrome's native bookmarks API**, captures live tab snapshots, and syncs data and screenshot assets to a **GitHub repository** as a serverless cloud backend.

Designed using the signature neo-brutalist sharp aesthetic from [noob31.com](https://noob31.com) (zero-radius borders, `pop-3d` isometric animations, `marker-slanted` accents, and OKLCH color palettes).

---

## ✨ Features

- 🔗 **Direct Chrome Native Bookmarks Hook:**
  - Full two-way integration with `chrome.bookmarks` API.
  - Listens in realtime to `onCreated`, `onRemoved`, `onChanged`, `onMoved`, and `onChildrenReordered`.
  - Creates, edits, moves, and deletes native Chrome bookmarks and folders directly.
- 🐙 **GitHub Cloud Vault & Asset CDN:**
  - Backs up your entire bookmark tree, tags, notes, and metadata to `bookmarks-vault.json` in your private/public GitHub repo.
  - Uploads live tab screenshots and favicons to `assets/screenshots/{id}.webp` in the GitHub repo via GitHub REST API.
  - Automatic background sync via `chrome.alarms` and 1-click manual push/pull.
- 📸 **Live Tab Snapshot & Metadata Extractor:**
  - 1-click active tab screenshot capture (`chrome.tabs.captureVisibleTab`).
  - Automatic extraction of `og:image`, meta description, favicon, keywords, and reader-mode article content.
- 🎨 **Neo-Brutalist UI Surfaces:**
  - **Full-Tab Manager (`manager.html`):** Complete dashboard with folder tree sidebar, tag cloud, snapshot cards / grid / list view toggles, and global search (`/` shortcut).
  - **Chrome Side Panel (`sidepanel.html`):** Keep your bookmark library docked alongside any tab (`chrome.sidePanel`).
  - **Quick-Save Popup (`popup.html`):** 1-click save/update with auto-extracted title, tags, description, and screenshot.
  - **Reader Mode Modal:** Distraction-free article reader for saved pages.
- 💾 **Data Portability:**
  - Export/Import JSON vault backups.
  - Export standard Netscape HTML bookmarks (compatible with Chrome, Firefox, Safari, Edge, Brave, Raindrop).

---

## 🚀 How to Install & Load in Chrome

1. **Build the extension bundle:**
   ```bash
   npm run build
   ```
2. Open Google Chrome (or Edge / Brave / Arc) and navigate to:
   ```text
   chrome://extensions
   ```
3. Toggle on **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left.
5. Select the **`dist`** folder inside this project directory:
   ```text
   d:\Programs\code-stuff\bookmark-mgr\dist
   ```
6. The **Noob31 Bookmark Vault** is now installed and active!

---

## 🛠️ Development Scripts

| Command | Description |
|---|---|
| `npm run build` | Compiles TypeScript and builds the production `dist/` extension bundle |
| `npm run dev` | Runs the Vite development server for live UI preview |
| `npm run watch` | Watches for changes and rebuilds the `dist/` extension automatically |

---

## 🔑 GitHub Setup (Optional)

1. Create a GitHub Personal Access Token (PAT) with `repo` or `Contents: Read & Write` scope.
2. Open **Settings** in the extension manager.
3. Enter your **Token**, **GitHub Username**, and **Repository Name** (e.g. `my-bookmark-vault`).
4. Click **Test Connection** and **Save Settings**.
