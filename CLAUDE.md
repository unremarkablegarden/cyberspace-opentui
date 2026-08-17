# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun install` — install dependencies
- `bun dev` — run the TUI in watch mode (runs `src/index.ts` via Bun with `--watch`)
- `sh install.sh [install|update|remove|help]` — the end-user installer (see below)

There is no build, lint, or test script configured. TypeScript is used purely for type-checking in editors (`noEmit: true`); run `bunx tsc --noEmit` if you need to verify types.

Note: `package.json` declares `"module": "src/index.tsx"` but the actual entry and dev script use `src/index.ts`. Keep the runtime entry at `src/index.ts` unless intentionally switching to JSX.

## Commit conventions

- **Never mention Claude, Anthropic, AI, or any assistant in commit messages** — no `Co-Authored-By: Claude`, no "Generated with…" trailers, no references in the subject or body. Write commit messages as if authored by the human developer.

## Architecture

This is a terminal UI application built on **OpenTUI** (`@opentui/core`), running on the Bun runtime. Uses OpenTUI's **core imperative API** (class-based `BoxRenderable`, `TextRenderable`, `SelectRenderable`, `InputRenderable`, `ScrollBoxRenderable`), not the React or Solid reconcilers. If you ever introduce JSX, switch the entry to `.tsx` and update the dev script and `"module"` field accordingly.

### Module layout

```
src/
  index.ts                # bootstrap: renderer, auth-gate, mount reader, wire feed/compose/delete/polling
  app.ts                  # shell: header + swappable content area + footer
  theme.ts                # colors (cream/black base, purple accent)
  activity.ts             # last-keypress tracking → isIdle() (snooze mode), resume/idle hooks
  api/
    types.ts              # Post, Reply, User, Attachment — mirrored from references/api
    client.ts             # fetch wrapper: base URL, bearer header, 401→refresh→retry, { error } envelope
    endpoints.ts          # auth + listPosts/getReplies/getUser(s) + createPost/createReply + deletePost/deleteReply
  auth/
    store.ts              # ~/.config/cyberspace-tui/auth.json (0600 perms)
    session.ts            # in-memory token state, writes through to disk
  settings/
    store.ts              # ~/.config/cyberspace-tui/settings.json (reader column width, etc.)
  focus/
    registry.ts           # pub/sub for the active focus context + its shortcuts
  ui/
    header.ts             # top row: ⌃R READER / ⌃P PROFILE + snooze indicator + wordmark
    footer.ts             # subscribes to focus registry, renders active shortcuts
    markdown.ts           # shared postSyntaxStyle + cleanMarkdown (reader detail + compose quote)
    reader/
      readerView.ts       # left/right split, pane cycling, dynamic shortcut publish, C/R/D/G/N keys
      postList.ts         # SelectRenderable + "Load N new entries" banner; selectById/setNewCount
      postDetail.ts       # post card + replies; getFocused() + setRepliesCount() reconcile
    modals/
      login.ts            # centered card, email + masked-password inputs, API login
      compose.ts          # transparent overlay: TextareaRenderable body, ⌃S post (confirm), Esc cancel
      confirm.ts          # transparent overlay: focusable No/Yes buttons, Enter/Esc shortcuts
      loading.ts          # transparent overlay: braille spinner "Loading" popup
```

### API response shape — API wraps everything in `{ data }`

All `/v1/*` endpoints return `{ data: T }` or `{ data: T[], meta: { cursor } }`. The login/refresh endpoints are single-wrapped (`{ data: { idToken, refreshToken, rtdbToken } }`) — `src/api/endpoints.ts` unwraps them before returning. `listPosts`/`getReplies` return the `{ data, meta }` pair directly (typed as `Paginated<T>`). If you add a new endpoint, follow the same pattern: type the `apiFetch` call with `{ data: T }` and return `.data`, or return the full `{ data, meta }` for paginated lists.

**Auth endpoint quirk:** `POST /v1/auth/refresh` returns `{ data: { idToken, rtdbToken } }` — **no `refreshToken`**. On refresh, reuse the stored refresh token.

**Error envelope:** the API renders errors as `{ error: { code, message } }` (nested under `error`), uniformly for auth/validation/rate-limit. `client.ts`'s `doFetch` reads the nested `error.{message,code}` first, then falls back to top-level, then `res.statusText`. Don't "simplify" it back to reading top-level `message` — that silently swallows every real API message (login "Unauthorized" instead of "Invalid email or password", rate-limit/validation strings from compose/delete). See `references/api/DOCS.md` (Error Codes) for the code table.

**Write/delete endpoints** (`POST /v1/posts`, `POST /v1/replies`, `DELETE /v1/posts/:id`, `DELETE /v1/replies/:id`): content max 32,768 chars; server sets the author from the token (never trust client author fields); rate limits are 2/min·15/day for posts, 3/min·15/day for replies. Account needs API access or supporter status or a `403` surfaces.

