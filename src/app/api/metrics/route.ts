import { pool } from "@/db";
import { renderMetrics, type Gauge } from "@/lib/metrics";
import { queueDepths } from "@/lib/queue";

/**
 * Prometheus scrape endpoint (Gate B4). Public but PII-free: only aggregate HTTP
 * counters/histograms plus point-in-time gauges for DB-pool saturation and queue
 * depth. No auth so a scraper doesn't need a tenant credential; nothing here
 * identifies a tenant or user.
 */
export async function GET() {
  const gauges: Gauge[] = [
    {
      name: "fourty_db_pool_connections",
      help: "node-postgres pool connection counts by state.",
      value: pool.totalCount,
      labels: { state: "total" },
    },
    {
      name: "fourty_db_pool_connections",
      help: "node-postgres pool connection counts by state.",
      value: pool.idleCount,
      labels: { state: "idle" },
    },
    {
      name: "fourty_db_pool_connections",
      help: "node-postgres pool connection counts by state.",
      value: pool.waitingCount,
      labels: { state: "waiting" },
    },
  ];

  // Queue depth per job queue (empty in inline mode / before the queue starts).
  try {
    const depths = await queueDepths();
    for (const [queue, depth] of Object.entries(depths)) {
      gauges.push({
        name: "fourty_queue_depth",
        help: "Pending + active jobs per queue.",
        value: depth,
        labels: { queue },
      });
    }
  } catch {
    // Queue unreachable — omit its gauges rather than fail the scrape.
  }

  return new Response(renderMetrics(gauges), {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
