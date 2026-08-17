#!/bin/sh
# cyberspace-opentui installer
#
#   curl -fsSL https://raw.githubusercontent.com/unremarkablegarden/cyberspace-opentui/main/install.sh | sh
#
# Commands (through a pipe, pass them after `sh -s --`):
#   install              install the client (default)
#   update | upgrade     fetch the latest source and reinstall dependencies
#   remove | uninstall   delete the launcher and the installed source
#   help                 show usage
#
# Environment overrides:
#   CYBERSPACE_REPO         owner/repo to install from
#   CYBERSPACE_REF          git ref to install (default: main)
#   CYBERSPACE_CMD          command name to install as (default: cyberspace)
#   CYBERSPACE_INSTALL_DIR  launcher directory (default: ~/.local/bin)
#   CYBERSPACE_SRC_DIR      source directory (default: ~/.local/share/cyberspace-opentui)
#   CYBERSPACE_NO_BUN_INSTALL=1  fail instead of installing Bun automatically

set -eu

REPO="${CYBERSPACE_REPO:-unremarkablegarden/cyberspace-opentui}"
REF="${CYBERSPACE_REF:-main}"
CMD="${CYBERSPACE_CMD:-cyberspace}"
SCRIPT_URL="https://raw.githubusercontent.com/unremarkablegarden/cyberspace-opentui/main/install.sh"
CONFIG_DIR="$HOME/.config/cyberspace-tui"

# Written into every launcher this script generates. `remove` refuses to delete
# a file that does not carry it, so a same-named command from somewhere else can
# never be uninstalled by accident.
MARKER="# cyberspace-opentui-launcher"

# There is no build step and no published release: the client runs from source
# on Bun. So an install is "put the source somewhere stable, install its
# dependencies, and drop a launcher on the PATH that runs it".

# Everything lives in main() so a truncated download can never execute a
# half-read script.
main() {
	case "${1:-install}" in
	install) cmd_install install ;;
	update | upgrade) cmd_install update ;;
	remove | uninstall) cmd_remove "${2:-}" ;;
	help | -h | --help) usage ;;
	*)
		printf 'error: unknown command: %s\n\n' "$1" >&2
		usage
		exit 1
		;;
	esac
}

