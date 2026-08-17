import {
  BoxRenderable,
  MarkdownRenderable,
  TextareaRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import { setContext } from "../../focus/registry.ts";
import { theme } from "../../theme.ts";
import { cleanMarkdown, postSyntaxStyle } from "../markdown.ts";
import { createConfirmDialog } from "./confirm.ts";
import { createPost, createReply } from "../../api/endpoints.ts";
import { ApiError } from "../../api/client.ts";

const MAX_CONTENT = 32768;
const ERROR_FG = "#ff6b6b";

export type ComposeMode = "entry" | "reply";

export interface ComposeOptions {
  mode: ComposeMode;
  /** For reply mode: the post being replied to. */
  postId?: string;
  /** Header line, e.g. "New entry" or "Replying to @alice". */
  contextLabel?: string;
  /** For reply mode: a dim quoted excerpt of the parent post. */
  contextSnippet?: string;
}

export type ComposeResult =
  | { mode: "entry"; postId: string; slug: string; title?: string }
  | { mode: "reply"; replyId: string };

export interface ComposeHandle {
  root: BoxRenderable;
  /** Resolves with the created resource, or null if the user cancelled. */
  done: Promise<ComposeResult | null>;
  dispose(): void;
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function createComposeScreen(renderer: CliRenderer, opts: ComposeOptions): ComposeHandle {
  const root = new BoxRenderable(renderer, {
    id: "compose-screen",
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 1800,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    // Transparent backdrop — the reader stays visible behind the card.
    backgroundColor: "transparent",
  });

  const card = new BoxRenderable(renderer, {
    id: "compose-card",
    width: 72,
    flexDirection: "column",
    border: true,
    borderStyle: "double",
    borderColor: theme.fgDim,
    focusedBorderColor: theme.accent,
    title: opts.mode === "entry" ? "NEW ENTRY" : "REPLY",
    titleAlignment: "left",
    padding: 1,
    backgroundColor: theme.bg,
  });

  if (opts.contextLabel) {
    card.add(
      new TextRenderable(renderer, {
        id: "compose-context-label",
        content: opts.contextLabel,
        fg: theme.accent,
        bg: theme.bg,
        marginBottom: opts.contextSnippet ? 0 : 1,
      }),
    );
  }

  if (opts.contextSnippet) {
    // Render the quoted parent as markdown (a blockquote) so *bold*/_italic_/etc.
    // show formatted rather than as raw source. Reuses the reader's syntax style.
    card.add(
      new MarkdownRenderable(renderer, {
        id: "compose-context-snippet",
        content: `> ${cleanMarkdown(truncate(opts.contextSnippet, 160))}`,
        syntaxStyle: postSyntaxStyle,
        fg: theme.fgMuted,
        bg: theme.bg,
        conceal: true,
        width: "100%",
        marginBottom: 1,
      }),
    );
  }

  const editor = new TextareaRenderable(renderer, {
    id: "compose-body",
    height: 12,
    wrapMode: "word",
    showCursor: true,
    textColor: theme.fg,
    backgroundColor: theme.bg,
    focusedBackgroundColor: theme.bg,
    cursorColor: theme.accent,
    selectionBg: theme.accentDim,
    selectionFg: theme.fg,
    placeholder: opts.mode === "entry" ? "Write your entry…" : "Write your reply…",
    placeholderColor: theme.fgDim,
  });

  const status = new TextRenderable(renderer, {
    id: "compose-status",
    content: "",
    fg: theme.fgMuted,
    bg: theme.bg,
    marginTop: 1,
  });

  card.add(editor);
  card.add(status);
  root.add(card);
  renderer.root.add(root);

  let submitting = false;
  let confirming = false;
  let resolve: (result: ComposeResult | null) => void = () => {};

  const done = new Promise<ComposeResult | null>((res) => {
    resolve = res;
  });

  function setStatus(message: string, isError = false): void {
    status.content = message;
    status.fg = isError ? ERROR_FG : theme.fgMuted;
  }

  async function submit(): Promise<void> {
    if (submitting || confirming) return;
    const content = editor.plainText.trim();
    if (!content) {
      setStatus("content cannot be empty", true);
      return;
    }
    if (content.length > MAX_CONTENT) {
      setStatus(`too long: ${content.length}/${MAX_CONTENT}`, true);
      return;
    }

    // Confirm before hitting the API. Blur the editor so Enter/typing goes to the
    // dialog, not the textarea underneath.
    confirming = true;
    setStatus("confirm to post…");
    editor.blur();
    // Mounting the dialog is inside the try: `confirming` routes keys away from
    // the editor, so a throw before the reset would leave the compose screen
    // unable to type or submit.
    let confirm: ReturnType<typeof createConfirmDialog> | undefined;
    let ok = false;
    try {
      confirm = createConfirmDialog(renderer, {
        title: opts.mode === "entry" ? "POST ENTRY" : "POST REPLY",
        message: "Are you sure?",
      });
      ok = await confirm.done;
    } finally {
      confirm?.dispose();
      confirming = false;
    }
    if (!ok) {
      editor.focus();
      setStatus("");
      return;
    }

    submitting = true;
    setStatus("posting…");
    try {
      if (opts.mode === "entry") {
        const res = await createPost({ content });
        resolve({ mode: "entry", postId: res.postId, slug: res.slug, title: res.title });
      } else {
        const res = await createReply({ postId: opts.postId!, content });
        resolve({ mode: "reply", replyId: res.replyId });
      }
    } catch (err) {
      submitting = false;
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "failed to post";
      setStatus(message, true);
    }
  }

  const keyHandler = (key: KeyEvent) => {
    // While the confirm dialog is up, it owns Enter/Esc.
    if (confirming) return;
    if (key.ctrl && key.name === "s") {
      void submit();
      return;
    }
    if (key.name === "escape") {
      resolve(null);
      return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  setContext({
    id: "compose",
    shortcuts: [
      { key: "⌃S", label: "POST" },
      { key: "ESC", label: "CANCEL" },
    ],
  });

  // Defer focus to the next tick: this screen is opened synchronously from the
  // reader's `c`/`r` keypress handler, and focusing the editor within that same
  // dispatch would let the triggering character land in the textarea.
  const focusTimer = setTimeout(() => editor.focus(), 0);

  return {
    root,
    done,
    dispose: () => {
      clearTimeout(focusTimer);
      renderer.keyInput.off("keypress", keyHandler);
      // Release focus so the editor's cursor stops blinking once we unmount.
      editor.blur();
      renderer.root.remove(root.id);
      root.destroyRecursively();
    },
  };
}
