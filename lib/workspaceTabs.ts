import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Workspace tabs are derived from the distinct values of scripts.status
 * (#4044), not from a hardcoded write/edit/archive mapping. The old mapping
 * lumped done + archived into one "Archive" tab, so `done` — by far the
 * largest bucket — was unreachable on its own, and it kept an "Edit" tab that
 * has no rows behind it. Reading the statuses out of the table means a new
 * status shows up as a tab with no code change.
 */

export type WorkspaceTab = { id: string; label: string; count: number; href: string };

/** Statuses render in pipeline order; anything unrecognised sorts after, alphabetically. */
const STATUS_ORDER = ["draft", "filmed", "done", "archived"];

export function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Tab id used for the unfiltered view. Not a status value, so it cannot collide. */
export const ALL_TAB = "all";

/**
 * Legacy `?tab=` values from bookmarks and older links. `archive` maps to the
 * unfiltered view rather than to one status, so an old link never hides rows.
 */
const LEGACY_TABS: Record<string, string> = {
  write: "draft",
  edit: "filmed",
  archive: ALL_TAB,
};

export function resolveTab(tab: string | undefined, known: string[]) {
  if (!tab) return "draft";
  if (tab === ALL_TAB || known.includes(tab)) return tab;
  return LEGACY_TABS[tab] ?? "draft";
}

export async function getWorkspaceTabs(): Promise<{ tabs: WorkspaceTab[]; total: number }> {
  const result = await db
    .execute(sql`SELECT status, COUNT(*)::int AS count FROM scripts GROUP BY status`)
    .catch(() => ({ rows: [] as { status: string; count: number }[] }));

  const rows = (result.rows as { status: string; count: number }[]).filter((r) => r.status);
  rows.sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    if (ai !== bi) return (ai === -1 ? STATUS_ORDER.length : ai) - (bi === -1 ? STATUS_ORDER.length : bi);
    return a.status.localeCompare(b.status);
  });

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return {
    tabs: [
      { id: ALL_TAB, label: "All", count: total, href: `/?tab=${ALL_TAB}` },
      ...rows.map((r) => ({
        id: r.status,
        label: statusLabel(r.status),
        count: r.count,
        href: `/?tab=${r.status}`,
      })),
    ],
    total,
  };
}
