// Which posted reels have already been repurposed into a Substack post.
//
// The Substack posts live in a SEPARATE database (`substack`) from the one this
// app connects to via DATABASE_URL (`content_writer`). To surface the
// "repurposed" badge on /metrics we read substack.posts.source_reel_id over an
// OPTIONAL second pool keyed on SUBSTACK_DATABASE_URL.
//
// Graceful degradation is intentional: if SUBSTACK_DATABASE_URL is absent (e.g.
// not yet set on Railway) or the query fails, we return an empty set — the
// /metrics surfaces render exactly as before, just with no badges. Set the env
// var locally and on Railway to light the badges up.

import { Pool } from "pg";

let pool: Pool | null = null;
let poolResolved = false;

function getPool(): Pool | null {
  if (poolResolved) return pool;
  poolResolved = true;
  const url = process.env.SUBSTACK_DATABASE_URL;
  if (url) {
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

// Distinct content_writer instagram_metrics ids (== substack.posts.source_reel_id)
// that already have a Substack post. Empty set when unconfigured or on error.
export async function getRepurposedReelIds(): Promise<Set<number>> {
  const p = getPool();
  if (!p) return new Set();
  try {
    const res = await p.query<{ source_reel_id: number }>(
      "SELECT DISTINCT source_reel_id FROM posts WHERE source_reel_id IS NOT NULL"
    );
    return new Set(res.rows.map((r) => Number(r.source_reel_id)));
  } catch {
    return new Set();
  }
}
