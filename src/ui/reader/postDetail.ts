import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type CliRenderer,
  type Renderable,
} from "@opentui/core";
import { theme } from "../../theme.ts";

export interface PostDetailModel {
  author: string;
  content: string;
  createdAt: Date;
  repliesCount: number;
}

export interface ReplyModel {
  id: string;
  author: string;
  content: string;
  createdAt: Date;
  parentAuthor?: string;
  parentSnippet?: string;
}

export interface PostDetailHandle {
  root: BoxRenderable;
  scrollBox: ScrollBoxRenderable;
  setPost(post: PostDetailModel | null): void;
  setReplies(replies: ReplyModel[]): void;
  setRepliesLoading(loading: boolean): void;
  focus(): void;
  blur(): void;
  focusNext(): void;
  focusPrev(): void;
}

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
  return `${dd}d`;
}

function wordCount(str: string): number {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function createPostDetail(renderer: CliRenderer): PostDetailHandle {
  const root = new BoxRenderable(renderer, {
    id: "post-detail",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: theme.bg,
  });

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "post-detail-scroll",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
    scrollX: false,
    rootOptions: {
      backgroundColor: theme.bg,
    },
    wrapperOptions: {
      backgroundColor: theme.bg,
    },
    viewportOptions: {
      backgroundColor: theme.bg,
    },
    contentOptions: {
      backgroundColor: theme.bg,
      flexDirection: "column",
    },
    scrollbarOptions: {
      visible: false,
    },
  });

  root.add(scrollBox);

  const addedChildren: Renderable[] = [];
  let placeholderChild: TextRenderable | null = null;

  // Selectable cards (post + replies). focusedIdx is the index into this list.
  const selectableCards: BoxRenderable[] = [];
  let focusedIdx = -1;
  let paneHasFocus = false;

  function clearBody(): void {
    for (const child of addedChildren) {
      scrollBox.remove(child.id);
      child.destroy();
    }
    addedChildren.length = 0;
    selectableCards.length = 0;
    focusedIdx = -1;
    if (placeholderChild) {
      scrollBox.remove(placeholderChild.id);
      placeholderChild.destroy();
      placeholderChild = null;
    }
  }

  function addChild(child: Renderable): void {
    scrollBox.add(child);
    addedChildren.push(child);
  }

  function applyCardBorders(): void {
    selectableCards.forEach((card, i) => {
      const isFocused = paneHasFocus && i === focusedIdx;
      card.borderColor = isFocused ? theme.borderFocused : theme.fgDim;
    });
  }

  function setFocusedIdx(next: number): void {
    if (selectableCards.length === 0) {
      focusedIdx = -1;
      return;
    }
    const clamped = Math.max(0, Math.min(selectableCards.length - 1, next));
    if (clamped === focusedIdx) return;
    focusedIdx = clamped;
    applyCardBorders();
    const card = selectableCards[focusedIdx];
    if (card) scrollBox.scrollChildIntoView(card.id);
  }

  let uid = 0;
  const nextId = (prefix: string): string => `${prefix}-${uid++}`;

  let currentPost: PostDetailModel | null = null;

  function buildPostTitle(post: PostDetailModel): string {
    const words = wordCount(post.content);
    const age = formatAge(post.createdAt);
    return `${post.author.toUpperCase()}  —  ${words} words — ${post.repliesCount} replies — ${age}`;
  }

  function setPost(post: PostDetailModel | null): void {
    currentPost = post;
    clearBody();
    scrollBox.scrollTo(0);

    if (!post) {
      placeholderChild = new TextRenderable(renderer, {
        id: nextId("pd-placeholder"),
        content: "no post selected",
        fg: theme.fgMuted,
        bg: theme.bg,
      });
      scrollBox.add(placeholderChild);
      return;
    }

    const card = new BoxRenderable(renderer, {
      id: nextId("pd-card"),
      flexDirection: "column",
      flexShrink: 0,
      backgroundColor: theme.bg,
      border: true,
      borderStyle: "double",
      borderColor: theme.fgDim,
      title: buildPostTitle(post),
      titleAlignment: "left",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    });

    const body = new TextRenderable(renderer, {
      id: nextId("pd-body"),
      content: post.content,
      fg: theme.fg,
      bg: theme.bg,
      wrapMode: "word",
    });
    card.add(body);
    addChild(card);
    selectableCards.push(card);
    focusedIdx = paneHasFocus ? 0 : -1;
    applyCardBorders();
  }

  function setRepliesLoading(loading: boolean): void {
    if (!currentPost) return;
    // keep body, swap replies section — handled when setReplies is called
    if (loading) {
      const loadingText = new TextRenderable(renderer, {
        id: nextId("pd-loading"),
        content: "\nloading replies…",
        fg: theme.fgMuted,
        bg: theme.bg,
        marginTop: 1,
      });
      addChild(loadingText);
    }
  }

  function setReplies(replies: ReplyModel[]): void {
    if (!currentPost) return;
    // Remove any loading indicator or prior replies — keep only the body (first child)
    if (addedChildren.length > 1) {
      for (let i = addedChildren.length - 1; i >= 1; i--) {
        const child = addedChildren[i]!;
        scrollBox.remove(child.id);
        child.destroy();
        addedChildren.splice(i, 1);
      }
    }
    // Trim the post card from selectable list — we'll re-add after replies
    selectableCards.length = Math.min(selectableCards.length, 1);

    const divider = new BoxRenderable(renderer, {
      id: nextId("pd-divider"),
      height: 1,
      flexShrink: 0,
      backgroundColor: theme.bg,
      border: ["top"],
      borderStyle: "single",
      borderColor: theme.fgDim,
      title: `REPLIES (${replies.length})`,
      titleAlignment: "center",
      marginTop: 1,
      marginBottom: 1,
    });
    addChild(divider);

    if (replies.length === 0) {
      const none = new TextRenderable(renderer, {
        id: nextId("pd-noreplies"),
        content: "no replies",
        fg: theme.fgMuted,
        bg: theme.bg,
      });
      addChild(none);
      return;
    }

    for (const reply of replies) {
      const card = buildReplyCard(renderer, reply, nextId);
      addChild(card);
      selectableCards.push(card);
    }
    applyCardBorders();
  }

  function focus(): void {
    paneHasFocus = true;
    if (focusedIdx < 0 && selectableCards.length > 0) focusedIdx = 0;
    applyCardBorders();
    const card = selectableCards[focusedIdx];
    if (card) scrollBox.scrollChildIntoView(card.id);
  }
  function blur(): void {
    paneHasFocus = false;
    applyCardBorders();
  }
  function focusNext(): void {
    if (selectableCards.length === 0) return;
    setFocusedIdx(focusedIdx + 1);
  }
  function focusPrev(): void {
    if (selectableCards.length === 0) return;
    setFocusedIdx(focusedIdx - 1);
  }

  // Initial empty state
  setPost(null);

  return {
    root,
    scrollBox,
    setPost,
    setReplies,
    setRepliesLoading,
    focus,
    blur,
    focusNext,
    focusPrev,
  };
}

function buildReplyCard(
  renderer: CliRenderer,
  reply: ReplyModel,
  nextId: (prefix: string) => string,
): BoxRenderable {
  const title = `${reply.author.toUpperCase()}  —  ${formatAge(reply.createdAt)}`;
  const card = new BoxRenderable(renderer, {
    id: nextId("reply-card"),
    flexDirection: "column",
    flexShrink: 0,
    backgroundColor: theme.bg,
    border: true,
    borderStyle: "single",
    borderColor: theme.fgDim,
    title,
    titleAlignment: "left",
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 1,
  });

  if (reply.parentAuthor && reply.parentSnippet) {
    const quote = new TextRenderable(renderer, {
      id: nextId("reply-quote"),
      content: `> ${reply.parentAuthor}: ${reply.parentSnippet}`,
      fg: theme.fgMuted,
      bg: theme.bg,
      wrapMode: "word",
    });
    card.add(quote);
  }

  const body = new TextRenderable(renderer, {
    id: nextId("reply-body"),
    content: reply.content,
    fg: theme.fg,
    bg: theme.bg,
    wrapMode: "word",
  });
  card.add(body);

  return card;
}
