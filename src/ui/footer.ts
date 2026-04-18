import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import { subscribe, type FocusContext } from "../focus/registry.ts";
import { theme } from "../theme.ts";
import pkg from "../../package.json" with { type: "json" };

export interface FooterHandle {
  root: BoxRenderable;
  dispose(): void;
}

export function createFooter(renderer: CliRenderer): FooterHandle {
  const root = new BoxRenderable(renderer, {
    id: "footer",
    height: 1,
    flexDirection: "row",
    flexShrink: 0,
    backgroundColor: theme.barBg,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const shortcutsBox = new BoxRenderable(renderer, {
    id: "footer-shortcuts",
    flexDirection: "row",
    flexGrow: 1,
    backgroundColor: theme.barBg,
  });

  const versionText = new TextRenderable(renderer, {
    id: "footer-version",
    content: `v${pkg.version}`,
    fg: theme.fgMuted,
    bg: theme.barBg,
  });

  root.add(shortcutsBox);
  root.add(versionText);

  let textNodes: TextRenderable[] = [];
  let idCounter = 0;

  function render(ctx: FocusContext): void {
    for (const node of textNodes) {
      shortcutsBox.remove(node.id);
      node.destroy();
    }
    textNodes = [];

    for (const shortcut of ctx.shortcuts) {
      const uid = idCounter++;
      const keyNode = new TextRenderable(renderer, {
        id: `sc-k-${uid}`,
        content: ` ${shortcut.key} `,
        fg: theme.tabActiveFg,
        bg: theme.tabActiveBg,
        marginRight: 1,
      });
      const labelNode = new TextRenderable(renderer, {
        id: `sc-l-${uid}`,
        content: shortcut.label,
        fg: theme.fgDim,
        bg: theme.barBg,
        marginRight: 2,
      });
      shortcutsBox.add(keyNode);
      shortcutsBox.add(labelNode);
      textNodes.push(keyNode, labelNode);
    }
  }

  const unsubscribe = subscribe(render);

  function dispose(): void {
    unsubscribe();
    for (const node of textNodes) node.destroy();
    textNodes = [];
  }

  return { root, dispose };
}
