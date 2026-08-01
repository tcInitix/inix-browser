import { getSetting } from "./settings";

/** Script injected into guest page to extract readable text via DOM APIs available in browser. */
export const EXTRACT_PAGE_SCRIPT = `
(function() {
  function getText(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (['SCRIPT','STYLE','NOSCRIPT','SVG'].includes(tag)) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const parts = [];
    while (walker.nextNode()) parts.push(walker.currentNode.textContent.trim());
    return parts.join('\\n');
  }

  const main = document.querySelector('main, article, [role="main"], #content, .content, #main')
    || document.body;
  const text = getText(main).replace(/\\n{3,}/g, '\\n\\n').trim();
  const title = document.title || '';
  const url = location.href;
  return { title, url, text: text.slice(0, 500000) };
})();
`;

export function extractPageInMain(html: string, url: string): { title: string; url: string; text: string } {
  try {
    const { JSDOM } = require("jsdom") as typeof import("jsdom");
    const { Readability } = require("@mozilla/readability") as typeof import("@mozilla/readability");
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article?.textContent) {
      return {
        title: article.title || dom.window.document.title || url,
        url,
        text: article.textContent.slice(0, 500000),
      };
    }
    return {
      title: dom.window.document.title || url,
      url,
      text: dom.window.document.body?.textContent?.slice(0, 500000) || "",
    };
  } catch {
    return { title: url, url, text: "" };
  }
}

export function isCaptureEnabled(): boolean {
  return getSetting("capture_enabled") !== "false";
}
