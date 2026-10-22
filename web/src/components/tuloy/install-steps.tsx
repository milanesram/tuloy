"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const COMMANDS = "npm install --ignore-scripts\nnpm --prefix web ci --ignore-scripts\nnpm run setup\nnpm start";

export function InstallSteps() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(COMMANDS); setCopied(true); setError(""); }
    catch { setError("Select the commands below to copy them."); }
  }
  return (
    <details className="mt-5 rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-foreground">Install from a source copy</summary>
      <div className="border-t border-border px-5 pb-5">
        <div className="flex items-center justify-between gap-3 py-3"><p className="text-xs text-muted">From the project folder · Node.js 24 and npm</p><button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-1.5 text-xs text-brand-text">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy commands"}</button></div>
        <pre className="overflow-x-auto rounded-lg bg-background p-4 text-xs leading-7 text-foreground"><code>{COMMANDS}</code></pre>
        <p className="mt-3 text-xs leading-6 text-muted">Setup asks for your own CV and preferences. Then open http://127.0.0.1:3210. AI-assisted features use a tool you configure in Settings.</p>
        <p role="status" className="text-xs leading-6 text-brand-text">{error || (copied ? "Setup commands copied." : "")}</p>
      </div>
    </details>
  );
}
