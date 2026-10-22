import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Compass, FileCheck2, ListChecks, MapPin, Check, CircleHelp } from "lucide-react";
import { InstallSteps } from "@/components/tuloy/install-steps";

export const metadata: Metadata = {
  title: "Your next chapter starts here",
  description: "Bring your experience. Discover opportunities, understand the fit, and keep moving with Tuloy, a local-first career workspace.",
};

export default function WelcomePage() {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <div>
          <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-brand-text"><span className="h-px w-7 bg-current" />Continue. Come in.</p>
          <h1 className="mt-6 max-w-2xl font-display text-5xl leading-[1.02] tracking-tight text-landing sm:text-6xl lg:text-7xl">Your story<br />continues.<br /><span className="italic">Make room for<br className="hidden lg:block" /> what’s next.</span></h1>
          <p className="mt-7 max-w-md text-base leading-8 text-muted">A career can cross borders, change direction, and begin a new chapter. Bring the experience you already have. Tuloy helps you find your next step.</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="/" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-medium text-brand-foreground hover:bg-brand-200">Open your workspace <ArrowUpRight aria-hidden="true" className="size-4" /></a><a href="#how-it-works" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm text-foreground hover:bg-surface">See how it works <ArrowRight aria-hidden="true" className="size-4" /></a></div>
          <p className="mt-4 text-xs leading-6 text-muted">Runs on your computer today. Your decisions, every step.</p>
        </div>
        <div className="relative overflow-hidden rounded-t-[100px] rounded-b-2xl border border-border bg-surface px-7 py-9 sm:px-10 sm:py-12">
          <p className="text-[10px] font-medium uppercase tracking-[.2em] text-muted">A doorway. A way forward.</p>
          <svg viewBox="0 0 360 320" role="img" aria-labelledby="doorway-title" className="mx-auto my-5 w-full max-w-[330px] text-brand-text">
            <title id="doorway-title">An open doorway with a continuous path moving forward through it</title>
            <path d="M30 281h300" stroke="currentColor" strokeWidth="1" opacity=".18" />
            <path d="M100 266V71c0-13 10-23 23-23h116c13 0 23 10 23 23v195" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M132 266V88h97v178" fill="currentColor" opacity=".05" />
            <path d="M43 292h70c47 0 67-28 67-72V113m-22 23 22-23 22 23" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m134 86 95-16v196l-95 13Z" fill="none" stroke="currentColor" strokeWidth="1" opacity=".25" />
            <circle cx="213" cy="175" r="3" fill="currentColor" opacity=".4" />
          </svg>
          <div className="border-t border-border pt-5"><p className="font-display text-2xl text-landing">Your experience goes with you.</p><p className="mt-2 text-xs leading-6 text-muted">A new place. A new direction. A continuing story.</p></div>
        </div>
      </section>

      <section aria-label="Tuloy principles" className="border-y border-border">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-6 text-sm text-muted sm:grid-cols-3 sm:px-8"><p><span className="mr-2 text-brand-text">01</span> Local by design.</p><p><span className="mr-2 text-brand-text">02</span> Evidence before effort.</p><p><span className="mr-2 text-brand-text">03</span> A human decides.</p></div>
      </section>

      <section id="how-it-works" aria-labelledby="workflow-heading" className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-20">
        <div><p className="text-[11px] uppercase tracking-[.18em] text-brand-text">One place to keep moving</p><h2 id="workflow-heading" className="mt-4 max-w-md font-display text-4xl leading-tight text-landing">From possibility<br />to a considered next step.</h2><p className="mt-5 max-w-md text-sm leading-8 text-muted">Job searching involves more than finding an opening. Tuloy keeps discovery, review, applications, and follow-ups connected—so you can see where you are and decide what comes next.</p>
          <div aria-label="Workflow illustration" className="mt-8 rounded-xl border border-border bg-surface p-5"><p className="text-[10px] uppercase tracking-[.18em] text-muted">The workflow, at a glance</p><div className="mt-5 flex flex-wrap items-center gap-3 text-sm"><span className="inline-flex items-center gap-2 text-brand-text"><Compass className="size-4" />Explore</span><ArrowRight className="size-3 text-faint" /><span className="inline-flex items-center gap-2"><FileCheck2 className="size-4" />Review</span><ArrowRight className="size-3 text-faint" /><span className="inline-flex items-center gap-2"><ListChecks className="size-4" />Track</span></div><div className="mt-5 space-y-3 border-t border-border pt-4 text-xs text-muted"><p className="flex items-center gap-2"><Check className="size-3.5 text-brand-text" />What your experience supports</p><p className="flex items-center gap-2"><CircleHelp className="size-3.5" />What still needs checking</p><p className="flex items-center gap-2"><MapPin className="size-3.5" />Where the role can hire</p></div><p className="mt-4 text-[10px] leading-5 text-faint">Workflow illustration. No personal profile, search, or results shown.</p></div>
        </div>
        <ol className="divide-y divide-border border-y border-border">
          <li className="flex gap-5 py-7"><span className="font-display text-3xl text-brand-text">01</span><div><h3 className="font-medium">Discover with your own direction.</h3><p className="mt-2 text-sm leading-7 text-muted">Search supported employer sources using your role and location preferences. Bring the opportunities you want to examine closer.</p></div></li>
          <li className="flex gap-5 py-7"><span className="font-display text-3xl text-brand-text">02</span><div><h3 className="font-medium">Understand the fit.</h3><p className="mt-2 text-sm leading-7 text-muted">Look at responsibilities, transferable experience, and eligibility. Keep supported evidence separate from unanswered questions.</p></div></li>
          <li className="flex gap-5 py-7"><span className="font-display text-3xl text-brand-text">03</span><div><h3 className="font-medium">Follow through, at your pace.</h3><p className="mt-2 text-sm leading-7 text-muted">Save roles for review, track applications, and manage follow-ups. You choose what to pursue and submit applications yourself.</p></div></li>
        </ol>
      </section>

      <section className="border-y border-border bg-surface/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_1.2fr] lg:gap-20"><div><p className="text-[11px] uppercase tracking-[.18em] text-brand-text">The name carries the idea</p><h2 className="mt-4 font-display text-4xl text-landing">Continue.<br /><span className="italic">Come in.</span></h2></div><div className="space-y-4 text-sm leading-8 text-muted"><p>In Tagalog, <em>tuloy</em> expresses continuation. Said as a welcome, <em>Tuloy!</em> invites you inside. The name holds both ideas together: the experience you carry and the possibilities ahead.</p><p>This is the local setup I use to organize my job search. I’m sharing the application in case it’s useful to you too.</p><Link href="/about" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-text">The story behind Tuloy <ArrowRight aria-hidden="true" className="size-4" /></Link></div></div>
      </section>

      <section id="get-started" aria-labelledby="getting-started-heading" className="mx-auto grid max-w-6xl scroll-mt-24 gap-9 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-20">
        <div><p className="text-[11px] uppercase tracking-[.18em] text-brand-text">Begin with what you have</p><h2 id="getting-started-heading" className="mt-4 font-display text-4xl leading-tight text-landing">Your own workspace.<br />Your own next step.</h2><p className="mt-5 text-sm leading-8 text-muted">Tuloy runs locally today. Start with your CV and preferences, configure the sources and tools you want to use, and explore from there.</p><InstallSteps /></div>
        <div className="border-l border-border pl-7"><p className="text-xs font-semibold text-foreground">Available today</p><p className="mt-3 text-sm leading-8 text-muted">The working local application: discovery, evidence review, a pipeline, application tracking, and follow-ups. Your records are stored on your computer. AI tools you choose may send content to their providers.</p><div className="mt-7 border-t border-border pt-6"><p className="text-xs font-semibold text-foreground">A future chapter</p><p className="mt-3 text-sm leading-8 text-muted">A hosted version could make Tuloy easier to access and set up. That is a future direction, not an available service. The focus today is making the local workspace useful.</p></div></div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-8 sm:pb-20"><div className="flex flex-wrap items-center justify-between gap-7 rounded-2xl bg-brand px-7 py-9 text-brand-foreground sm:px-10 sm:py-11"><div><h2 className="font-display text-3xl sm:text-4xl">Bring your experience.</h2><p className="mt-2 text-sm leading-7">Step into what comes next.</p></div><a href="/" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-medium text-[#126f66] hover:bg-[#f7f6f3]">Open your workspace <ArrowUpRight aria-hidden="true" className="size-4" /></a></div></section>
    </div>
  );
}
