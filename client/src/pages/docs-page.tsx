/**
 * Public documentation at `/docs`.
 *
 * The content is the markdown in the repository's `docs/` directory, imported
 * as raw text and rendered here. That keeps one copy of the prose: what GitHub
 * renders and what this page renders are the same file, so they cannot drift.
 *
 * Deliberately public and deliberately free of app chrome — it renders no
 * sidebar, makes no authenticated request, and works signed out.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { BookOpen, Code2, ExternalLink, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderDoc } from "@/lib/markdown";

import guideMarkdown from "../../../docs/guide.md?raw";
import apiMarkdown from "../../../docs/api.md?raw";

type TabId = "guide" | "api";

const TABS: { id: TabId; label: string; blurb: string; icon: typeof BookOpen }[] = [
  {
    id: "guide",
    label: "User guide",
    blurb: "Using PISCOC day to day",
    icon: BookOpen,
  },
  {
    id: "api",
    label: "API reference",
    blurb: "Endpoints, auth and payloads",
    icon: Code2,
  },
];

const SOURCE: Record<TabId, string> = {
  guide: guideMarkdown,
  api: apiMarkdown,
};

export default function DocsPage() {
  // The tab lives in the URL so a link to the API reference actually opens it.
  const search = useSearch();
  const requested = new URLSearchParams(search).get("tab");
  const activeTab: TabId = requested === "api" ? "api" : "guide";

  const [tocOpen, setTocOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string>("");

  // Parsing is not free and the documents do not change, so do it once per tab.
  const { html, headings } = useMemo(() => renderDoc(SOURCE[activeTab]), [activeTab]);

  // A `/docs#section` link has to land on the section, but the content it
  // targets only exists after this render.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    document.getElementById(hash)?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [html]);

  // Highlights the section currently in view. `rootMargin` pulls the trigger
  // line near the top of the viewport so the heading you are reading is the one
  // marked, rather than whichever happens to be centred.
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveHeading(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [headings]);

  const tableOfContents = (
    <nav aria-label="On this page" className="text-sm">
      <p className="font-semibold text-gray-900 mb-3">On this page</p>
      <ul className="space-y-1 border-l border-gray-200">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={() => setTocOpen(false)}
              className={cn(
                "block border-l-2 -ml-px py-1.5 pr-2 transition-colors hover:text-[#CC3F85]",
                heading.level === 3 ? "pl-6 text-[13px]" : "pl-4",
                activeHeading === heading.id
                  ? "border-[#FF69B4] text-[#CC3F85] font-medium"
                  : "border-transparent text-gray-600",
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#FF69B4] text-white">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 leading-tight">PISCOC documentation</p>
                <p className="truncate text-xs text-gray-500">
                  {TABS.find((tab) => tab.id === activeTab)?.blurb}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open the app
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setTocOpen((open) => !open)}
                aria-label={tocOpen ? "Hide contents" : "Show contents"}
                aria-expanded={tocOpen}
                className="lg:hidden rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
              >
                {tocOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div role="tablist" aria-label="Documentation sections" className="flex gap-1 -mb-px">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTab;
              return (
                <Link
                  key={tab.id}
                  href={`/docs?tab=${tab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  className={cn(
                    "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-[#FF69B4] text-[#CC3F85]"
                      : "border-transparent text-gray-500 hover:text-gray-800",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {tocOpen && (
        <div className="lg:hidden border-b border-gray-200 bg-gray-50 px-4 py-4 sm:px-6">
          {tableOfContents}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex gap-10 py-10">
          <main className="min-w-0 flex-1">
            <article
              className="docs-prose prose prose-slate max-w-[72ch]"
              dangerouslySetInnerHTML={{ __html: html }}
            />

            <footer className="mt-16 border-t border-gray-200 pt-6 text-sm text-gray-500">
              <p>
                These pages are generated from the{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[13px]">docs/</code> directory
                in the repository. Corrections are edits to those markdown files.
              </p>
            </footer>
          </main>

          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-32 max-h-[calc(100vh-10rem)] overflow-y-auto">
              {tableOfContents}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
