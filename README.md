![TUI](https://raw.githubusercontent.com/unremarkablegarden/cyberspace-opentui/refs/heads/main/tui.png)

# Cyberspace OpenTUI

Terminal client for [Cyberspace](https://cyberspace.online). 
A two-pane, Norton-Commander-inspired reader built on [OpenTUI](https://github.com/anomalyco/opentui) and Bun.

## What's in it

- **Reader** — list of latest posts on the left, selected post + replies on the right. Post bodies and replies are rendered as markdown (headings, bold, italic, code, lists, links). Arrow keys navigate cards; `j`/`k` scrolls; Tab or ← → switches pane focus.
- **Profile** — your own profile (or an author you opened from the reader). Shows stats, bio, location, and the user's posts.
- **Login** — email/password against `POST /v1/auth/login`. Tokens persisted to `~/.config/cyberspace-tui/auth.json` (0600). Automatic refresh on startup and on any 401.
- **Context-aware footer** — shortcuts shown at the bottom always reflect the currently focused surface.

Compose/reply/bookmarks are not wired yet. Inline image rendering is not implemented.

## Dependencies

- Bun
- Typescript
- OpenTUI

## Run

```bash
bun install
bun dev
```

Note: You need [API](https://api.cyberspace.online/docs) access enabled on your [Cyberspace](https://cyberspace.online/) account to use it. While this is in beta you need to request it from [@genghis_khan](https://cyberspace.online/genghis_khan). 

First launch shows the sign-in card. Successful login stores your tokens locally; subsequent launches drop you straight into the reader.

Keys:

| Context | Keys |
|---------|------|
| Anywhere | `⌃R` Reader · `⌃P` Profile · `Q` quit |
| Login | Tab switches field · Enter advances / submits · Esc quits |
| Reader — list focused | `↑ ↓` navigate · `→` or Tab switches to detail · `U` open author · `[ ]` resize |
| Reader — detail focused | `↑ ↓` navigate cards · `j k` scroll · `←` or Tab switches to list |

## Configuration

| What | Where |
|------|-------|
| API base URL | hard-coded to `https://api.cyberspace.online` in `src/api/client.ts` |
| Token storage | `~/.config/cyberspace-tui/auth.json` (0600) |
| Theme | `src/theme.ts` |

Sign out by deleting the auth file:

```bash
rm ~/.config/cyberspace-tui/auth.json
```

## Type-check

```bash
bunx tsc --noEmit
```

No build step — Bun runs `src/index.ts` directly.
