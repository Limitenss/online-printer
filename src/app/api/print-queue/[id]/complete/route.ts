import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { readData, writeData } from "@/lib/queue";

const API_KEY = process.env.PRINT_API_KEY || "secret_print_123"; 

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const key = req.headers.get("x-api-key");
    if (key !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = readData();
    const job = data.jobs.find((j: any) => j.id === id);

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // Mark as completed and increment stats
    job.status = "Completed";
    data.stats.totalCompleted += 1;
    
    // Clean up file immediately
    if (job.imagePath && fs.existsSync(job.imagePath)) {
      try {
        fs.unlinkSync(job.imagePath);
      } catch (err) {}
    }

    writeData(data);

    return NextResponse.json({ success: true, total: data.stats.totalCompleted });
  } catch (error: any) {
    console.error("Complete Job Error:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      message: error.message 
    }, { status: 500 });
  }
}
