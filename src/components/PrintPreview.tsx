"use client";

import React, { useEffect, useRef } from "react";
import * as fabric from "fabric";

interface PrintPreviewProps {
  onCanvasReady: (canvas: fabric.Canvas) => void;
}

export default function PrintPreview({ onCanvasReady }: PrintPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasInstance = useRef<fabric.Canvas | null>(null);
  const lastCenter = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      backgroundColor: "#323639",
    });
    canvasInstance.current = canvas;
    onCanvasReady(canvas);

    const page = new fabric.Rect({
      width: 384,
      height: 576,
      fill: "white",
      shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.5)", blur: 20, offsetX: 0, offsetY: 2 }),
      selectable: false,
      evented: false, 
      originX: "center",
      originY: "center",
      // @ts-ignore
      name: "print-page"
    });
    canvas.add(page);

    // Initial Placeholder Text
    const title = new fabric.IText("Double click to edit", {
      fontSize: 24,
      fontFamily: "Segoe UI",
      fill: "#333",
      originX: "center",
      originY: "center"
    });
    canvas.add(title);

    const updateLayout = () => {
      const c = canvasInstance.current;
      const container = containerRef.current;
      if (!c || !container) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      c.setDimensions({ width: w, height: h });
      const zoom = Math.min((w - 80) / 384, (h - 80) / 576);
      c.setZoom(zoom);
      
      const newCenterX = (w / zoom) / 2;
      const newCenterY = (h / zoom) / 2;
      
      const dx = newCenterX - lastCenter.current.x;
      const dy = newCenterY - lastCenter.current.y;

      c.getObjects().forEach(obj => {
        obj.set({
          left: obj.left + dx,
          top: obj.top + dy
        });
        obj.setCoords();
      });

      lastCenter.current = { x: newCenterX, y: newCenterY };
      c.requestRenderAll();
    };

    const timeout = setTimeout(updateLayout, 50);
    const observer = new ResizeObserver(() => requestAnimationFrame(updateLayout));
    observer.observe(containerRef.current);

    return () => {
      canvas.dispose();
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 h-full bg-[#323639] overflow-hidden">
      <canvas ref={canvasRef} />
    </div>
  );
}
