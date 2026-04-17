import { BoxRenderable, TextAttributes, TextRenderable, type CliRenderer } from "@opentui/core";
import { theme } from "../theme.ts";

export interface HeaderHandle {
  root: BoxRenderable;
  setActiveTab(idx: number): void;
}

const TABS = [
  { key: "#1", label: "READER" },
  { key: "#2", label: "FEED" },
  { key: "#3", label: "PROFILE" },
];

export function createHeader(renderer: CliRenderer): HeaderHandle {
  const root = new BoxRenderable(renderer, {
    id: "header",
    height: 1,
    flexDirection: "row",
    flexShrink: 0,
    backgroundColor: theme.barBg,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const tabsBox = new BoxRenderable(renderer, {
    id: "header-tabs",
    flexDirection: "row",
    flexGrow: 1,
    backgroundColor: theme.barBg,
  });

  let activeIdx = 0;

  const tabTexts: TextRenderable[] = TABS.map((tab, idx) => {
    const active = idx === activeIdx;
    const text = new TextRenderable(renderer, {
      id: `tab-${idx}`,
      content: ` ${tab.key} ${tab.label} `,
      fg: active ? theme.tabActiveFg : theme.fgDim,
      bg: active ? theme.tabActiveBg : theme.barBg,
      attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
      marginRight: 1,
      flexShrink: 0,
    });
    tabsBox.add(text);
    return text;
  });

  const wordmark = new TextRenderable(renderer, {
    id: "wordmark",
    content: "CYBERSPACE",
    fg: theme.fgDim,
    bg: theme.barBg,
  });

  root.add(tabsBox);
  root.add(wordmark);

  function setActiveTab(idx: number): void {
    activeIdx = idx;
    tabTexts.forEach((text, i) => {
      const active = i === idx;
      text.fg = active ? theme.tabActiveFg : theme.fgDim;
      text.bg = active ? theme.tabActiveBg : theme.barBg;
      text.attributes = active ? TextAttributes.BOLD : TextAttributes.NONE;
    });
  }

  return { root, setActiveTab };
}
