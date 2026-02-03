"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronsRight, StickyNote, Image as ImageIcon } from "lucide-react";

interface RightSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    activeTab: "context" | "assets";
    onTabChange: (tab: "context" | "assets") => void;
}

export default function RightSidebar({ isOpen, onToggle, children, activeTab, onTabChange }: RightSidebarProps) {
    return (
        <aside
            className={cn(
                "fixed right-0 top-[73px] bottom-0 w-80 bg-neutral-50 dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800 transition-transform duration-300 ease-in-out z-20 flex flex-col",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}
        >
            {/* Toggle Button (Visible when closed) - Actually, we might need a button on the main UI to open it, 
                but for now let's keep a handle or assume the parent controls it. 
                Let's stick to the prompt description of "active state". 
                For "linear-like", it should probably be always accessible via a toggle.
            */}

            {/* Header / Tabs */}
            <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800">
                <button
                    onClick={() => onTabChange("assets")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2",
                        activeTab === "assets"
                            ? "text-neutral-900 dark:text-neutral-100 border-neutral-900 dark:border-neutral-100"
                            : "text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-700 dark:hover:text-neutral-300"
                    )}
                >
                    <ImageIcon size={16} />
                    <span>Assets</span>
                </button>
                <button
                    onClick={() => onTabChange("context")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2",
                        activeTab === "context"
                            ? "text-neutral-900 dark:text-neutral-100 border-neutral-900 dark:border-neutral-100"
                            : "text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-700 dark:hover:text-neutral-300"
                    )}
                >
                    <StickyNote size={16} />
                    <span>Context</span>
                </button>

                {/* Close Button */}
                <button onClick={onToggle} className="p-3 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
                    <ChevronsRight size={18} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 content-scrollbar">
                {children}
            </div>
        </aside>
    );
}
