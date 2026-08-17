# Changelog

## Unreleased

### Added
- **`curl … | sh` installer** (`install.sh`) with `install` (default), `update`/`upgrade`, `remove`/`uninstall`, and `help`. Pass the command after `sh -s --` when piping. Since there is no build step, it installs the source to `~/.local/share/cyberspace-opentui` and writes a `cyberspace` launcher to `~/.local/bin` that runs it with Bun; Bun itself is installed if missing. Uses git when available and falls back to a source tarball otherwise, so it works on images without git. `remove` keeps `~/.config/cyberspace-tui` unless given `--purge`, and neither removal touches a launcher or directory the installer didn't create. Paths, command name, ref, and source repo are overridable via `CYBERSPACE_*` environment variables.

## v0.3

The read-only client becomes read/write: compose, reply, and delete — plus freshness
(live reply counts, a "load new entries" queue) and a snooze mode so an idle terminal
stops polling the API.

### Added
- **Compose entries** (`C`) and **replies** (`R`) from the reader. Multi-line editor (`TextareaRenderable`), `⌃S` to post, `Esc` to cancel, with a confirm dialog before anything hits the API. Reply mode shows the parent post as a markdown-rendered quote.
- **Delete your own posts and replies** (`D`) with a confirm dialog. The `DELETE` chip only appears when the focused item is yours.
- **Confirm dialog** with focusable **No / Yes** buttons — `←/→`/`Tab` to move, `Enter` activates the focused button (defaults to Yes), `Esc` is always No.
- **Loading modal** — a floating popup with the braille spinner, used for profile loads and deletes.
- **Live-ish reply counts.** The post card now shows the real reply count (was always `0`). Opening a post reconciles the count from the loaded replies (`50+` when paginated), replies refetch stale-while-revalidate, and posting a reply bumps the count optimistically. A 30s background poll keeps the open thread current.
- **"Load N new entries"** banner. A 60s poll buffers posts newer than the top of your feed (no reordering); press `N` to prepend them, preserving your selected post. `G` triggers the check on demand.
- **Snooze mode.** After 10 minutes with no keypress, all background polling pauses and a `zzz snoozed` indicator shows in the header; the next keypress resumes and catches up.
- **Persistent reader column width** — the `[ ]` split is saved to `~/.config/cyberspace-tui/settings.json` and restored on launch.
- Write/delete API endpoints in `src/api/endpoints.ts`: `POST /v1/posts`, `POST /v1/replies`, `DELETE /v1/posts/:id`, `DELETE /v1/replies/:id`.

### Changed
- **Modals are transparent overlays.** Compose, confirm, and loading now float on top of the app (absolute-positioned, high `zIndex`) with a transparent backdrop, so the reader stays visible behind them, instead of replacing the content area.
- Extracted the shared markdown syntax style + `cleanMarkdown` into `src/ui/markdown.ts` (reused by the reader detail and the compose reply quote).
- **Upgraded `@opentui/core` `0.1.97` → `0.4.2`.** Drop-in for this app — no source changes required; `MarkdownRenderable` + `SyntaxStyle` and all renderable/event APIs still work. Verified with `tsc --noEmit` (clean) and a live boot against `api.cyberspace.online`.
- **Pinned `typescript` to `5.9.3`.** TypeScript 6.0 (latest) can't load the `@types/bun`/`bun-types` declarations (they target TS 5.x), so it drops every Bun/Node global (`Bun`, `fetch`, `URL`, `process`, `setInterval`, `node:*`) and misreads OpenTUI's event types — 22 spurious errors. Type-checking only; `bun dev` runtime was never affected. Revisit once `bun-types` ships TS 6 support.
- **Pinned `@types/bun` to `^1.3.12`** (was `"latest"`).

### Fixed
- **API error messages now surface.** The client read `message`/`code` at the top level, but the API wraps errors as `{ error: { code, message } }`, so every real message was swallowed and replaced with the HTTP status text (e.g. login showed "Unauthorized" instead of "Invalid email or password"). Now reads the nested envelope with a top-level fallback — rate-limit and validation messages from compose/delete surface too.
- **Reply count stuck at "0 replies"** on the post card — the count was hardcoded and the feed's `repliesCount` was dropped in `postsToRows`.

### Removed
- The non-functional `j`/`k` "scroll" hint in the detail footer and its dead handlers.
- The live character counter in the compose editor (the 32,768-char limit is still enforced on submit).
- **`web-tree-sitter` dependency.** OpenTUI `0.4` renders markdown with a bundled engine (`marked`) instead of tree-sitter, so the external wasm asset and its `0.25.10` version pin are no longer needed.
- Unused `ProfileViewHandle` type import in `src/index.ts` (flagged by oxlint).

## v0.2

### Added
- **Profile view** — new `⌃P` tab shows the authenticated user's profile (stats, bio, location, posts). `U` from the reader opens the selected post's author.
- **Markdown rendering** in post bodies and replies (right pane). Uses OpenTUI's `MarkdownRenderable` with a theme-mapped `SyntaxStyle` — headings, bold, italic, inline code, lists, links.
- **Pre-processing** for the renderer: collapses 3+ blank lines to 2, strips `&nbsp;`/`\u00A0`-only lines, rewrites `[url](url)` as autolinks so self-referential links aren't duplicated.
- **Markdown stripping** for preview rows in both reader and profile lists — no more raw `**`, `#`, link syntax in the single-line preview. Skips empty leading lines and falls through to the first line with real content.
- **Animated spinner** while replies load (braille-dot frames).
- **`web-tree-sitter@0.25.10`** pinned as a direct dependency — required at runtime for markdown syntax highlighting (the wasm asset name changed in `0.26.x` and OpenTUI's worker can't resolve it).

### Changed
- **Tab shortcuts** are now `⌃R` (Reader) and `⌃P` (Profile) instead of digit keys. `FEED` tab removed — was a placeholder.
- **Detail pane keys** swapped: `↑/↓` now moves between cards (post → replies); `j/k` scrolls line-by-line.
- **`Q` exits cleanly** — added `process.exit(0)` so the tree-sitter worker thread doesn't keep the process alive after `renderer.destroy()`.
- **Profile layout** — bio moved inside the main header card (above the stats row); separate BIO box removed. Top/bottom padding zeroed.
- **Post card layout** — top/bottom padding removed; margins around the replies divider removed.
- **Theme** — `fgDim` brightened from `#8a7f6f` to `#a89e8e` for better legibility on borders and muted text.
- **Footer legend** no longer duplicates the tab shortcuts (they're in the header).

### Fixed
- Tree-sitter markdown parsing was silently failing due to a `web-tree-sitter` version mismatch (`0.26.x` vs the `0.25.10` OpenTUI expects), which caused the `MarkdownRenderable` to render every post as raw plain text with visible `**`/`#`/`[...](...)` markers.

## v0.1

- One-shotted from [sacred.cyberspace.online](https://sacred.cyberspace.online) and API docs