usage() {
	cat >&2 <<EOF
cyberspace-opentui installer

  install              install the client (default)
  update, upgrade      fetch the latest source and reinstall dependencies
  remove, uninstall    delete the launcher and the installed source
                       (pass --purge to also delete $CONFIG_DIR)
  help                 show this message

Through a pipe, pass the command after \`sh -s --\`:

  curl -fsSL $SCRIPT_URL | sh
  curl -fsSL $SCRIPT_URL | sh -s -- update
  curl -fsSL $SCRIPT_URL | sh -s -- remove

Environment:
  CYBERSPACE_REPO         owner/repo to install from
  CYBERSPACE_REF          git ref to install (default: main)
  CYBERSPACE_CMD          command name to install as (default: cyberspace)
  CYBERSPACE_INSTALL_DIR  launcher directory (default: ~/.local/bin)
  CYBERSPACE_SRC_DIR      source directory
  CYBERSPACE_NO_BUN_INSTALL=1  fail instead of installing Bun automatically
EOF
}

cmd_install() {
	mode="$1"
	src_dir=$(resolve_src_dir)
	install_dir=$(resolve_install_dir)

	need_cmd mkdir
	need_cmd chmod
	need_cmd mktemp
	# The launcher is written from a heredoc.
	need_cmd cat
	# The source-tree guard is a grep; without it every directory would look
	# like "not a checkout" and the real reason would never surface.
	need_cmd grep

	if [ "$mode" = update ]; then
		if [ -n "$(installed_launcher)" ]; then
			say "current: $(installed_ref "$src_dir")"
		else
			say "$CMD is not installed — installing it fresh"
		fi
	fi

	ensure_bun
	fetch_source "$src_dir"
	install_deps "$src_dir"
	write_launcher "$src_dir" "$install_dir"

	say "installed $install_dir/$CMD ($(installed_ref "$src_dir"))"
	say "source: $src_dir"
	warn_path "$install_dir"
	say "run it with: $CMD"
}

# Delete the launcher and the source tree. Idempotent: removing nothing is a
# success, so this is safe to run twice or on a machine that never had it.
cmd_remove() {
	purge="${1:-}"
	removed=0

	# Both removal guards are greps; a missing grep would silently turn every
	# check into "not ours" and remove nothing, with no hint why.
	need_cmd grep

	launcher=$(installed_launcher)
	if [ -n "$launcher" ]; then
		# Only ever delete a launcher this script wrote. Anything else that
		# happens to be named `cyberspace` on the PATH belongs to someone else.
		if grep -q "$MARKER" "$launcher" 2>/dev/null; then
			remove_path "$launcher"
			say "removed $launcher"
			removed=1
		else
			say "note: $launcher was not installed by this script — leaving it alone"
		fi
	fi

	src_dir=$(resolve_src_dir)
	if [ -d "$src_dir" ]; then
		# Same guard for the source tree: CYBERSPACE_SRC_DIR is user input, and
		# an `rm -rf` of the wrong directory is unrecoverable.
		if is_our_source "$src_dir"; then
			rm -rf "$src_dir"
			say "removed $src_dir"
			removed=1
		else
			say "note: $src_dir is not a cyberspace-opentui checkout — leaving it alone"
		fi
	fi

	if [ "$purge" = "--purge" ] && [ -d "$CONFIG_DIR" ]; then
		rm -rf "$CONFIG_DIR"
		say "removed $CONFIG_DIR (saved session and settings)"
		removed=1
	fi

	if [ "$removed" -eq 0 ]; then
		say "$CMD is not installed — nothing to remove"
		return
	fi

	# Config holds the saved tokens, so it outlives an uninstall: a reinstall
	# should not force a re-login. Only mentioned when something was removed.
	if [ "$purge" != "--purge" ] && [ -d "$CONFIG_DIR" ]; then
		say "kept your config at $CONFIG_DIR — re-run with --purge to delete it"
	fi

	# A second copy earlier on the PATH would make the removal look like it failed.
	remaining=$(installed_launcher)
	if [ -n "$remaining" ]; then
		say "note: another copy is still on your PATH at $remaining"
	fi
}

say() { printf '  %s\n' "$*" >&2; }
err() {
	printf 'error: %s\n' "$*" >&2
	exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }
need_cmd() { have "$1" || err "required command not found: $1"; }

resolve_src_dir() {
	if [ -n "${CYBERSPACE_SRC_DIR:-}" ]; then
		echo "$CYBERSPACE_SRC_DIR"
	else
		echo "${XDG_DATA_HOME:-$HOME/.local/share}/cyberspace-opentui"
	fi
}

# The launcher points at a source tree under $HOME, so a system-wide directory
# would only work for the user who installed it. Default to a user directory and
# let CYBERSPACE_INSTALL_DIR override when that is genuinely wanted.
resolve_install_dir() {
	if [ -n "${CYBERSPACE_INSTALL_DIR:-}" ]; then
		echo "$CYBERSPACE_INSTALL_DIR"
	else
		echo "$HOME/.local/bin"
	fi
}

# Print the path of the installed launcher, or nothing.
#
# An explicit CYBERSPACE_INSTALL_DIR is a hard boundary: only that directory is
# considered, so `remove` can never reach outside the directory it was pointed at.
installed_launcher() {
	if [ -n "${CYBERSPACE_INSTALL_DIR:-}" ]; then
		if [ -f "$CYBERSPACE_INSTALL_DIR/$CMD" ]; then
			echo "$CYBERSPACE_INSTALL_DIR/$CMD"
		fi
		return 0
	fi

	found=$(command -v "$CMD" 2>/dev/null || true)
	if [ -n "$found" ] && [ -f "$found" ]; then
		echo "$found"
		return 0
	fi

	for dir in "$HOME/.local/bin" "$HOME/bin" /usr/local/bin; do
		if [ -f "$dir/$CMD" ]; then
			echo "$dir/$CMD"
			return 0
		fi
	done

	# Not installed. Explicit success: a failing status here would abort the
	# caller under `set -e`.
	return 0
}

# True when the directory is a checkout of this project rather than some
# unrelated path handed to CYBERSPACE_SRC_DIR.
is_our_source() {
	[ -f "$1/package.json" ] || return 1
	grep -q '"cyberspace-opentui"' "$1/package.json" 2>/dev/null
}

# A short description of what is installed, for the install/update messages.
installed_ref() {
	if [ -d "$1/.git" ] && have git; then
		ref=$(cd "$1" && git describe --tags --always 2>/dev/null || true)
		if [ -n "$ref" ]; then
			echo "$ref"
			return 0
		fi
	fi
	if [ -f "$1/package.json" ]; then
		ver=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/v\1/p' "$1/package.json" | head -n 1)
		if [ -n "$ver" ]; then
			echo "$ver"
			return 0
		fi
	fi
	echo "$REF"
}

# The client is a Bun program, so Bun is not optional. Install it with the
# official installer unless the caller asked us not to.
ensure_bun() {
	if have bun; then
		return
	fi

	# Bun's installer puts it here but cannot change the PATH of a running shell.
	if [ -x "${BUN_INSTALL:-$HOME/.bun}/bin/bun" ]; then
		PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"
		export PATH
		return
	fi

	if [ -n "${CYBERSPACE_NO_BUN_INSTALL:-}" ]; then
		err "Bun is not installed. Install it from https://bun.sh and re-run."
	fi

	say "Bun is not installed — installing it from https://bun.sh"
	have bash || err "Bun's installer needs bash — install Bun manually from https://bun.sh"
	if have curl; then
		curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 ||
			err "Bun install failed — install it manually from https://bun.sh and re-run"
	elif have wget; then
		wget -qO- https://bun.sh/install | bash >/dev/null 2>&1 ||
			err "Bun install failed — install it manually from https://bun.sh and re-run"
	else
		err "need curl or wget to install Bun"
	fi

	PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"
	export PATH
	have bun || err "Bun was installed but is not on the PATH — open a new shell and re-run"
	say "installed Bun $(bun --version)"
}

# Put the source at $1, updating it in place when it is already there. Uses git
# when available and falls back to a tarball, so this works on minimal images
# that do not ship git.
fetch_source() {
	dir="$1"
	mkdir -p "$(dirname "$dir")"

	if [ -d "$dir" ] && ! is_our_source "$dir"; then
		err "$dir exists and is not a cyberspace-opentui checkout — move it or set CYBERSPACE_SRC_DIR"
	fi

	if [ -d "$dir/.git" ] && have git; then
		say "updating source in $dir"
		(
			cd "$dir"
			git fetch --depth 1 origin "$REF" >/dev/null 2>&1 ||
				err "could not fetch $REF from origin"
			# Detached, and hard: the installed copy is not a working tree, so
			# local edits are discarded rather than left to conflict on the next
			# update.
			git checkout -q --force --detach FETCH_HEAD >/dev/null 2>&1 ||
				err "could not check out $REF"
			git clean -qfd >/dev/null 2>&1 || true
		)
		return
	fi

	if have git; then
		say "downloading source ($REPO@$REF)"
		rm -rf "$dir"
		git clone --depth 1 --branch "$REF" \
			"https://github.com/$REPO.git" "$dir" >/dev/null 2>&1 ||
			err "clone failed — check that $REPO@$REF exists"
		return
	fi

	fetch_tarball "$dir"
}

fetch_tarball() {
	dir="$1"
	need_cmd tar
	say "downloading source tarball ($REPO@$REF)"

	tmpdir=$(mktemp -d)
	trap 'rm -rf "$tmpdir"' EXIT INT TERM

	fetch "https://codeload.github.com/$REPO/tar.gz/$REF" "$tmpdir/src.tar.gz" ||
		err "download failed — check that $REPO@$REF exists"

	mkdir -p "$tmpdir/src"
	tar -xzf "$tmpdir/src.tar.gz" -C "$tmpdir/src" --strip-components=1 ||
		err "could not extract the source tarball"

	is_our_source "$tmpdir/src" || err "the downloaded archive is not cyberspace-opentui"

	# Replace the tree wholesale: without git there is nothing to merge against,
	# and a stale file left behind is worse than a slower install.
	rm -rf "$dir"
	mkdir -p "$dir"
	# Copied with tar rather than `mv`/`cp -r` so the dotfiles come along too.
	(cd "$tmpdir/src" && tar -cf - .) | (cd "$dir" && tar -xf -) ||
		err "could not move the source into $dir"

	rm -rf "$tmpdir"
	tmpdir=""
	trap - EXIT INT TERM
}

install_deps() {
	say "installing dependencies"
	# Quiet on success, but show the real output when it fails — a broken
	# install is the one time the user needs bun's own error.
	if ! (cd "$1" && bun install --silent >/dev/null 2>&1); then
		(cd "$1" && bun install) || err "bun install failed in $1"
	fi
}

# The launcher is a shim rather than a copied binary: there is no build step, so
# `cyberspace` just runs the installed source with Bun. Bun is resolved at run
# time, not install time, so the shim survives Bun being upgraded or moved.
write_launcher() {
	src_dir="$1"
	install_dir="$2"
	tmp_launcher=$(mktemp)

	cat >"$tmp_launcher" <<EOF
#!/bin/sh
$MARKER
# Generated by the cyberspace-opentui installer. Do not edit — re-run the
# installer instead:
#   curl -fsSL $SCRIPT_URL | sh -s -- update

SRC="$src_dir"

if command -v bun >/dev/null 2>&1; then
	BUN=bun
elif [ -x "\${BUN_INSTALL:-\$HOME/.bun}/bin/bun" ]; then
	BUN="\${BUN_INSTALL:-\$HOME/.bun}/bin/bun"
else
	echo "error: bun not found — install it from https://bun.sh" >&2
	exit 1
fi

exec "\$BUN" run "\$SRC/src/index.ts" "\$@"
EOF

	# Explicit mode: mktemp creates 0600, and `chmod +x` on top of that leaves a
	# launcher other users can execute but not read.
	chmod 755 "$tmp_launcher"

	mkdir -p "$install_dir" 2>/dev/null || true
	if [ -w "$install_dir" ]; then
		mv -f "$tmp_launcher" "$install_dir/$CMD"
	elif have sudo; then
		say "$install_dir is not writable — installing with sudo"
		sudo mkdir -p "$install_dir"
		sudo mv -f "$tmp_launcher" "$install_dir/$CMD"
		sudo chmod +x "$install_dir/$CMD"
	else
		rm -f "$tmp_launcher"
		err "cannot write to $install_dir — set CYBERSPACE_INSTALL_DIR to a writable directory"
	fi
}

remove_path() {
	if [ -w "$(dirname "$1")" ]; then
		rm -f "$1"
	elif have sudo; then
		say "$(dirname "$1") is not writable — removing with sudo"
		sudo rm -f "$1"
	else
		err "cannot remove $1 — no write permission and sudo is unavailable"
	fi
}

# fetch URL DEST — returns non-zero on HTTP errors; callers report the reason,
# so the downloader's own stderr is suppressed.
fetch() {
	if have curl; then
		curl -fsSL "$1" -o "$2" 2>/dev/null
	elif have wget; then
		wget -q "$1" -O "$2" 2>/dev/null
	else
		err "need curl or wget to download files"
	fi
}

warn_path() {
	case ":$PATH:" in
	*":$1:"*) ;;
	*) say "note: $1 is not on your PATH — add it with: export PATH=\"$1:\$PATH\"" ;;
	esac
}

main "$@"
