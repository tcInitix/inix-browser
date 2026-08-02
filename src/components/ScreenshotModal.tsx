import { useEffect, useRef, useState } from "react";
import { DismissibleOverlay } from "./DismissibleOverlay";

interface ScreenshotModalProps {
  open: boolean;
  dataUrl: string | null;
  onClose: () => void;
}

type Tool = "arrow" | "rect" | "highlight" | "text";

interface Shape {
  tool: Tool;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  text?: string;
}

const COLORS = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#ffffff", "#000000"];

export function ScreenshotModal({ open, dataUrl, onClose }: ScreenshotModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setShapes([]);
      setDrawing(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !dataUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redraw();
    };
    img.src = dataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dataUrl]);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, drawing]);

  const redraw = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const all = drawing ? [...shapes, drawing] : shapes;
    for (const s of all) {
      drawShape(ctx, s);
    }
  };

  const drawShape = (ctx: CanvasRenderingContext2D, s: Shape) => {
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.tool === "rect") {
      ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
    } else if (s.tool === "arrow") {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const angle = Math.atan2(dy, dx);
      const headLen = 18;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - headLen * Math.cos(angle - Math.PI / 6), s.y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(s.x2 - headLen * Math.cos(angle + Math.PI / 6), s.y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (s.tool === "highlight") {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
    } else if (s.tool === "text" && s.text) {
      ctx.font = "24px system-ui, sans-serif";
      ctx.fillText(s.text, s.x1, s.y1);
    }
    ctx.restore();
  };

  const canvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const [x, y] = canvasCoords(e);
    if (tool === "text") {
      const text = prompt("Text:");
      if (text) setShapes((s) => [...s, { tool, x1: x, y1: y, x2: x, y2: y, color, text }]);
      return;
    }
    setDrawing({ tool, x1: x, y1: y, x2: x, y2: y, color });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const [x, y] = canvasCoords(e);
    setDrawing({ ...drawing, x2: x, y2: y });
  };

  const onMouseUp = () => {
    if (drawing) {
      setShapes((s) => [...s, drawing]);
      setDrawing(null);
    }
  };

  const clear = () => setShapes([]);

  const copy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `inix-screenshot-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  if (!open || !dataUrl) return null;

  return (
    <DismissibleOverlay onDismiss={onClose}>
      <div className="screenshot-modal">
        <div className="screenshot-toolbar">
          <div className="screenshot-tools">
            {(["arrow", "rect", "highlight", "text"] as Tool[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`screenshot-tool${tool === t ? " active" : ""}`}
                onClick={() => setTool(t)}
                title={t}
              >
                {t === "arrow" ? "→" : t === "rect" ? "▭" : t === "highlight" ? "▧" : "T"}
              </button>
            ))}
          </div>
          <div className="screenshot-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`screenshot-color${color === c ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <div className="screenshot-actions">
            <button type="button" className="ghost-button" onClick={clear}>
              Clear
            </button>
            <button type="button" className="ghost-button" onClick={copy} disabled={saving}>
              {saving ? "Copying…" : "Copy"}
            </button>
            <button type="button" className="permission-allow" onClick={download}>
              Save
            </button>
            <button type="button" className="permission-deny" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="screenshot-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="screenshot-canvas"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        </div>
      </div>
    </DismissibleOverlay>
  );
}
