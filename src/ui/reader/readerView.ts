import { BoxRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";
import { setContext, type Shortcut } from "../../focus/registry.ts";
import { theme } from "../../theme.ts";
import { createPostList, type PostListHandle, type PostRow } from "./postList.ts";
import {
  createPostDetail,
  type PostDetailHandle,
  type PostDetailModel,
  type ReplyModel,
} from "./postDetail.ts";

type Pane = "list" | "detail";

export interface ReaderViewHandle {
  root: BoxRenderable;
  list: PostListHandle;
  detail: PostDetailHandle;
  setPosts(rows: PostRow[]): void;
  focusPane(pane: Pane): void;
  dispose(): void;
  onPostSelected(fn: (row: PostRow | null) => void): () => void;
  onOpenAuthor(fn: (row: PostRow) => void): () => void;
  setActive(active: boolean): void;
}

const LIST_SHORTCUTS: Shortcut[] = [
  { key: "↑↓", label: "NAV" },
  { key: "↔", label: "PANEL" },
  { key: "U", label: "AUTHOR" },
  { key: "[ ]", label: "RESIZE" },
  { key: "⌃Q", label: "QUIT" },
];

const DETAIL_SHORTCUTS: Shortcut[] = [
  { key: "↑↓", label: "NAV" },
  { key: "j k", label: "SCROLL" },
  { key: "↔", label: "PANEL" },
  { key: "[ ]", label: "RESIZE" },
  { key: "⌃Q", label: "QUIT" },
];

const MIN_LEFT_PCT = 20;
const MAX_LEFT_PCT = 80;
const RESIZE_STEP = 5;
const DEFAULT_LEFT_PCT = 45;

export function createReaderView(renderer: CliRenderer): ReaderViewHandle {
  const root = new BoxRenderable(renderer, {
    id: "reader",
    flexDirection: "row",
    flexGrow: 1,
    backgroundColor: theme.bg,
  });

  let leftPct = DEFAULT_LEFT_PCT;

  const leftPane = new BoxRenderable(renderer, {
    id: "reader-left",
    flexDirection: "column",
    width: `${leftPct}%`,
    flexShrink: 1,
    flexGrow: 0,
    backgroundColor: theme.bg,
    paddingLeft: 1,
    paddingRight: 1,
    border: ["right"],
    borderStyle: "double",
    borderColor: theme.divider,
  });

  const rightPane = new BoxRenderable(renderer, {
    id: "reader-right",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: theme.bg,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const list = createPostList(renderer);
  const detail = createPostDetail(renderer);

  leftPane.add(list.root);
  rightPane.add(detail.root);

  root.add(leftPane);
  root.add(rightPane);

  let activePane: Pane = "list";
  let active = false;
  const openAuthorListeners = new Set<(row: PostRow) => void>();

  function focusPane(pane: Pane): void {
    activePane = pane;
    if (pane === "list") {
      detail.blur();
      list.focus();
      setContext({ id: "reader.list", shortcuts: LIST_SHORTCUTS });
    } else {
      list.blur();
      detail.focus();
      setContext({ id: "reader.detail", shortcuts: DETAIL_SHORTCUTS });
    }
  }

  function cyclePane(): void {
    focusPane(activePane === "list" ? "detail" : "list");
  }

  function setLeftPct(next: number): void {
    const clamped = Math.max(MIN_LEFT_PCT, Math.min(MAX_LEFT_PCT, next));
    if (clamped === leftPct) return;
    leftPct = clamped;
    leftPane.width = `${leftPct}%`;
    list.setWidthPct(leftPct);
  }

  const keyHandler = (key: KeyEvent) => {
    if (!active) return;
    if (key.name === "tab") {
      cyclePane();
      return;
    }
    if (key.sequence === "[" || key.name === "[") {
      setLeftPct(leftPct - RESIZE_STEP);
      return;
    }
    if (key.sequence === "]" || key.name === "]") {
      setLeftPct(leftPct + RESIZE_STEP);
      return;
    }
    if (activePane === "list" && (key.sequence === "u" || key.name === "u")) {
      const row = list.getSelected();
      if (row) {
        for (const fn of openAuthorListeners) fn(row);
      }
      return;
    }
    if (activePane === "detail") {
      if (key.name === "up") {
        detail.focusPrev();
        return;
      }
      if (key.name === "down") {
        detail.focusNext();
        return;
      }
      if (key.sequence === "j" || key.name === "j") {
        detail.scrollBy(1);
        return;
      }
      if (key.sequence === "k" || key.name === "k") {
        detail.scrollBy(-1);
        return;
      }
    }
    // Left/right switch panes — but only when the event isn't captured by a focused input.
    // Select + ScrollBox consume up/down but not left/right, so we can use them here safely.
    if (key.name === "left" && activePane === "detail") {
      focusPane("list");
      return;
    }
    if (key.name === "right" && activePane === "list") {
      focusPane("detail");
      return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  function setPosts(rows: PostRow[]): void {
    list.setRows(rows);
  }

  function onPostSelected(fn: (row: PostRow | null) => void): () => void {
    return list.onSelectionChange(fn);
  }

  function onOpenAuthor(fn: (row: PostRow) => void): () => void {
    openAuthorListeners.add(fn);
    return () => openAuthorListeners.delete(fn);
  }

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    if (active) {
      // Republish the current pane's shortcuts when the view re-activates.
      setContext(
        activePane === "list"
          ? { id: "reader.list", shortcuts: LIST_SHORTCUTS }
          : { id: "reader.detail", shortcuts: DETAIL_SHORTCUTS },
      );
    }
  }

  function dispose(): void {
    renderer.keyInput.off("keypress", keyHandler);
  }

  // Default focus
  focusPane("list");

  return {
    root,
    list,
    detail,
    setPosts,
    focusPane,
    dispose,
    onPostSelected,
    onOpenAuthor,
    setActive,
  };
}

export type { PostRow, PostDetailModel, ReplyModel };
