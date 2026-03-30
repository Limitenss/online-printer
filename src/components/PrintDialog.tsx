"use client";

import React, { useState } from "react";
import PrintPreview from "./PrintPreview";
import PrintSettings from "./PrintSettings";
import * as fabric from "fabric";

export default function PrintDialog() {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

  return (
    <div className="flex w-full h-full max-w-[1024px] max-h-[720px] bg-background overflow-hidden relative shadow-2xl border border-border rounded-none">
      <div className="flex flex-1 overflow-hidden">
        <PrintPreview onCanvasReady={setCanvas} />
        <PrintSettings canvas={canvas} />
      </div>
    </div>
  );
}
