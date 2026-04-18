import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type CliRenderer,
  type Renderable,
} from "@opentui/core";
import { setContext, type Shortcut } from "../../focus/registry.ts";
import { theme } from "../../theme.ts";
import { createPostList, type PostListHandle, type PostRow } from "../reader/postList.ts";
import type { User } from "../../api/types.ts";

export interface ProfileViewHandle {
  root: BoxRenderable;
  list: PostListHandle;
  setUser(user: User | null): void;
  setPosts(rows: PostRow[]): void;
  setError(message: string | null): void;
  setLoading(loading: boolean): void;
  dispose(): void;
  setActive(active: boolean): void;
  onPostSelected(fn: (row: PostRow | null) => void): () => void;
}

const SHORTCUTS: Shortcut[] = [
  { key: "↑↓", label: "NAV" },
  { key: "Q", label: "QUIT" },
];

function formatAge(d: Date): string {
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24);
  if (dd < 365) return `${dd}d`;
  const y = Math.floor(dd / 365);
  return `${y}y`;
}

function formatStats(user: User): string {
  const parts: string[] = [];
  parts.push(`${user.postsCount ?? 0} posts`);
  parts.push(`${user.followersCount ?? 0} followers`);
  parts.push(`${user.followingCount ?? 0} following`);
  if (user.createdAt) parts.push(`joined ${formatAge(user.createdAt)} ago`);
  return parts.join(" · ");
}

export function createProfileView(renderer: CliRenderer): ProfileViewHandle {
  const root = new BoxRenderable(renderer, {
    id: "profile",
    flexDirection: "column",
    flexGrow: 1,
    backgroundColor: theme.bg,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "profile-scroll",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
    scrollX: false,
    rootOptions: { backgroundColor: theme.bg },
    wrapperOptions: { backgroundColor: theme.bg },
    viewportOptions: { backgroundColor: theme.bg },
    contentOptions: { backgroundColor: theme.bg, flexDirection: "column" },
    scrollbarOptions: { visible: false },
  });
  root.add(scrollBox);

  const managedChildren: Renderable[] = [];
  let uid = 0;
  const nextId = (prefix: string): string => `${prefix}-${uid++}`;
  let active = false;

  function clear(): void {
    for (const child of managedChildren) {
      scrollBox.remove(child.id);
      child.destroy();
    }
    managedChildren.length = 0;
  }

  function addChild(child: Renderable): void {
    scrollBox.add(child);
    managedChildren.push(child);
  }

  const list = createPostList(renderer);
  // Widen the default content column since the profile page uses the full width.
  list.setWidthPct(95);

  function renderHeader(user: User): void {
    const card = new BoxRenderable(renderer, {
      id: nextId("pf-header"),
      flexDirection: "column",
      flexShrink: 0,
      backgroundColor: theme.bg,
      border: true,
      borderStyle: "double",
      borderColor: theme.fgDim,
      title: ` @${user.username.toUpperCase()} `,
      titleAlignment: "left",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    });

    if (user.displayName && user.displayName !== user.username) {
      const display = new TextRenderable(renderer, {
        id: nextId("pf-display"),
        content: user.displayName,
        fg: theme.fg,
        bg: theme.bg,
      });
      card.add(display);
    }

    if (user.bio && user.bio.trim() !== "") {
      const bio = new TextRenderable(renderer, {
        id: nextId("pf-bio"),
        content: user.bio,
        fg: theme.fg,
        bg: theme.bg,
        wrapMode: "word",
      });
      card.add(bio);
    }

    const stats = new TextRenderable(renderer, {
      id: nextId("pf-stats"),
      content: formatStats(user),
      fg: theme.fgDim,
      bg: theme.bg,
      marginTop: 1,
    });
    card.add(stats);

    const extras: string[] = [];
    if (user.locationName) extras.push(user.locationName);
    if (user.websiteUrl) extras.push(user.websiteUrl);
    if (extras.length > 0) {
      const extra = new TextRenderable(renderer, {
        id: nextId("pf-extra"),
        content: extras.join(" · "),
        fg: theme.fgDim,
        bg: theme.bg,
      });
      card.add(extra);
    }

    addChild(card);
  }

  function renderPostsSection(): void {
    const divider = new BoxRenderable(renderer, {
      id: nextId("pf-posts-divider"),
      height: 1,
      flexShrink: 0,
      backgroundColor: theme.bg,
      border: ["top"],
      borderStyle: "single",
      borderColor: theme.fgDim,
      title: "POSTS",
      titleAlignment: "center",
    });
    addChild(divider);

    const listWrap = new BoxRenderable(renderer, {
      id: nextId("pf-list-wrap"),
      flexDirection: "column",
      flexShrink: 0,
      backgroundColor: theme.bg,
      // Give the select a fixed height so the scrollbox can scroll the page;
      // without a fixed height the select collapses inside a flex-column scrollbox.
      height: 20,
    });
    listWrap.add(list.root);
    addChild(listWrap);
  }

  function setUser(user: User | null): void {
    clear();
    if (!user) {
      const empty = new TextRenderable(renderer, {
        id: nextId("pf-empty"),
        content: "no profile loaded",
        fg: theme.fgMuted,
        bg: theme.bg,
      });
      addChild(empty);
      return;
    }
    renderHeader(user);
    renderPostsSection();
    scrollBox.scrollTo(0);
  }

  function setPosts(rows: PostRow[]): void {
    list.setRows(rows);
  }

  function setLoading(loading: boolean): void {
    if (!loading) return;
    clear();
    const msg = new TextRenderable(renderer, {
      id: nextId("pf-loading"),
      content: "loading profile…",
      fg: theme.fgMuted,
      bg: theme.bg,
    });
    addChild(msg);
  }

  function setError(message: string | null): void {
    if (!message) return;
    clear();
    const msg = new TextRenderable(renderer, {
      id: nextId("pf-error"),
      content: message,
      fg: theme.fgMuted,
      bg: theme.bg,
    });
    addChild(msg);
  }

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    if (active) {
      list.focus();
      setContext({ id: "profile", shortcuts: SHORTCUTS });
    } else {
      list.blur();
    }
  }

  function dispose(): void {
    list.blur();
  }

  function onPostSelected(fn: (row: PostRow | null) => void): () => void {
    return list.onSelectionChange(fn);
  }

  return {
    root,
    list,
    setUser,
    setPosts,
    setError,
    setLoading,
    dispose,
    setActive,
    onPostSelected,
  };
}
