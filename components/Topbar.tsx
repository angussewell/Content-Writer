import Link from "next/link";
import { createScript } from "@/app/actions";

type Tab = { id: string; label: string; count: number | string; href: string };

export function Topbar({
  ideasCount,
  wireCount,
  workspaceTabs,
  activeTab,
}: {
  ideasCount: number;
  wireCount?: number;
  workspaceTabs: Tab[];
  activeTab: string;
}) {
  return (
    <header className="topbar">
      <div className="container topbar__row">
        <div className="topbar__brand">
          <span className="brand__mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 19 L13 9 L18 14 L8 19 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M13 9 L17 5 L19 7 L15 11" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="6" cy="16" r="1.1" fill="currentColor" />
            </svg>
          </span>
          <span className="brand__word">Reel Scripter</span>
        </div>

        <nav className="tabs" aria-label="Workspace tabs">
          <Link
            href="/ideas"
            className={"tab " + (activeTab === "ideas" ? "tab--active" : "")}
          >
            <span className="tab__label">Ideas</span>
            <span className="tab__count">{ideasCount}</span>
          </Link>
          <Link
            href="/wire"
            className={"tab " + (activeTab === "wire" ? "tab--active" : "")}
          >
            <span className="tab__label">Wire</span>
            {typeof wireCount === "number" && <span className="tab__count">{wireCount}</span>}
          </Link>
          <span className="tab--seam" />
          {workspaceTabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className={"tab " + (activeTab === t.id ? "tab--active" : "")}
            >
              <span className="tab__label">{t.label}</span>
              <span className="tab__count">{t.count}</span>
            </Link>
          ))}
        </nav>

        <div className="topbar__right">
          <button className="iconbtn" title="Search" aria-label="Search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <form action={createScript}>
            <button type="submit" className="cta">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2 V12 M2 7 H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>New script</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
