/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        allowpopups?: boolean;
        partition?: string;
        webpreferences?: string;
      },
      HTMLElement
    >;
  }
}

interface ElectronWebviewTag extends HTMLElement {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  loadURL: (url: string) => void;
  getURL: () => string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}
