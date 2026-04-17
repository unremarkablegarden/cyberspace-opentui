import { BoxRenderable, type CliRenderer, type Renderable } from "@opentui/core";
import { createHeader, type HeaderHandle } from "./ui/header.ts";
import { createFooter, type FooterHandle } from "./ui/footer.ts";
import { theme } from "./theme.ts";

export interface AppShell {
  root: BoxRenderable;
  content: BoxRenderable;
  header: HeaderHandle;
  footer: FooterHandle;
  setContent(child: Renderable | null): void;
  dispose(): void;
}

export function mountShell(renderer: CliRenderer): AppShell {
  renderer.setBackgroundColor(theme.bg);

  const root = new BoxRenderable(renderer, {
    id: "app",
    flexDirection: "column",
    flexGrow: 1,
    backgroundColor: theme.bg,
  });

  const header = createHeader(renderer);
  const content = new BoxRenderable(renderer, {
    id: "app-content",
    flexGrow: 1,
    flexDirection: "column",
    backgroundColor: theme.bg,
  });
  const footer = createFooter(renderer);

  root.add(header.root);
  root.add(content);
  root.add(footer.root);

  renderer.root.add(root);

  let mountedChild: Renderable | null = null;

  function setContent(child: Renderable | null): void {
    if (mountedChild) {
      content.remove(mountedChild.id);
      mountedChild = null;
    }
    if (child) {
      content.add(child);
      mountedChild = child;
    }
  }

  function dispose(): void {
    footer.dispose();
    renderer.root.remove(root.id);
    root.destroyRecursively();
  }

  return { root, content, header, footer, setContent, dispose };
}