### Focus registry — context-aware footer

The footer is NOT a global keymap. Each focusable surface (list pane, detail pane, login modal) calls `setContext({ id, shortcuts })` in `focus/registry.ts` when it gains focus. The footer subscribes once and re-renders its chips whenever the context changes. When you add a new focusable view (compose box, post-detail scroll, etc.), declare its shortcuts as `Shortcut[]` and publish them on focus — don't touch `footer.ts`.

**Dynamic chips.** Some chips are conditional: the reader's base shortcut arrays omit `DELETE` and `LOAD NEW`, and `readerView.ts`'s `publishShortcuts()` splices them in only when the focused item is the current user's (`currentUsername()` matches the row/reply author) or when new posts are buffered. Re-publish on every state change that affects them — selection change, pane switch, detail card navigation. Don't add these chips to the static arrays.

### Modal overlays — transparent, self-mounting

`compose.ts`, `confirm.ts`, and `loading.ts` are **absolute-positioned overlays** (`position: "absolute"`, full size, high `zIndex`, `backgroundColor: "transparent"`) that **add themselves to `renderer.root`** in their factory and remove themselves in `dispose()` — they do NOT go through `shell.setContent`. The backdrop is transparent so the app stays visible behind; only the centered card is opaque (`theme.bg`). zIndex ordering: loading `1500` < compose `1800` < confirm `2000` (a post-confirm sits above the compose editor). Each returns a `done` promise (`compose` → result|null, `confirm` → boolean) and an explicit `dispose()`. `index.ts` gates them with a single `modalOpen` flag that also suppresses the global `⌃R`/`⌃P` tab switches while a modal is up.

### Compose editor (`ui/modals/compose.ts`)

Multi-line body uses OpenTUI's `TextareaRenderable`; read the text with the **`.plainText`** getter. `⌃S`/`Esc` are handled in a view-level `renderer.keyInput` listener (like `login.ts`), not the textarea's keybindings, so they coexist with the focused editor. **Focus is deferred one tick** (`setTimeout(…, 0)`) because compose is opened synchronously from the reader's `c`/`r` keypress — focusing immediately would let that same character land in the editor. A confirm dialog gates submission; the editor is blurred while it's up so `Enter`/typing go to the dialog.

### Reply-count freshness (`postDetail.setRepliesCount` + SWR)

The post card title shows `repliesCount`, plumbed from the feed's `Post.repliesCount` through `PostRow`. On select, `index.ts` loads replies **stale-while-revalidate**: paint cached instantly, always refetch, reconcile the count via `detail.setRepliesCount(len, hasMore)` (shows `50+` when `meta.cursor` remains), and skip the repaint when the reply IDs are unchanged (preserves scroll/focus). Posting a reply bumps the count optimistically before the refetch.

### "Load N new entries" queue

`index.ts` polls `listPosts` and **buffers** posts newer than the feed's top (`createdAt > topMs`, deduped) instead of reordering — mirrors the nuxt web feed's queue. `postList.setNewCount(n)` shows the banner + `N` chip; `loadPending()` prepends the buffer and calls `list.selectById(prevId)` to keep the user's place. `G` runs the check on demand; posting/deleting does a full `refreshFeed` (which clears the queue).

### Snooze mode (`activity.ts`)

`markActivity()` stamps the last keypress (wired to a global `keyInput` listener); `isIdle()` is true after 10 min. **All background polling is gated on `!isIdle()`** so an unattended terminal stops hitting the API. `startIdleWatcher()` drives the header's `zzz snoozed` indicator via `onIdleChange`; `onResume` fires an immediate catch-up poll on the first keypress after idle. If you add a new periodic API call, gate it with `isIdle()`.

### Settings store (`settings/store.ts`)

Same pattern as `auth/store.ts` but for non-secret UI prefs at `~/.config/cyberspace-tui/settings.json` (currently `readerLeftPct`). `loadSettings()` is cached; `saveSettings(patch)` merges + persists best-effort (never throws). `createReaderView` takes `initialLeftPct` + `onLeftPctChange` so persistence stays out of the view.

### Known OpenTUI gotcha

Setting a `bg` on a `TextRenderable` that's the first child of a row-flex `Box` with a differing parent `backgroundColor` causes the first child to render empty. Current workaround in `ui/header.ts`: active tab uses `fg: theme.accent + attributes: BOLD` instead of a pill bg. If you need a coloured pill, wrap the Text in its own BoxRenderable with that bg.

### Password input

