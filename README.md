![TUI](https://raw.githubusercontent.com/unremarkablegarden/cyberspace-opentui/refs/heads/main/tui.png)

# Cyberspace OpenTUI

Terminal client for [Cyberspace](https://cyberspace.online). 
A two-pane, Norton-Commander-inspired reader built on [OpenTUI](https://github.com/anomalyco/opentui) and Bun.

## What's in it

- **Reader** — list of latest posts on the left, selected post + replies on the right. Post bodies and replies are rendered as markdown (headings, bold, italic, code, lists, links). Arrow keys navigate cards; Tab or ← → switches pane focus. Reply counts stay current, and a **"Load N new entries"** banner appears when newer posts arrive (`N` merges them without losing your place).
- **Compose & reply** — `C` writes a new entry, `R` replies to the selected post. Multi-line editor, `⌃S` to post (with a confirm), `Esc` to cancel.
- **Delete** — `D` removes your own post or reply (with a confirm). The delete option only shows on content you authored.
- **Profile** — your own profile (or an author you opened from the reader). Shows stats, bio, location, and the user's posts.
- **Login** — email/password against `POST /v1/auth/login`. Tokens persisted to `~/.config/cyberspace-tui/auth.json` (0600). Automatic refresh on startup and on any 401.
- **Snooze mode** — after 10 minutes idle, background polling pauses (shown as `zzz snoozed` in the header) so an unattended terminal stops hitting the API. Any keypress resumes it.
- **Context-aware footer** — shortcuts shown at the bottom always reflect the currently focused surface.

Bookmarks and inline image rendering are not implemented yet.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/unremarkablegarden/cyberspace-opentui/main/install.sh | sh
```

Then run it with `cyberspace`.

The installer puts the source in `~/.local/share/cyberspace-opentui` and a `cyberspace` launcher in `~/.local/bin`. There's no build step — the launcher runs the source with Bun — so Bun is installed for you if you don't already have it. Nothing needs root.

### Update and remove

The same script takes a command; through a pipe, pass it after `sh -s --`:

```bash
# update to the latest main
curl -fsSL https://raw.githubusercontent.com/unremarkablegarden/cyberspace-opentui/main/install.sh | sh -s -- update

# uninstall
curl -fsSL https://raw.githubusercontent.com/unremarkablegarden/cyberspace-opentui/main/install.sh | sh -s -- remove
```

`update` and `upgrade` are the same command, as are `remove` and `uninstall`. `sh -s -- help` lists everything.

`remove` deletes the launcher and the installed source but keeps `~/.config/cyberspace-tui`, so reinstalling doesn't make you sign in again. Pass `--purge` (`sh -s -- remove --purge`) to delete that too.

Both commands are safe to run more than once, and neither will touch a `cyberspace` on your PATH that this installer didn't write.

### Installer options

| Variable | Default | What it does |
|----------|---------|--------------|
| `CYBERSPACE_INSTALL_DIR` | `~/.local/bin` | where the launcher goes |
| `CYBERSPACE_SRC_DIR` | `~/.local/share/cyberspace-opentui` | where the source goes |
| `CYBERSPACE_CMD` | `cyberspace` | the command name to install as |
| `CYBERSPACE_REF` | `main` | branch or tag to install |
| `CYBERSPACE_REPO` | `unremarkablegarden/cyberspace-opentui` | fork to install from |
| `CYBERSPACE_NO_BUN_INSTALL` | unset | set it to fail instead of installing Bun |

## Dependencies

- Bun
- Typescript
- OpenTUI

## Run from source

```bash
bun install
bun dev
```

Note: You need [API](https://api.cyberspace.online/docs) access enabled on your [Cyberspace](https://cyberspace.online/) account to use it. While this is in beta you need to request it from [@genghis_khan](https://cyberspace.online/genghis_khan), or you need to be a [supporter](http://cyberspace.online/support).

First launch shows the sign-in card. Successful login stores your tokens locally; subsequent launches drop you straight into the reader.

Keys:

| Context | Keys |
|---------|------|
| Anywhere | `⌃R` Reader · `⌃P` Profile · `⌃Q` quit |
| Login | Tab switches field · Enter advances / submits · Esc quits |
| Reader | `C` new entry · `R` reply · `D` delete own · `G` refresh · `N` load new entries · `U` open author · `[ ]` resize |
| Reader — list focused | `↑ ↓` navigate · `→` or Tab switches to detail |
| Reader — detail focused | `↑ ↓` navigate cards · `←` or Tab switches to list |
| Compose | `⌃S` post · `Esc` cancel |
| Confirm dialog | `← →` / `Tab` move · `Enter` yes · `Esc` no |

## Configuration

| What | Where |
|------|-------|
| API base URL | hard-coded to `https://api.cyberspace.online` in `src/api/client.ts` |
| Token storage | `~/.config/cyberspace-tui/auth.json` (0600) |
| Settings (reader column width) | `~/.config/cyberspace-tui/settings.json` |
| Theme | `src/theme.ts` |
| Installed source (installer) | `~/.local/share/cyberspace-opentui` |
| Launcher (installer) | `~/.local/bin/cyberspace` |

Sign out by deleting the auth file:

```bash
rm ~/.config/cyberspace-tui/auth.json
```

## Type-check

```bash
bunx tsc --noEmit
```

No build step — Bun runs `src/index.ts` directly.
