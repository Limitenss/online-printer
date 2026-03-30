import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readData, writeData, cleanupQueue, PrintJob, STORAGE_DIR, getCooldownStatus, recordPrint } from "@/lib/queue";

const API_KEY = process.env.PRINT_API_KEY || "secret_print_123"; 
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0] : "127.0.0.1";
}

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-api-key");
  return key === API_KEY;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

    // Payload size check
    if (image.length > MAX_PAYLOAD_SIZE) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    // Type check
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
    }

    const id = Math.random().toString(36).substring(7);
    const fileName = `${id}.png`;
    const imagePath = path.join(STORAGE_DIR, fileName);

    const clientIp = getClientIp(req);
    const data = readData();
    const cooldown = getCooldownStatus(data.stats, clientIp);
    
    if (cooldown.inCooldown) {
      return NextResponse.json({ 
        error: cooldown.reason || "Global cooldown active", 
        remainingMs: cooldown.remainingMs 
      }, { status: 429 });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(imagePath, base64Data, "base64");

    const newJob: PrintJob = {
      id,
      imagePath,
      status: "Pending",
      createdAt: Date.now(),
      ip: clientIp,
    };

    data.jobs.push(newJob);
    recordPrint(data.stats, clientIp);
    writeData(data);

    return NextResponse.json({ success: true, id: newJob.id });
  } catch (error: any) {
    console.error("Queue POST Error:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const clientIp = getClientIp(req);

    let data = readData();

    if (type === "stats") {
      const cooldown = getCooldownStatus(data.stats, clientIp);
      return NextResponse.json({ ...data.stats, cooldown });
    }

    // Normal job polling
    data.jobs = cleanupQueue(data.jobs);
    const nextJob = data.jobs.find(job => job.status === "Pending");

    if (!nextJob) {
      writeData(data);
      return NextResponse.json({ job: null });
    }

    nextJob.status = "Processing";
    let imageData = "";
    try {
      imageData = fs.readFileSync(nextJob.imagePath, "base64");
    } catch (e) {
      console.error(`Failed to read image at ${nextJob.imagePath}`);
      nextJob.status = "Completed"; // Skip this corrupted job
      writeData(data);
      return NextResponse.json({ job: null });
    }
    writeData(data);

    return NextResponse.json({ 
      job: { ...nextJob, image: `data:image/png;base64,${imageData}` } 
    });
  } catch (error: any) {
    console.error("Queue GET Error:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      message: error.message 
    }, { status: 500 });
  }
}
