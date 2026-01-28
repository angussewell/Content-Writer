import { db } from "@/lib/db";
import { scripts } from "@/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createScript } from "./actions";

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

export default async function Dashboard() {
  const allScripts = await db.select().from(scripts).orderBy(desc(scripts.createdAt));

  return (
    <div className="min-h-screen bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans">
      <header className="w-full px-8 py-6 flex items-center justify-between border-b border-transparent">
        <h1 className="text-xl font-medium tracking-tighter text-neutral-900 dark:text-neutral-100">
          Reel Scripter
        </h1>
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
              <p className="mb-4">No scripts yet.</p>
              <form action={createScript} className="inline-block">
                <button type="submit" className="underline hover:text-neutral-600">
                  Create one
                </button>
              </form>
            </div>
          ) : (
            allScripts.map((script) => (
              <Link
                key={script.id}
                href={`/${script.id}`}
                className="block group h-full"
              >
                <article className="h-full flex flex-col justify-between border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 transition-all duration-200 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-sm">
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
                  </div>
                </article>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
