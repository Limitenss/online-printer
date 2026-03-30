"use client";

import React, { useState, useRef, useEffect } from "react";
import * as fabric from "fabric";

interface PrintSettingsProps {
  canvas: fabric.Canvas | null;
}

const SettingItem = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4 px-6 gap-4">
    <label className="text-xs font-normal text-foreground opacity-80 whitespace-nowrap">{label}</label>
    <div className="flex-1 max-w-[180px]">
      {children}
    </div>
  </div>
);

const ChromeSelect = ({ value, options, onChange }: { value?: string, options: string[], onChange?: (val: string) => void }) => (
  <div className="relative group">
    <select 
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full h-9 px-3 text-xs bg-sidebar text-foreground border border-border rounded-lg outline-none focus:border-accent hover:bg-[#292a2d] transition-all appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-sidebar">{opt}</option>
      ))}
    </select>
    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity">
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  </div>
);

export default function PrintSettings({ canvas }: PrintSettingsProps) {
  const [textInput, setTextInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [totalPrints, setTotalPrints] = useState(0);
  const [cooldownMs, setCooldownMs] = useState(0);

  const API_KEY = process.env.NEXT_PUBLIC_PRINT_API_KEY || "YOUR_API_KEY_HERE";

  // Fetch total prints on mount
  const fetchStats = async () => {
    try {
      const res = await fetch("/api/print-queue?type=stats", {
        headers: { "x-api-key": API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        setTotalPrints(data.totalCompleted || 0);
        if (data.cooldown?.inCooldown) {
          setCooldownMs(data.cooldown.remainingMs);
        }
      }
    } catch (err) {
      console.error("Stats error:", err);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldownMs <= 0) return;
    const timer = setInterval(() => {
      setCooldownMs(prev => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownMs]);

  const addText = () => {
    if (!canvas || !textInput) return;
    const page = canvas.getObjects().find(o => (o as any).name === "print-page");
    const targetLeft = page ? page.left : 100;
    const targetTop = page ? page.top : 100;

    const text = new fabric.IText(textInput, {
      left: targetLeft,
      top: targetTop,
      fontSize: 20,
      fontFamily: "Segoe UI",
      fill: "#000000",
      originX: "center",
      originY: "center"
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    setTextInput("");
    canvas.renderAll();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canvas) return;

    const page = canvas.getObjects().find(o => (o as any).name === "print-page");
    const targetLeft = page ? page.left : 100;
    const targetTop = page ? page.top : 200;

    const reader = new FileReader();
    reader.onload = async (f) => {
      const data = f.target?.result as string;
      const img = await fabric.FabricImage.fromURL(data);
      
      const scale = Math.min(200 / img.width, 200 / img.height);
      img.set({
        left: targetLeft,
        top: targetTop,
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center"
      });
      
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
    };
    reader.readAsDataURL(file);
  };

  const deleteSelected = () => {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    canvas.remove(...activeObjects);
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  const handlePrint = async () => {
    if (!canvas) return;
    setIsPrinting(true);

    try {
      const page = canvas.getObjects().find(obj => (obj as any).name === "print-page");
      let captureParams = { format: "png" as "png", multiplier: 2 };

      if (page) {
        const bounds = page.getBoundingRect();
        Object.assign(captureParams, {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height
        });
      }

      const dataUrl = canvas.toDataURL(captureParams);

      const response = await fetch("/api/print-queue", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": API_KEY
        },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (response.ok) {
        // Success feedback is implicitly handled by the button state and totalPrints update
        setTimeout(fetchStats, 2000);
      } else if (response.status === 429) {
        const data = await response.json();
        setCooldownMs(data.remainingMs || 60000);
      }
    } catch (error) {
      console.error("Print error:", error);
      alert("An error occurred while printing.");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="w-[340px] h-full bg-sidebar flex flex-col pt-8 pb-6 shadow-xl font-sans border-l border-border">
      <div className="flex items-center justify-between px-6 mb-8">
        <h2 className="text-xl font-medium tracking-tight">Print</h2>
        <span className="text-xs font-medium opacity-60 text-accent">
          {totalPrints} {totalPrints === 1 ? "sheet" : "sheets"} of paper
        </span>
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto flex-1 custom-scrollbar">
        <div className="mb-6 opacity-60 px-6 text-[10px] uppercase font-bold tracking-wider">Settings</div>
        
        <SettingItem label="Destination">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#292a2d] border border-border rounded-lg text-xs opacity-80">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-accent">
              <path d="M6 9V2H18V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 18H4C3.46957 18 2.96086 17.7893 2.58579 17.4142C2.21071 17.0391 2 16.5304 2 16V11C2 10.4696 2.21071 9.96086 2.58579 9.58579C2.96086 9.21071 3.46957 9 4 9H20C20.5304 9 21.0391 9.21071 21.4142 9.58579C21.7893 9.96086 22 10.4696 22 11V16C22 16.5304 21.7893 17.0391 21.4142 17.4142C21.0391 17.7893 20.5304 18 20 18H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 14H6V22H18V14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="truncate">Limitens Label Printer</span>
          </div>
        </SettingItem>

        <SettingItem label="Pages">
          <ChromeSelect options={["All"]} />
        </SettingItem>

        <SettingItem label="Color">
          <ChromeSelect options={["Black and white"]} />
        </SettingItem>

        <SettingItem label="Paper size">
          <ChromeSelect value="4&quot; x 6&quot; Label" options={["4\" x 6\" Label"]} />
        </SettingItem>

        {/* Editor Tools Section */}
        <div className="mt-4 mb-6 opacity-60 px-6 text-[10px] uppercase font-bold tracking-wider border-t border-border pt-6">Tools</div>

        <div className="px-6 mb-6">
          <label className="text-[11px] block mb-2 opacity-70">Add Text</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type something..."
              className="flex-1 h-9 px-3 text-xs bg-[#292a2d] border border-border rounded-lg outline-none focus:border-accent"
            />
            <button 
              onClick={addText}
              className="h-9 px-3 bg-accent text-[#1c1e21] rounded-lg text-xs font-bold hover:opacity-90 transition-all"
            >
              Add
            </button>
          </div>
        </div>

        <div className="px-6 mb-6">
          <label className="text-[11px] block mb-2 opacity-70">Add Image</label>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-9 bg-[#292a2d] border border-border rounded-lg text-xs hover:bg-[#323336] transition-all"
          >
            Choose Image
          </button>
        </div>

        <div className="px-6 mb-6">
          <button 
            onClick={deleteSelected}
            className="w-full h-9 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-all"
          >
            Delete Selected
          </button>
        </div>

        <div className="px-6 mt-4 border-t border-border pt-6">
          <button className="flex items-center gap-2 text-[11px] font-medium text-foreground/70 hover:text-foreground transition-colors group">
            <span className="group-hover:underline underline-offset-2 tracking-tight">Print using system dialog... (Ctrl+Shift+P)</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-70">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-auto px-6 flex justify-end gap-2 pr-4 pt-8">
        <button 
          onClick={handlePrint}
          disabled={isPrinting || cooldownMs > 0}
          className="h-10 px-7 bg-accent text-[#1c1e21] rounded-full text-[13px] font-semibold hover:opacity-90 active:scale-[0.98] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
        >
          {isPrinting ? "Printing..." : cooldownMs > 0 ? `Wait ${Math.ceil(cooldownMs / 1000)}s` : "Print"}
        </button>
        <button className="h-10 px-6 bg-transparent border border-border text-foreground/90 rounded-full text-[13px] font-semibold hover:bg-white/10 active:scale-[0.98] transition-all">
          Cancel
        </button>
      </div>
    </div>
  );
}
