import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getStats } from "@/lib/stats";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await getStats(getPool());
    return NextResponse.json(result);
  } catch (err) {
    console.error("stats failed:", err);
    return NextResponse.json({ error: "stats failed" }, { status: 500 });
  }
}
