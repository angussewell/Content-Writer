"use client";

interface ContextItem {
    id: string;
    content: string;
}

interface ContextRailProps {
    contextItems: ContextItem[];
}

const LinkIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

const ClockIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l2 2" />
    </svg>
);

const RectIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
);

export default function ContextRail({ contextItems }: ContextRailProps) {
    const brief = contextItems[0]?.content || "";

    return (
        <aside className="ctx-rail">
            <section className="ctx-block" style={{ borderTop: "none", paddingTop: 0 }}>
                <div className="ctx-block__head">
                    <span className="ctx-block__label">Brief</span>
                </div>
                <div className="ctx-block__body">
                    {brief || <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>No brief added yet.</span>}
                </div>
            </section>

            {contextItems.length > 1 && (
                <section className="ctx-block">
                    <div className="ctx-block__head">
                        <span className="ctx-block__label">Context</span>
                    </div>
                    {contextItems.slice(1).map((item) => (
                        <div key={item.id} className="ctx-block__body" style={{ marginBottom: "0.5rem" }}>
                            {item.content}
                        </div>
                    ))}
                </section>
            )}

            <section className="ctx-block">
                <div className="ctx-block__head">
                    <span className="ctx-block__label">Format</span>
                </div>
                <ul className="ctx-link-list">
                    <li>
                        <span className="ctx-link-list__icon"><RectIcon /></span>
                        9 : 16 vertical · 60–90s
                    </li>
                    <li>
                        <span className="ctx-link-list__icon"><ClockIcon /></span>
                        Reel Scripter
                    </li>
                </ul>
            </section>
        </aside>
    );
}
