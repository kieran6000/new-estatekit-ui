import { useEffect, useRef } from "react";
import { Button } from "@mui/material";

const INK = "#10203a";
/** A real signature has more to it than a tap or a stray line. */
const MIN_POINTS = 12;

/** Draw with a finger or a mouse. Gives back a PNG, or null until there's
 *  enough drawn to count as a signature. */
export default function SignaturePad({ value, onChange, disabled }: { value: string | null; onChange: (png: string | null) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Sized to the box in real pixels, so it's sharp on a phone.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const scale = window.devicePixelRatio || 1;
    const size = () => {
      const { width, height } = c.getBoundingClientRect();
      if (c.width === Math.round(width * scale)) return;
      // Resizing wipes the drawing, so a turned phone starts the signature again.
      c.width = Math.round(width * scale);
      c.height = Math.round(height * scale);
      const g = c.getContext("2d")!;
      g.scale(scale, scale);
      g.lineCap = "round";
      g.lineJoin = "round";
      g.lineWidth = 2.2;
      g.strokeStyle = INK;
      points.current = 0;
      onChange(null);
    };
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = at(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const p = at(e);
    const g = e.currentTarget.getContext("2d")!;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
    points.current++;
  };
  const up = () => {
    if (!last.current) return;
    last.current = null;
    if (points.current >= MIN_POINTS) onChange(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    points.current = 0;
    onChange(null);
  };

  return (
    <div className="ct-pad-wrap">
      <div className="ct-pad-x" aria-hidden>×</div>
      <div className="ct-pad-line" aria-hidden />
      {!value && <div className="ct-pad-hint">Sign here with your finger or mouse</div>}
      <canvas
        ref={canvas}
        className="ct-pad"
        role="img"
        aria-label="Signature box"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {value && !disabled && <Button size="small" onClick={clear} sx={{ position: "absolute", right: 6, bottom: 6, color: "#14181f" }}>Clear</Button>}
    </div>
  );
}
