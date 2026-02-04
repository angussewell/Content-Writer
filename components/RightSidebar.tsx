"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronsRight, StickyNote, Image as ImageIcon, X } from "lucide-react";

interface RightSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    activeTab: "context" | "assets";
    onTabChange: (tab: "context" | "assets") => void;
}

export default function RightSidebar({ isOpen, onToggle, children, activeTab, onTabChange }: RightSidebarProps) {
    // Scroll Lock Effect for Mobile
    useEffect(() => {
        if (isOpen && window.innerWidth < 768) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    return (
        <>
            {/* Backdrop Overlay (Mobile Only) */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={onToggle}
                aria-hidden="true"
            />

            <aside
                className={cn(
                    // Base transition & positioning
                    "fixed right-0 transition-transform duration-300 ease-in-out flex flex-col bg-neutral-50 dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800",
                    // Mobile Styles (< md)
                    "z-50 top-0 bottom-0 w-[85vw] max-w-[320px] shadow-2xl",
                    // Desktop Styles (md+)
                    "md:top-[73px] md:bottom-0 md:w-80 md:z-20 md:shadow-none",
                    // Transform State
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Header / Tabs */}
                <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800 relative">
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

                    {/* Desktop Collapse Button */}
                    <button
                        onClick={onToggle}
                        className="p-3 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hidden md:block"
                    >
                        <ChevronsRight size={18} />
                    </button>

                    {/* Mobile Close Button (Absolute Top Right of Sidebar) */}
                    <button
                        onClick={onToggle}
                        className="absolute right-0 top-0 h-full px-3 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 md:hidden flex items-center justify-center"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 content-scrollbar">
                    {children}
                </div>
            </aside>
        </>
    );
}
