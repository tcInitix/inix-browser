import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

type RegisterOverlay = (id: string, open: boolean) => void;

const ChromeOverlayContext = createContext<RegisterOverlay | null>(null);

interface ChromeOverlayProviderProps {
  children: ReactNode;
  onActiveChange: (active: boolean) => void;
}

/** Tracks chrome popovers/menus so BrowserView can be hidden while they are open. */
export function ChromeOverlayProvider({ children, onActiveChange }: ChromeOverlayProviderProps) {
  const openIds = useRef(new Set<string>());

  const register = useCallback<RegisterOverlay>(
    (id, open) => {
      if (open) openIds.current.add(id);
      else openIds.current.delete(id);
      onActiveChange(openIds.current.size > 0);
    },
    [onActiveChange]
  );

  return <ChromeOverlayContext.Provider value={register}>{children}</ChromeOverlayContext.Provider>;
}

/** Register a chrome dropdown/popover so page content stays beneath shell UI. */
export function useChromeOverlay(id: string, open: boolean) {
  const register = useContext(ChromeOverlayContext);

  useEffect(() => {
    if (!register) return;
    register(id, open);
    return () => register(id, false);
  }, [id, open, register]);
}
