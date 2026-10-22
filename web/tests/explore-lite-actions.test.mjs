import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("normal Explore offers Review Queue + Open Posting without a legacy evaluate worker", () => {
  const card = read("src/components/explore/discovery-card.tsx");
  assert.match(card, /Add to Review Queue/);
  assert.match(card, /Open the posting/);
  assert.doesNotMatch(card, /startJob\s*\(/);
  assert.doesNotMatch(card, /kind:\s*["']evaluate["']/);
  assert.doesNotMatch(card, />\s*Evaluate\b/);
});

test("Add to Review Queue retains the canonical pipeline persistence path", () => {
  const route = read("src/app/api/explore/add/route.ts");
  const writer = read("src/lib/core/pipeline.ts");
  assert.match(route, /addOffersToPipeline\(offers\)/);
  assert.match(writer, /appendToPipeline/);
  assert.match(writer, /descriptionComplete/);
  assert.match(writer, /appendToScanHistory/);
});

test("AI Search remains wired and separate from Lite queue persistence", () => {
  const explorer = read("src/components/explore/explorer-view.tsx");
  const provider = read("src/components/explore/explore-provider.tsx");
  assert.match(explorer, /AiSearchBox/);
  assert.match(explorer, /discoverAI/);
  assert.match(provider, /\/api\/explore\/ai/);
});
