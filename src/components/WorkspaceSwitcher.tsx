import type { Workspace } from "../inix.d";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeId: number;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
}

export function WorkspaceSwitcher({ workspaces, activeId, onSelect, onCreate }: WorkspaceSwitcherProps) {
  return (
    <div className="workspace-switcher">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          type="button"
          className={`workspace-tab${ws.id === activeId ? " active" : ""}`}
          onClick={() => onSelect(ws.id)}
        >
          {ws.name}
        </button>
      ))}
      <button
        type="button"
        className="workspace-tab workspace-add"
        onClick={() => {
          const name = prompt("Workspace name:");
          if (name?.trim()) onCreate(name.trim());
        }}
        title="New workspace"
      >
        +
      </button>
    </div>
  );
}
