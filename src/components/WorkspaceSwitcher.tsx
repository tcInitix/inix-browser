import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../inix.d";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeId: number;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename?: (id: number, name: string) => void;
  onDelete?: (id: number) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: WorkspaceSwitcherProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [menuId, setMenuId] = useState<number | null>(null);
  const createRef = useRef<HTMLInputElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (creating) createRef.current?.focus();
  }, [creating]);
  useEffect(() => {
    if (renameId !== null) renameRef.current?.focus();
  }, [renameId]);

  useEffect(() => {
    if (menuId === null) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".workspace-menu")) return;
      if (target?.closest(".workspace-more-btn")) return;
      setMenuId(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuId]);

  const commitCreate = () => {
    const name = draft.trim();
    if (name) onCreate(name);
    setDraft("");
    setCreating(false);
  };

  const commitRename = (id: number) => {
    const name = renameDraft.trim();
    if (name && onRename) onRename(id, name);
    setRenameDraft("");
    setRenameId(null);
  };

  return (
    <div className="workspace-switcher">
      {workspaces.map((ws) => {
        const isActive = ws.id === activeId;
        const isRenaming = renameId === ws.id;
        return (
          <div key={ws.id} className={`workspace-chip${isActive ? " active" : ""}`}>
            {isRenaming ? (
              <input
                ref={renameRef}
                className="workspace-rename-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => commitRename(ws.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(ws.id);
                  else if (e.key === "Escape") {
                    setRenameDraft("");
                    setRenameId(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="workspace-tab"
                onClick={() => onSelect(ws.id)}
                onDoubleClick={() => {
                  if (!onRename) return;
                  setRenameDraft(ws.name);
                  setRenameId(ws.id);
                }}
                title={ws.name}
              >
                {ws.name}
              </button>
            )}
            {(onRename || onDelete) && !isRenaming && (
              <button
                type="button"
                className="workspace-more-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId((cur) => (cur === ws.id ? null : ws.id));
                }}
                title="Workspace options"
              >
                ⋯
              </button>
            )}
            {menuId === ws.id && (
              <div className="workspace-menu">
                {onRename && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDraft(ws.name);
                      setRenameId(ws.id);
                      setMenuId(null);
                    }}
                  >
                    Rename
                  </button>
                )}
                {onDelete && workspaces.length > 1 && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      onDelete(ws.id);
                      setMenuId(null);
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {creating ? (
        <input
          ref={createRef}
          className="workspace-create-input"
          placeholder="Workspace name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitCreate();
            else if (e.key === "Escape") {
              setDraft("");
              setCreating(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="workspace-tab workspace-add"
          onClick={() => setCreating(true)}
          title="New workspace"
        >
          +
        </button>
      )}
    </div>
  );
}
