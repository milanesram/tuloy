"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { TuloyMark } from "@/components/tuloy-mark";
import { ThemeToggle } from "@/components/theme-toggle";

// Public information pages mount no workspace providers or private-data widgets.
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only z-[100] rounded bg-surface p-3 text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center gap-4 px-5 sm:px-8">
          <Link href="/welcome" className="flex items-center gap-2" aria-label="Tuloy introduction"><TuloyMark size={32} /><span className="font-display text-3xl tracking-tight text-landing">Tuloy</span></Link>
          <nav aria-label="Tuloy information" className="ml-auto flex items-center gap-3 sm:gap-6">
            <a href="/welcome#how-it-works" className="hidden min-h-11 items-center text-sm text-muted hover:text-foreground sm:inline-flex">How it works</a>
            <Link href="/about" aria-current={pathname === "/about" ? "page" : undefined} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">Our story</Link>
            <div className="hidden sm:block"><ThemeToggle /></div>
            <a href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground hover:bg-brand-200 sm:px-4 sm:text-sm">Open workspace <ArrowUpRight aria-hidden="true" className="size-3.5" /></a>
          </nav>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-8 text-xs leading-6 text-muted sm:px-8">
          <span><span className="font-display text-xl text-landing">Tuloy.</span><br />Your career continues.</span>
          <div className="flex flex-wrap items-center gap-5"><Link href="/about" className="hover:text-foreground">About Tuloy</Link><a href="https://github.com/career-ops-hq/career-ops" target="_blank" rel="noreferrer" className="hover:text-foreground">Built on Career Ops ↗</a><div className="sm:hidden"><ThemeToggle /></div></div>
        </div>
      </footer>
    </div>
  );
}
