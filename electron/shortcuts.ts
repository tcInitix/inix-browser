import type { Input } from "electron";

export type ShortcutAction =
  | "new-tab"
  | "new-private-tab"
  | "history"
  | "library"
  | "close-tab"
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
  | "home";

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
  if (shift && key === "t") return "reopen-tab";
  if (shift && key === "i") return "devtools";
  if (!shift && key === "n") return "new-tab";
  if (!shift && key === "h") return "history";
  if (!shift && key === "w") return "close-tab";
  if (!shift && key === "t") return "new-tab";
  if (!shift && key === "r") return "reload";
  if (!shift && key === "l") return "focus-address";
  if (!shift && key === "f") return "find";
  if (!shift && key === "p") return "print";
  if (key === "=" || key === "+") return "zoom-in";
  if (key === "-") return "zoom-out";
  if (key === "0") return "zoom-reset";

  return null;
}
