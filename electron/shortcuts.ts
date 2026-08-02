import type { Input } from "electron";

export type ShortcutAction =
  | "new-tab"
  | "new-private-tab"
  | "history"
  | "library"
  | "close-tab"
  | "close-window"
  | "reload"
  | "focus-address"
  | "find"
  | "devtools"
  | "print"
  | "fullscreen"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "reopen-tab"
  | "next-tab"
  | "prev-tab"
  | "home"
  | "panic"
  | "bookmark-toggle"
  | "command-palette"
  | "clear-browsing-data"
  | "screenshot"
  | "jump-tab-1"
  | "jump-tab-2"
  | "jump-tab-3"
  | "jump-tab-4"
  | "jump-tab-5"
  | "jump-tab-6"
  | "jump-tab-7"
  | "jump-tab-8"
  | "jump-tab-last";

export function matchShortcut(input: Input): ShortcutAction | null {
  if (input.type !== "keyDown") return null;  

  const key = input.key.toLowerCase();
  const ctrl = input.control || input.meta;
  const shift = input.shift;

  // Let standard edit shortcuts reach web content
  if (ctrl && (key === "c" || key === "v" || key === "x" || key === "a")) {
    return null;
  }

  if (key === "home" && input.alt && !ctrl && !shift) return "home";

  if (key === "f12") return "devtools";
  if (key === "f5") return "reload";
  if (key === "f11") return "fullscreen";

  if (ctrl && key === "tab") return shift ? "prev-tab" : "next-tab";

  if (!ctrl) return null;

  if (shift && key === "b") return "library";
  if (shift && key === "n") return "new-private-tab";
  if (shift && key === "p") return "panic";
  if (shift && key === "t") return "reopen-tab";
  if (shift && key === "i") return "devtools";
  if (shift && key === "w") return "close-window";
  if (shift && key === "delete") return "clear-browsing-data";
  if (shift && key === "s") return "screenshot";
  if (!shift && key === "n") return "new-tab";
  if (!shift && key === "h") return "history";
  if (!shift && key === "w") return "close-tab";
  if (!shift && key === "t") return "new-tab";
  if (!shift && key === "r") return "reload";
  if (!shift && key === "l") return "focus-address";
  if (!shift && key === "f") return "find";
  if (!shift && key === "p") return "print";
  if (!shift && key === "d") return "bookmark-toggle";
  if (!shift && key === "k") return "command-palette";
  if (!shift && key === "e") return "focus-address";
  if (!shift && key === "1") return "jump-tab-1";
  if (!shift && key === "2") return "jump-tab-2";
  if (!shift && key === "3") return "jump-tab-3";
  if (!shift && key === "4") return "jump-tab-4";
  if (!shift && key === "5") return "jump-tab-5";
  if (!shift && key === "6") return "jump-tab-6";
  if (!shift && key === "7") return "jump-tab-7";
  if (!shift && key === "8") return "jump-tab-8";
  if (!shift && key === "9") return "jump-tab-last";
  if (key === "=" || key === "+") return "zoom-in";
  if (key === "-") return "zoom-out";
  if (key === "0") return "zoom-reset";

  return null;
}
