import fs from "fs";
import path from "path";

// On Vercel, the only writable directory is /tmp
const IS_VERCEL = !!process.env.VERCEL;
const BASE_DIR = IS_VERCEL ? "/tmp" : process.cwd();

export const QUEUE_FILE = path.join(BASE_DIR, "print-queue.json");
export const STORAGE_DIR = path.join(BASE_DIR, "print-storage");

if (!fs.existsSync(STORAGE_DIR)) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create storage dir:", err);
  }
}

export interface PrintStats {
  totalCompleted: number;
  recentPrints: number[]; // Array of last 5 print timestamps
  ipHistory: Record<string, number[]>; // Track last 5 prints per IP
}

export interface PrintJob {
  id: string;
  imagePath: string;
  status: "Pending" | "Processing" | "Completed";
  createdAt: number;
  ip: string;
}

export interface QueueData {
  jobs: PrintJob[];
  stats: PrintStats;
}

const LOCK_FILE = path.join(BASE_DIR, "queue.lock");

function acquireLock() {
  while (fs.existsSync(LOCK_FILE)) {
    // Wait for lock (primitive)
    const stats = fs.statSync(LOCK_FILE);
    if (Date.now() - stats.mtimeMs > 5000) {
      fs.unlinkSync(LOCK_FILE); // Break stale lock
      break;
    }
  }
  fs.writeFileSync(LOCK_FILE, "locked");
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

export function readData(): QueueData {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { jobs: [], stats: { totalCompleted: 0, recentPrints: [], ipHistory: {} } };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
    if (Array.isArray(raw)) {
      return { jobs: [], stats: { totalCompleted: 0, recentPrints: [], ipHistory: {} } };
    }
    if (!raw.stats) raw.stats = { totalCompleted: 0, recentPrints: [], ipHistory: {} };
    if (!raw.stats.recentPrints) raw.stats.recentPrints = [];
    if (!raw.stats.ipHistory) raw.stats.ipHistory = {};
    if (!raw.jobs) raw.jobs = [];
    return raw;
  } catch {
    return { jobs: [], stats: { totalCompleted: 0, recentPrints: [], ipHistory: {} } };
  }
}

export function writeData(data: QueueData) {
  acquireLock();
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
  } finally {
    releaseLock();
  }
}

export function cleanupQueue(jobs: PrintJob[]): PrintJob[] {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  
  return jobs.filter(job => {
    const isOld = (now - job.createdAt) > ONE_HOUR;
    if (job.status === "Completed" && isOld) {
      if (fs.existsSync(job.imagePath)) {
        try { fs.unlinkSync(job.imagePath); } catch {}
      }
      return false;
    }
    return true;
  });
}

export interface CooldownStatus {
  inCooldown: boolean;
  remainingMs: number;
  reason?: string;
}

const GLOBAL_COOLDOWN_PRINTS = 10; // Increased global limit
const IP_COOLDOWN_PRINTS = 2; // Strict per-IP limit
const COOLDOWN_WINDOW_MS = 60 * 1000;

export function getCooldownStatus(stats: PrintStats, ip: string): CooldownStatus {
  const now = Date.now();
  
  // 1. Check IP-specific limit
  const userRecent = stats.ipHistory[ip] || [];
  if (userRecent.length >= IP_COOLDOWN_PRINTS) {
    const oldest = userRecent[0];
    const elapsed = now - oldest;
    if (elapsed < COOLDOWN_WINDOW_MS) {
      return { inCooldown: true, remainingMs: COOLDOWN_WINDOW_MS - elapsed, reason: "Individual limit reached" };
    }
  }

  // 2. Check Global limit
  const globalRecent = stats.recentPrints || [];
  if (globalRecent.length >= GLOBAL_COOLDOWN_PRINTS) {
    const oldest = globalRecent[0];
    const elapsed = now - oldest;
    if (elapsed < COOLDOWN_WINDOW_MS) {
      return { inCooldown: true, remainingMs: COOLDOWN_WINDOW_MS - elapsed, reason: "Global system cooldown" };
    }
  }

  return { inCooldown: false, remainingMs: 0 };
}

export function recordPrint(stats: PrintStats, ip: string) {
  const now = Date.now();
  
  // Record Global
  if (!stats.recentPrints) stats.recentPrints = [];
  stats.recentPrints.push(now);
  if (stats.recentPrints.length > GLOBAL_COOLDOWN_PRINTS) {
    stats.recentPrints = stats.recentPrints.slice(-GLOBAL_COOLDOWN_PRINTS);
  }

  // Record IP
  if (!stats.ipHistory) stats.ipHistory = {};
  if (!stats.ipHistory[ip]) stats.ipHistory[ip] = [];
  stats.ipHistory[ip].push(now);
  if (stats.ipHistory[ip].length > IP_COOLDOWN_PRINTS) {
    stats.ipHistory[ip] = stats.ipHistory[ip].slice(-IP_COOLDOWN_PRINTS);
  }
}
