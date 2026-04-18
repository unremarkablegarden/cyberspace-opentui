import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { mountShell, type AppShell } from "./app.ts";
import { createLoginScreen } from "./ui/modals/login.ts";
import { createReaderView, type ReaderViewHandle } from "./ui/reader/readerView.ts";
import { createProfileView, type ProfileViewHandle } from "./ui/profile/profileView.ts";
import { loadAuth } from "./auth/store.ts";
import { getSession, hydrateSession, setTokens, clearSession } from "./auth/session.ts";
import {
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
  }));
}

async function wireReader(reader: ReaderViewHandle): Promise<void> {
  let currentPostId: string | null = null;
  const repliesCache = new Map<string, Awaited<ReturnType<typeof getReplies>>["data"]>();

  reader.onPostSelected(async (row) => {
    if (!row) {
      reader.detail.setPost(null);
      return;
    }
    reader.detail.setPost({
      author: row.author,
      content: row.content,
      createdAt: row.createdAt,
      repliesCount: 0,
      topics: row.topics,
    });

    const postId = row.id;
    currentPostId = postId;

    const cached = repliesCache.get(postId);
    if (cached) {
      reader.detail.setReplies(
        cached.map((r) => ({
          id: r.replyId,
          author: r.authorUsername,
          content: r.content,
          createdAt: r.createdAt,
          parentAuthor: r.parentReplyAuthor,
        })),
      );
      return;
    }

    reader.detail.setRepliesLoading(true);

    try {
      const result = await getReplies(postId, { limit: 50 });
      if (currentPostId !== postId) return;
      repliesCache.set(postId, result.data);
      reader.detail.setReplies(
        result.data.map((r) => ({
          id: r.replyId,
          author: r.authorUsername,
          content: r.content,
          createdAt: r.createdAt,
          parentAuthor: r.parentReplyAuthor,
        })),
      );
    } catch {
      if (currentPostId !== postId) return;
      reader.detail.setReplies([]);
    }
  });

  try {
    const result = await listPosts({ limit: 50 });
    reader.setPosts(postsToRows(result.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to load feed";
    reader.detail.setPost({
      author: "system",
      content: `failed to load feed: ${message}`,
      createdAt: new Date(),
      repliesCount: 0,
    });
  }
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

const reader = createReaderView(renderer);
const profile = createProfileView(renderer);

let currentTab: Tab = "reader";
let meUser: User | null = null;

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
  profile.setLoading(true);
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
  }
}

async function loadMe(): Promise<void> {
  profile.setError(null);
  profile.setLoading(true);
  try {
    if (!meUser) meUser = await getMe();
    const posts = await getUserPosts(meUser.username, { limit: 50 });
    profile.setUser(meUser);
    profile.setPosts(postsToRows(posts.data));
  } catch (err) {
    meUser = null;
    const message = err instanceof Error ? err.message : "failed to load profile";
    profile.setError(`failed to load your profile: ${message}`);
  }
}

shell.setContent(reader.root);
reader.setActive(true);

reader.onOpenAuthor(async (row) => {
  switchTab("profile", 1);
  await loadProfile(row.author);
});

renderer.keyInput.on("keypress", (key) => {
  if (key.ctrl && key.name === "q") {
    renderer.destroy();
    process.exit(0);
  }
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

await wireReader(reader);
