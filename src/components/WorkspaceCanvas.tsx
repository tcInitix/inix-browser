import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CanvasBookmark, WorkspaceCanvas } from "../inix.d";
import { BookmarkCardNode, type BookmarkNodeData } from "./BookmarkCard";

interface WorkspaceCanvasProps {
  canvas: WorkspaceCanvas | null;
  faviconCache: Record<number, string | null>;
  onOpen: (url: string) => void;
  onOpenArchive: (id: number) => void;
  onRemovePin: (bookmarkId: number) => void;
  onPinMove: (bookmarkId: number, x: number, y: number) => void;
  onViewportChange: (x: number, y: number, zoom: number) => void;
  emptyHint?: string;
}

const nodeTypes: NodeTypes = {
  bookmark: BookmarkCardNode as NodeTypes[string],
};

function toNodes(
  pins: CanvasBookmark[],
  faviconCache: Record<number, string | null>,
  handlers: Omit<BookmarkNodeData, "bookmark" | "faviconUrl">
): Node[] {
  return pins.map((pin) => ({
    id: String(pin.id),
    type: "bookmark",
    position: { x: pin.pin_x, y: pin.pin_y },
    data: {
      bookmark: pin,
      faviconUrl: faviconCache[pin.id],
      ...handlers,
    } as BookmarkNodeData,
    style: { width: pin.pin_width, height: pin.pin_height },
  }));
}

export function WorkspaceCanvasView({
  canvas,
  faviconCache,
  onOpen,
  onOpenArchive,
  onRemovePin,
  onPinMove,
  onViewportChange,
  emptyHint,
}: WorkspaceCanvasProps) {
  const handlers = useMemo(
    () => ({ onOpen, onOpenArchive, onRemovePin }),
    [onOpen, onOpenArchive, onRemovePin]
  );

  const pins = canvas?.pins ?? [];

  const initialNodes = useMemo(
    () => (canvas ? toNodes(pins, faviconCache, handlers) : []),
    [canvas, pins, faviconCache, handlers]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setNodes(canvas ? toNodes(pins, faviconCache, handlers) : []);
  }, [canvas, pins, faviconCache, handlers, setNodes]);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      const id = parseInt(node.id, 10);
      if (!Number.isNaN(id)) onPinMove(id, node.position.x, node.position.y);
    },
    [onPinMove]
  );

  const onMoveEnd = useCallback(
    (_: unknown, viewport: { x: number; y: number; zoom: number }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onViewportChange(viewport.x, viewport.y, viewport.zoom);
      }, 300);
    },
    [onViewportChange]
  );

  if (!canvas) {
    return (
      <div className="library-body-state">
        <span className="library-body-state-icon">◌</span>
        <p>Loading workspace…</p>
      </div>
    );
  }

  const isEmpty = pins.length === 0;

  return (
    <div className="workspace-canvas-wrap">
      {isEmpty && (
        <div className="library-empty-canvas">
          <span className="library-empty-icon" aria-hidden="true">
            ★
          </span>
          <h2>No bookmarks on this canvas</h2>
          <p>
            {emptyHint ??
              "Bookmark a page from the toolbar, or import from Chrome in Settings → Library (export bookmarks as HTML first)."}
          </p>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={[]}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onMoveEnd={onMoveEnd}
        nodeTypes={nodeTypes}
        defaultViewport={{
          x: canvas.workspace.viewport_x,
          y: canvas.workspace.viewport_y,
          zoom: canvas.workspace.zoom,
        }}
        fitView={isEmpty}
        minZoom={0.25}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="var(--border-subtle)" />
        <Controls
          className="canvas-controls"
          showInteractive={false}
          position="bottom-left"
        />
        {!isEmpty && (
          <MiniMap
            className="canvas-minimap"
            pannable
            zoomable
            nodeColor={() => "#7c6aef"}
            maskColor="rgba(8, 8, 12, 0.82)"
          />
        )}
      </ReactFlow>
    </div>
  );
}