OpenTUI has no built-in password mask (verified against `@opentui/core` types and `examples/opentui-examples-src/input-demo.ts`). `ui/modals/login.ts` works around this by keeping the real password in a closure and rewriting the displayed value to bullets on every `INPUT` event — guarded by a `maskingUpdate` flag to avoid a feedback loop. Reuse this pattern if you add another secret-entry field; don't introduce a generic abstraction until there's a second caller.

## OpenTUI documentation sources

OpenTUI is young and its API changes often — do not rely on training-data recall. Before writing non-trivial OpenTUI code, consult these, in this order:

1. **`opentui` skill** (installed at `~/.claude/skills/opentui/`) — invoke it via the Skill tool for any TUI work (components, layout, keyboard, animations, testing). This is the primary source.
   References it ships with: `core/`, `components/`, `layout/`, `keyboard/`, `animation/`, `react/`, `solid/`, `testing/`.
2. **`examples/opentui-examples-src/`** — concrete, runnable demos (see Repository layout below). Best source for "how does X actually look in code."
3. **Context7 docs** — query via the context7 MCP with library ID `/anomalyco/opentui` (High reputation, ~785 snippets). Useful when the skill and examples don't cover a specific API. Prefer this over web search for OpenTUI.

There is no dedicated OpenTUI MCP server; the three sources above are the full set.

## Installer (`install.sh`)

POSIX `sh`, served raw from GitHub and run as `curl … | sh`. Subcommands: `install` (default), `update`/`upgrade`, `remove`/`uninstall`, `help` — through a pipe they come after `sh -s --`.

Because there is **no build step and no published release**, an install is not a binary copy: it puts the source in `~/.local/share/cyberspace-opentui`, runs `bun install` there, and writes a launcher to `~/.local/bin/cyberspace` that `exec`s `bun run $SRC/src/index.ts "$@"`. Bun is resolved inside the launcher at run time, not baked in at install time, so upgrading or moving Bun doesn't break it. If you ever add a real build or publish release binaries, this is the part to revisit.

Things that are load-bearing, not incidental:

- **Everything is inside `main()`**, called on the last line — a truncated download can't execute a half-read script.
- **Removal guards.** Every generated launcher carries the `# cyberspace-opentui-launcher` marker line and `remove` refuses to delete a file without it; `rm -rf` on the source dir only happens when `package.json` names this project. `CYBERSPACE_SRC_DIR`/`CYBERSPACE_INSTALL_DIR` are user input, so neither can be pointed at an unrelated path to delete it. Don't drop these.
- **Config survives uninstall** (`~/.config/cyberspace-tui` holds the session tokens) unless `remove --purge`.
- **git is optional** — `fetch_source` falls back to a codeload tarball. The tarball is downloaded, extracted, and validated *before* the existing install is deleted, so a failed update leaves the working copy intact.
- The install dir defaults to a **user** directory, not `/usr/local/bin`: the launcher points into `$HOME`, so a system-wide shim would only work for the installing user.

## Repository layout

- `src/` — application source (see **Module layout** above).
- `install.sh` — the `curl | sh` installer (see above).
- `references/` — read-only reference checkouts of sibling Cyberspace projects. These are **not** part of this project's build. Use them to mirror domain models, endpoints, terminology, and UX patterns. Do not import from them and do not modify them.
- `examples/opentui-examples` — prebuilt binary of the OpenTUI demo gallery; run it directly to explore widgets visually.
- `examples/opentui-examples-src/` — the **source** for those demos, sparse-checked-out from `anomalyco/opentui` at `packages/core/src/examples` (see `index.ts` for the demo registry). Read these when you need concrete, working reference code for any OpenTUI feature (input, scrollbox, select, markdown, shaders, mouse, z-index, focus, etc.). Not part of this project's build — do not import from it; copy or adapt patterns into `src/` as needed.

## Context: the Cyberspace ecosystem

This repo is the new terminal-client incarnation of Cyberspace. The wider product has several surfaces, all present under `references/`:

- `references/api` — the **backend API** this TUI will consume. Authoritative source for endpoints, request/response shapes, auth, and data models. When adding a TUI feature, start by reading the corresponding route/handler here.
- `references/tui-go` — an **earlier Go-based TUI** demo that already integrates with the API. Treat it as a working reference for API usage patterns (auth flow, endpoint choices, pagination, streaming) even though this project is TypeScript/OpenTUI and will not share code with it.
- `references/nuxt` — the **main Cyberspace website** and the most fully implemented client. Ground-truth for product behavior, naming, and UX flows when the API alone is ambiguous.
- `references/sacred` — a **simplified alternative React interface** to Cyberspace with a different layout. Useful as a second opinion on how a feature can be pared down to essentials — often closer in spirit to a TUI than the full Nuxt app.

When implementing features, cross-reference these so the TUI stays consistent with the rest of the ecosystem. Do not reimplement server or database code in this repo.
