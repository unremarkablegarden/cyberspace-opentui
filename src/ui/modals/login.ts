import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import { setContext } from "../../focus/registry.ts";
import { theme } from "../../theme.ts";
import { login } from "../../api/endpoints.ts";
import { setSession } from "../../auth/session.ts";
import { ApiError } from "../../api/client.ts";

export interface LoginHandle {
  root: BoxRenderable;
  done: Promise<void>;
  dispose(): void;
}

export function createLoginScreen(renderer: CliRenderer): LoginHandle {
  const root = new BoxRenderable(renderer, {
    id: "login-screen",
    flexGrow: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
  });

  const card = new BoxRenderable(renderer, {
    id: "login-card",
    width: 50,
    flexDirection: "column",
    border: true,
    borderStyle: "single",
    borderColor: theme.fgDim,
    focusedBorderColor: theme.accent,
    title: "SIGN IN",
    titleAlignment: "left",
    padding: 1,
    backgroundColor: theme.bg,
  });

  const emailLabel = new TextRenderable(renderer, {
    id: "login-email-label",
    content: "email",
    fg: theme.fg,
    bg: theme.bg,
  });
  const emailInput = new InputRenderable(renderer, {
    id: "login-email",
    placeholder: "you@example.com",
    backgroundColor: theme.bg,
    focusedBackgroundColor: theme.bg,
    textColor: theme.fg,
    focusedTextColor: theme.fg,
    placeholderColor: theme.fgDim,
    cursorColor: theme.accent,
    marginBottom: 1,
  });

  const passwordLabel = new TextRenderable(renderer, {
    id: "login-password-label",
    content: "password",
    fg: theme.fg,
    bg: theme.bg,
  });
  const passwordInput = new InputRenderable(renderer, {
    id: "login-password",
    placeholder: "••••••••",
    backgroundColor: theme.bg,
    focusedBackgroundColor: theme.bg,
    textColor: theme.fg,
    focusedTextColor: theme.fg,
    placeholderColor: theme.fgDim,
    cursorColor: theme.accent,
    marginBottom: 1,
  });

  const status = new TextRenderable(renderer, {
    id: "login-status",
    content: "",
    fg: theme.fgMuted,
    bg: theme.bg,
    marginTop: 1,
  });

  card.add(emailLabel);
  card.add(emailInput);
  card.add(passwordLabel);
  card.add(passwordInput);
  card.add(status);
  root.add(card);

  type Focus = "email" | "password";
  let focus: Focus = "email";
  let submitting = false;
  let resolve: () => void = () => {};
  let reject: (err: Error) => void = () => {};

  // Password masking: keep the real value in a closure, display bullets in the input.
  let realPassword = "";
  let maskingUpdate = false;

  passwordInput.on(InputRenderableEvents.INPUT, (displayed: string) => {
    if (maskingUpdate) return;
    if (displayed.length > realPassword.length) {
      realPassword += displayed.slice(realPassword.length);
    } else if (displayed.length < realPassword.length) {
      realPassword = realPassword.slice(0, displayed.length);
    }
    const masked = "•".repeat(realPassword.length);
    if (passwordInput.value !== masked) {
      maskingUpdate = true;
      passwordInput.value = masked;
      maskingUpdate = false;
    }
  });

  const done = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  function setFocus(target: Focus): void {
    focus = target;
    if (target === "email") {
      passwordInput.blur();
      emailInput.focus();
    } else {
      emailInput.blur();
      passwordInput.focus();
    }
  }

  function setStatus(message: string, isError = false): void {
    status.content = message;
    status.fg = isError ? "#ff6b6b" : theme.fgMuted;
  }

  async function submit(): Promise<void> {
    if (submitting) return;
    const email = emailInput.value.trim();
    const password = realPassword;
    if (!email || !password) {
      setStatus("email and password are required", true);
      return;
    }
    submitting = true;
    setStatus("signing in…");
    try {
      const tokens = await login(email, password);
      setSession(email, tokens);
      setStatus("signed in");
      resolve();
    } catch (err) {
      submitting = false;
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "sign-in failed";
      setStatus(message, true);
      setFocus("password");
      realPassword = "";
      maskingUpdate = true;
      passwordInput.value = "";
      maskingUpdate = false;
    }
  }

  const keyHandler = (key: KeyEvent) => {
    if (key.name === "tab") {
      setFocus(focus === "email" ? "password" : "email");
      return;
    }
    if (key.name === "escape") {
      reject(new Error("login cancelled"));
      return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  emailInput.on(InputRenderableEvents.ENTER, () => {
    if (emailInput.value.trim()) setFocus("password");
  });
  passwordInput.on(InputRenderableEvents.ENTER, () => {
    void submit();
  });

  setContext({
    id: "login",
    shortcuts: [
      { key: "TAB", label: "FIELD" },
      { key: "↵", label: "NEXT/SUBMIT" },
      { key: "ESC", label: "QUIT" },
    ],
  });

  setFocus("email");

  return {
    root,
    done,
    dispose: () => {
      renderer.keyInput.off("keypress", keyHandler);
    },
  };
}
