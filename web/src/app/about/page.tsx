import type { Metadata } from "next";
import { ArrowRight, Compass, FileCheck2, ListChecks } from "lucide-react";
import { TuloyMark } from "@/components/tuloy-mark";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "About Tuloy",
  description: "Continue. Come in. The story behind Tuloy, a local workspace for your next career chapter.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 sm:px-9 sm:py-14">
      <header className="border-b border-border pb-9">
        <div className="flex items-center gap-3 text-brand-text">
          <TuloyMark size={36} />
          <p className="text-xs font-medium uppercase tracking-[0.2em]">About Tuloy</p>
        </div>
        <h1 className="mt-7 font-display text-4xl leading-[1.1] tracking-tight text-landing sm:text-5xl">
          Your story continues.<br />
          <span className="italic">Your next chapter starts here.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-muted">
          Bring your experience. Step into what comes next.
        </p>
      </header>

      <section aria-labelledby="name-story" className="grid gap-6 py-9 sm:grid-cols-[1fr_2fr]">
        <h2 id="name-story" className="font-display text-3xl text-landing">Continue.<br />Come in.</h2>
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p>In Tagalog, <em>tuloy</em> expresses continuation. Said as a welcome, <em>Tuloy!</em> invites you inside.</p>
          <p>For someone building a career in a new country, changing direction, or returning to work, those meanings belong together: the experience you carry and the possibilities ahead.</p>
          <p>Tuloy makes room for both. Gather what you know, look carefully at opportunities, and take your next step at your own pace.</p>
          <a href="https://diksiyonaryo.ph/word/tuloy" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs text-brand-text underline underline-offset-4">The meaning of tuloy ↗</a>
        </div>
      </section>

      <section aria-labelledby="what-it-does" className="border-y border-border py-9">
        <h2 id="what-it-does" className="font-display text-2xl text-landing">A place to work on what comes next.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">Tuloy brings job discovery, evidence review, applications, and follow-ups into one local workspace. You bring your own CV, preferences, and sources.</p>
        <div className="mt-7 grid gap-7 sm:grid-cols-3">
          <div><Compass aria-hidden="true" className="size-5 text-brand-text" /><h3 className="mt-3 text-sm font-semibold">Explore possibilities</h3><p className="mt-2 text-sm leading-7 text-muted">Find roles using your own search filters and supported employer sources.</p></div>
          <div><FileCheck2 aria-hidden="true" className="size-5 text-brand-text" /><h3 className="mt-3 text-sm font-semibold">Understand the fit</h3><p className="mt-2 text-sm leading-7 text-muted">Review what your experience supports, what is missing, and what still needs checking.</p></div>
          <div><ListChecks aria-hidden="true" className="size-5 text-brand-text" /><h3 className="mt-3 text-sm font-semibold">Keep your place</h3><p className="mt-2 text-sm leading-7 text-muted">Keep track of opportunities, applications, decisions, and the follow-ups that matter.</p></div>
        </div>
      </section>

      <section aria-labelledby="why-share" className="grid gap-6 py-9 sm:grid-cols-[1fr_2fr]">
        <h2 id="why-share" className="font-display text-2xl text-landing">Something useful,<br />shared.</h2>
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p>This is the local setup I use to organize my job search. I’m sharing the application in case it’s useful to you too.</p>
          <p>The shared source starts without my CV, search preferences, or results. Each person sets up their own workspace.</p>
          <p>Your records are stored locally. AI tools you choose may send content to their providers. You review opportunities, decide what to pursue, and submit applications yourself.</p>
        </div>
      </section>

      <footer className="border-t border-border pt-7">
        <p className="max-w-2xl text-xs leading-6 text-muted">Tuloy is an independent customization of <a href={BRAND.upstream} target="_blank" rel="noreferrer" className="text-brand-text underline underline-offset-4">Career Ops</a>, originally authored by Santiago Fernández de Valderrama and contributors. The original engine and web application are retained under the MIT license.</p>
        <a href="/explore" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-medium text-brand-foreground transition hover:bg-brand-200">Explore opportunities <ArrowRight aria-hidden="true" className="size-4" /></a>
      </footer>
    </div>
  );
}
