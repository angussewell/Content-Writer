import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
import { scripts } from "@/db/schema";
import { desc, eq, or, and, inArray } from "drizzle-orm";
import Link from "next/link";
import { Plus, CheckCircle2 } from "lucide-react";
import { createScript, updateScriptStatus } from "./actions";
import { clsx } from "clsx";

// We need date-fns for relative time, or I can write a small helper. 
// "Minimalist" -> I'll stick to a simple helper or just install date-fns? 
// The user has standard "pg", "drizzle". I'll add "date-fns" or just raw date.
// I'll use raw date or simple Intl format to avoid deps if possible, but date-fns is standard.
// Let's use a simple Intl formatter to keep it light.

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const currentTab = tab || "write";

  let whereClause;
  if (currentTab === "write") {
    whereClause = eq(scripts.status, "draft");
  } else if (currentTab === "edit") {
    whereClause = eq(scripts.status, "filmed");
  } else if (currentTab === "archive") {
    whereClause = inArray(scripts.status, ["done", "archived"]);
  }

  const allScripts = await db.select().from(scripts).where(whereClause).orderBy(desc(scripts.createdAt));

  const tabs = [
    { id: "write", label: "Write" },
    { id: "edit", label: "Edit" },
    { id: "archive", label: "Archive" },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans">
      <header className="w-full px-4 md:px-8 py-4 md:py-6 flex items-center justify-between border-b border-transparent">
        <div className="flex items-center gap-4 md:gap-8">
          {/* Logo removed as requested */}
          <nav className="flex items-center gap-4 md:gap-6">
            {tabs.map((t) => (
              <Link
                key={t.id}
                href={`/?tab=${t.id}`}
                className={clsx(
                  "text-sm font-medium transition-colors pb-1 border-b-2",
                  currentTab === t.id
                    ? "text-neutral-900 dark:text-neutral-100 border-neutral-900 dark:border-neutral-100"
                    : "text-neutral-400 border-transparent hover:text-neutral-600 dark:hover:text-neutral-300"
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <form action={createScript}>
          <button
            type="submit"
            className="flex items-center gap-2 h-9 px-4 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black hover:opacity-80 transition-opacity text-sm font-medium"
          >
            <Plus size={16} />
            <span>New Script</span>
          </button>
        </form>
      </header>

      <main className="max-w-6xl mx-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allScripts.length === 0 ? (
            <div className="col-span-full text-center py-20 text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
              <p className="mb-4">No scripts in {currentTab}.</p>
              {currentTab === "write" && (
                <form action={createScript} className="inline-block">
                  <button type="submit" className="underline hover:text-neutral-600">
                    Create one
                  </button>
                </form>
              )}
            </div>
          ) : (
            allScripts.map((script) => (
              <div key={script.id} className="group relative h-full">
                <Link
                  href={`/${script.id}`}
                  className="block h-full"
                >
                  <article className="h-full flex flex-col justify-between border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 transition-all duration-200 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-sm bg-white dark:bg-neutral-900/50">
                    <div>
                      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate mb-2">
                        {script.title || "Untitled"}
                      </h2>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-3 leading-relaxed">
                        {script.body || "No content yet..."}
                      </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-900/50 flex items-center justify-between text-xs text-neutral-400 font-medium">
                      <time>{formatDate(script.createdAt)}</time>
                      <span className="capitalize px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-[10px]">
                        {script.status}
                      </span>
                    </div>
                  </article>
                </Link>
                {currentTab === "write" && (
                  <form action={updateScriptStatus.bind(null, script.id, "filmed")} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="submit"
                      className="bg-white dark:bg-neutral-800 text-neutral-500 hover:text-green-600 dark:hover:text-green-400 p-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 shadow-sm"
                      title="Mark as Filmed"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </form>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
