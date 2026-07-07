import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe — pings Postgres. Used by the Docker Compose
 * healthcheck and as an observability hook. Intentionally unauthenticated.
 */
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "db_unreachable" }, { status: 503 });
  }
}
