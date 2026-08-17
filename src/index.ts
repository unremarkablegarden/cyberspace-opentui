import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { mountShell, type AppShell } from "./app.ts";
import { createLoginScreen } from "./ui/modals/login.ts";
import { createComposeScreen, type ComposeOptions } from "./ui/modals/compose.ts";
import { createConfirmDialog } from "./ui/modals/confirm.ts";
import { createLoadingOverlay } from "./ui/modals/loading.ts";
import {
  createReaderView,
  type FocusedDetailItem,
  type ReaderViewHandle,
} from "./ui/reader/readerView.ts";
import { createProfileView } from "./ui/profile/profileView.ts";
import { loadAuth } from "./auth/store.ts";
import { loadSettings, saveSettings } from "./settings/store.ts";
import { isIdle, markActivity, onIdleChange, onResume, startIdleWatcher } from "./activity.ts";
import { getSession, hydrateSession, setTokens, clearSession } from "./auth/session.ts";
import {
  deletePost,
  deleteReply,
  getMe,
  getReplies,
  getUser,
  getUserPosts,
  listPosts,
  refreshToken,
} from "./api/endpoints.ts";
import type { Post, User } from "./api/types.ts";

type Tab = "reader" | "profile";

async function restoreSession(): Promise<boolean> {
  const stored = await loadAuth();
  if (!stored) return false;
  hydrateSession(stored);
  try {
    const fresh = await refreshToken(stored.refreshToken);
    setTokens({ idToken: fresh.idToken, refreshToken: stored.refreshToken });
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function postsToRows(posts: Post[]) {
  return posts.map((p) => ({
    id: p.postId,
    author: p.authorUsername,
    content: p.content,
    createdAt: p.createdAt,
    hasAudio: p.hasAudioAttachment,
    topics: p.topics,
    repliesCount: p.repliesCount,
  }));
}

interface ReaderWiring {
  refreshFeed(): Promise<void>;
  refreshReplies(postId: string): Promise<void>;
  optimisticBumpReplies(postId: string): void;
  checkNewPosts(): Promise<void>;
  loadPending(): void;
  currentPostId(): string | null;
}

async function wireReader(reader: ReaderViewHandle): Promise<ReaderWiring> {
  let currentPostId: string | null = null;
  // The posts currently shown in the feed, and buffered posts newer than the top
  // that haven't been merged in yet (the "Load N new entries" queue).
  let displayedPosts: Post[] = [];
  let topMs = 0;
  const displayedIds = new Set<string>();
  const pending: Post[] = [];
  const pendingIds = new Set<string>();

  function setFeed(posts: Post[]): void {
    displayedPosts = posts;
    displayedIds.clear();
    for (const p of posts) displayedIds.add(p.postId);
    topMs = posts.length ? posts[0]!.createdAt.getTime() : 0;
    pending.length = 0;
    pendingIds.clear();
    reader.setPosts(postsToRows(posts));
    reader.setNewPostsCount(0);
  }

  async function checkNewPosts(): Promise<void> {
    const result = await listPosts({ limit: 50 });
    let added = false;
    for (const p of result.data) {
      if (p.createdAt.getTime() > topMs && !displayedIds.has(p.postId) && !pendingIds.has(p.postId)) {
        pending.push(p);
        pendingIds.add(p.postId);
        added = true;
      }
    }
    if (added) {
      pending.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      reader.setNewPostsCount(pending.length);
    }
  }

  function loadPending(): void {
    if (pending.length === 0) return;
    const prevId = reader.list.getSelected()?.id ?? null;
    setFeed([...pending, ...displayedPosts]);
    if (prevId) reader.list.selectById(prevId);
  }
  const repliesCache = new Map<string, Awaited<ReturnType<typeof getReplies>>["data"]>();

  type CachedReply = Awaited<ReturnType<typeof getReplies>>["data"][number];
  const toReplyModels = (data: CachedReply[]) =>
    data.map((r) => ({
      id: r.replyId,
      author: r.authorUsername,
      content: r.content,
      createdAt: r.createdAt,
      parentAuthor: r.parentReplyAuthor,
    }));
  const sameReplies = (a: CachedReply[], b: CachedReply[]) =>
    a.length === b.length && a.every((r, i) => r.replyId === b[i]!.replyId);

  // Stale-while-revalidate: paint the cached replies instantly (if any), then
  // always refetch in the background, reconcile the count, and only repaint the
  // list when the data actually changed (so scroll/focus is preserved).
  async function loadReplies(postId: string): Promise<void> {
    const cached = repliesCache.get(postId);
    if (cached) {
      reader.detail.setReplies(toReplyModels(cached));
      reader.detail.setRepliesCount(cached.length);
    } else {
      reader.detail.setRepliesLoading(true);
    }

    try {
      const result = await getReplies(postId, { limit: 50 });
      if (currentPostId !== postId) return;
      const prev = repliesCache.get(postId);
      repliesCache.set(postId, result.data);
      if (!prev || !sameReplies(prev, result.data)) {
        reader.detail.setReplies(toReplyModels(result.data));
      }
      reader.detail.setRepliesCount(result.data.length, !!result.meta?.cursor);
    } catch {
      if (currentPostId !== postId) return;
      if (!cached) reader.detail.setReplies([]);
    }
  }

  reader.onPostSelected(async (row) => {
    if (!row) {
      reader.detail.setPost(null);
      return;
    }
    reader.detail.setPost({
      postId: row.id,
      author: row.author,
      content: row.content,
      createdAt: row.createdAt,
      repliesCount: row.repliesCount ?? 0,
      topics: row.topics,
    });

    currentPostId = row.id;
    await loadReplies(row.id);
  });

  async function refreshFeed(): Promise<void> {
    const result = await listPosts({ limit: 50 });
    setFeed(result.data);
  }

  try {
    await refreshFeed();
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to load feed";
    reader.detail.setPost({
      postId: "",
      author: "system",
      content: `failed to load feed: ${message}`,
      createdAt: new Date(),
      repliesCount: 0,
    });
  }

  return {
    refreshFeed,
    refreshReplies: (postId: string) => loadReplies(postId),
    optimisticBumpReplies: (postId: string) => {
      if (currentPostId !== postId) return;
      const n = (repliesCache.get(postId)?.length ?? 0) + 1;
      reader.detail.setRepliesCount(n);
    },
    checkNewPosts,
    loadPending,
    currentPostId: () => currentPostId,
  };
}

async function showLogin(renderer: CliRenderer, shell: AppShell): Promise<void> {
  while (true) {
    const loginScreen = createLoginScreen(renderer);
    shell.setContent(loginScreen.root);
    try {
      await loginScreen.done;
      loginScreen.dispose();
      return;
    } catch (err) {
      loginScreen.dispose();
      if (err instanceof Error && err.message === "login cancelled") {
        renderer.destroy();
        return;
      }
      // unexpected — retry
    }
  }
}

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const shell = mountShell(renderer);

const restored = await restoreSession();
if (!restored || !getSession()) {
  await showLogin(renderer, shell);
}

const settings = await loadSettings();
let currentTab: Tab = "reader";
let meUser: User | null = null;

const reader = createReaderView(renderer, {
  initialLeftPct: settings.readerLeftPct,
  onLeftPctChange: (pct) => {
    void saveSettings({ readerLeftPct: pct });
  },
  currentUsername: () => meUser?.username ?? null,
});
const profile = createProfileView(renderer);

async function ensureMe(): Promise<void> {
  if (meUser) return;
  try {
    meUser = await getMe();
  } catch {
    meUser = null;
  }
}
// Load the current user eagerly so the DELETE chip can appear on own content.
void ensureMe().then(() => reader.refreshShortcuts());

function switchTab(next: Tab, tabIdx: number): void {
  if (currentTab === next) return;
  currentTab = next;
  if (next === "reader") {
    profile.setActive(false);
    shell.setContent(reader.root);
    reader.setActive(true);
  } else {
    reader.setActive(false);
    shell.setContent(profile.root);
    profile.setActive(true);
  }
  shell.header.setActiveTab(tabIdx);
}

async function loadProfile(username: string): Promise<void> {
  profile.setError(null);
  const loading = createLoadingOverlay(renderer, "Loading profile");
  try {
    const [user, posts] = await Promise.all([
      getUser(username),
      getUserPosts(username, { limit: 50 }),
    ]);
    profile.setUser(user);
    profile.setPosts(postsToRows(posts.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to load profile";
    profile.setError(`failed to load @${username}: ${message}`);
  } finally {
    loading.dispose();
  }
}

async function loadMe(): Promise<void> {
  profile.setError(null);
  const loading = createLoadingOverlay(renderer, "Loading profile");
  try {
    if (!meUser) meUser = await getMe();
    const posts = await getUserPosts(meUser.username, { limit: 50 });
    profile.setUser(meUser);
    profile.setPosts(postsToRows(posts.data));
  } catch (err) {
    meUser = null;
    const message = err instanceof Error ? err.message : "failed to load profile";
    profile.setError(`failed to load your profile: ${message}`);
  } finally {
    loading.dispose();
  }
}

shell.setContent(reader.root);
reader.setActive(true);

reader.onOpenAuthor(async (row) => {
  switchTab("profile", 1);
  await loadProfile(row.author);
});

let modalOpen = false;

async function openCompose(opts: ComposeOptions): Promise<void> {
  if (modalOpen) return;
  modalOpen = true;
  const wasReader = currentTab === "reader";
  // The compose screen mounts itself as a transparent overlay on top of the
  // current view, so we only need to pause the underlying view's key handling.
  reader.setActive(false);
  profile.setActive(false);

  // Mounting the overlay is inside the try as well: a throw from the factory
  // would otherwise leave modalOpen set and both views inactive. It is declared
  // out here so the finally can still dispose it once it exists.
  let screen: ReturnType<typeof createComposeScreen> | undefined;
  try {
    screen = createComposeScreen(renderer, opts);
    const result = await screen.done;
    if (result?.mode === "entry") {
      await wiring.refreshFeed();
    } else if (result?.mode === "reply" && opts.postId) {
      // Optimistically tick the count up, then refetch to reconcile + show it.
      wiring.optimisticBumpReplies(opts.postId);
      if (wiring.currentPostId() === opts.postId) {
        await wiring.refreshReplies(opts.postId);
      }
    }
  } finally {
    screen?.dispose();
    if (wasReader) reader.setActive(true);
    else profile.setActive(true);
    modalOpen = false;
  }
}

reader.onCompose(() => {
  void openCompose({ mode: "entry", contextLabel: "New entry" });
});

reader.onReply((row) => {
  void openCompose({
    mode: "reply",
    postId: row.id,
    contextLabel: `Replying to @${row.author}`,
    contextSnippet: row.content,
  });
});

async function deleteItem(item: FocusedDetailItem): Promise<void> {
  if (modalOpen) return;
  await ensureMe();
  // Only offer delete on the user's own content.
  if (!meUser || item.author !== meUser.username) return;

  modalOpen = true;
  reader.setActive(false);
  // Everything below runs under a finally, like openCompose: `modalOpen` gates
  // the global keys and `setActive(false)` mutes the reader, so a throw that
  // skipped the restore would leave the app permanently deaf to input with no
  // modal on screen to explain why.
  try {
    const confirm = createConfirmDialog(renderer, {
      title: item.kind === "post" ? "DELETE ENTRY" : "DELETE REPLY",
      message: "Are you sure?",
    });
    let ok = false;
    try {
      ok = await confirm.done;
    } finally {
      confirm.dispose();
    }

    if (ok) {
      const loading = createLoadingOverlay(renderer, "Deleting");
      try {
        if (item.kind === "post") {
          await deletePost(item.id);
          await wiring.refreshFeed();
        } else {
          await deleteReply(item.id);
          const pid = wiring.currentPostId();
          if (pid) await wiring.refreshReplies(pid);
        }
      } catch {
        // best-effort; a failed delete leaves the item in place
      } finally {
        loading.dispose();
      }
    }
  } finally {
    reader.setActive(true);
    modalOpen = false;
  }
}

reader.onDelete((item) => {
  void deleteItem(item);
});

// Manual refresh (G): check for new posts now, and refresh the open post's replies.
reader.onRefresh(() => {
  if (modalOpen) return;
  void wiring.checkNewPosts();
  const pid = wiring.currentPostId();
  if (pid) void wiring.refreshReplies(pid);
});

// Load the buffered new posts (N / banner).
reader.onLoadNew(() => {
  if (modalOpen) return;
  wiring.loadPending();
});

// Background freshness, both gated on activity so an idle client goes quiet
// (snooze mode) instead of polling the API forever.
function pollReplies(): void {
  if (isIdle() || modalOpen || currentTab !== "reader") return;
  const pid = wiring.currentPostId();
  if (pid) void wiring.refreshReplies(pid);
}
function pollNewPosts(): void {
  if (isIdle() || currentTab !== "reader") return;
  void wiring.checkNewPosts();
}
setInterval(pollReplies, 30_000);
setInterval(pollNewPosts, 60_000);

// Every keypress counts as activity; returning from idle triggers an immediate
// catch-up so the user isn't left staring at stale data.
renderer.keyInput.on("keypress", () => markActivity());
onResume(() => {
  pollNewPosts();
  pollReplies();
});
onIdleChange((idle) => shell.header.setSnoozed(idle));
startIdleWatcher();

renderer.keyInput.on("keypress", (key) => {
  if (key.ctrl && key.name === "q") {
    renderer.destroy();
    process.exit(0);
  }
  if (modalOpen) return;
  if (key.ctrl && key.name === "r") {
    switchTab("reader", 0);
    return;
  }
  if (key.ctrl && key.name === "p") {
    switchTab("profile", 1);
    void loadMe();
    return;
  }
});

const wiring = await wireReader(reader);
