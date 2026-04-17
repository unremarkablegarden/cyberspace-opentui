import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
  type SelectOption,
} from "@opentui/core";
import { theme } from "../../theme.ts";

export interface PostRow {
  id: string;
  author: string;
  content: string;
  createdAt: Date;
  hasAudio?: boolean;
}

export interface PostListHandle {
  root: BoxRenderable;
  select: SelectRenderable;
  setRows(rows: PostRow[]): void;
  getSelected(): PostRow | null;
  onSelectionChange(fn: (row: PostRow | null) => void): () => void;
  focus(): void;
  blur(): void;
  setWidthPct(pct: number): void;
}

const USER_COL = 20;
const TIME_COL = 5;

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, Math.max(0, max - 1)) + "…";
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

function rowToLabel(row: PostRow, contentWidth: number): string {
  const user = truncate(`@${row.author}`, USER_COL).padEnd(USER_COL);
  const audioTag = row.hasAudio ? "[AUDIO] " : "";
  const rawContent = row.content.replace(/\s+/g, " ").trim();
  const content = audioTag + rawContent;
  const contentCell = truncate(content, Math.max(5, contentWidth)).padEnd(Math.max(5, contentWidth));
  const age = formatAge(row.createdAt).padStart(TIME_COL);
  return `${user} ${contentCell} ${age}`;
}

export function createPostList(renderer: CliRenderer): PostListHandle {
  const root = new BoxRenderable(renderer, {
    id: "post-list",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: theme.bg,
  });

  const headerRow = new BoxRenderable(renderer, {
    id: "post-list-header",
    flexDirection: "row",
    height: 1,
    backgroundColor: theme.bg,
    paddingLeft: 1,
    paddingRight: 1,
    flexShrink: 0,
  });

  const userHeader = new TextRenderable(renderer, {
    id: "post-list-header-user",
    content: "USER".padEnd(USER_COL),
    fg: theme.fgMuted,
    bg: theme.bg,
  });
  const contentHeader = new TextRenderable(renderer, {
    id: "post-list-header-content",
    content: " CONTENT",
    fg: theme.fgMuted,
    bg: theme.bg,
    flexGrow: 1,
  });
  const timeHeader = new TextRenderable(renderer, {
    id: "post-list-header-time",
    content: "TIME".padStart(TIME_COL),
    fg: theme.fgMuted,
    bg: theme.bg,
  });

  headerRow.add(userHeader);
  headerRow.add(contentHeader);
  headerRow.add(timeHeader);

  const select = new SelectRenderable(renderer, {
    id: "post-list-select",
    flexGrow: 1,
    flexShrink: 1,
    options: [],
    showDescription: false,
    showScrollIndicator: true,
    wrapSelection: false,
    backgroundColor: theme.bg,
    focusedBackgroundColor: theme.bg,
    textColor: theme.fg,
    focusedTextColor: theme.fg,
    selectedBackgroundColor: theme.accent,
    selectedTextColor: theme.accentFg,
    fastScrollStep: 10,
  });

  root.add(headerRow);
  root.add(select);

  let rows: PostRow[] = [];
  let widthPct = 45;
  const changeListeners = new Set<(row: PostRow | null) => void>();

  function computeContentWidth(): number {
    const termWidth = renderer.width;
    const paneWidth = Math.floor(termWidth * (widthPct / 100));
    // paneWidth − 1 right border − 2 horizontal padding − 2 select indicator − 1 scrollbar
    const usable = paneWidth - 6;
    return Math.max(10, usable - USER_COL - TIME_COL - 2);
  }

  function buildOptions(): SelectOption[] {
    const w = computeContentWidth();
    return rows.map((row) => ({
      name: rowToLabel(row, w),
      description: "",
      value: row.id,
    }));
  }

  function setRows(next: PostRow[]): void {
    rows = next;
    const prevIndex = select.getSelectedIndex();
    select.options = buildOptions();
    if (rows.length > 0) {
      const idx = Math.min(Math.max(0, prevIndex), rows.length - 1);
      select.setSelectedIndex(idx);
    }
    emitChange();
  }

  function getSelected(): PostRow | null {
    const idx = select.getSelectedIndex();
    if (idx < 0) return null;
    return rows[idx] ?? null;
  }

  function emitChange(): void {
    const row = getSelected();
    for (const fn of changeListeners) fn(row);
  }

  select.on(SelectRenderableEvents.SELECTION_CHANGED, () => emitChange());

  function onSelectionChange(fn: (row: PostRow | null) => void): () => void {
    changeListeners.add(fn);
    return () => changeListeners.delete(fn);
  }

  renderer.on("resize", () => {
    if (rows.length === 0) return;
    select.options = buildOptions();
  });

  function setWidthPct(pct: number): void {
    if (pct === widthPct) return;
    widthPct = pct;
    if (rows.length === 0) return;
    select.options = buildOptions();
  }

  return {
    root,
    select,
    setRows,
    getSelected,
    onSelectionChange,
    focus: () => select.focus(),
    blur: () => select.blur(),
    setWidthPct,
  };
}
