import fs from "node:fs";
import path from "node:path";

function isRegularContainedFile(candidate, root) {
  try {
    const realRoot = fs.realpathSync(root);
    const realCandidate = fs.realpathSync(candidate);
    return realCandidate.startsWith(`${realRoot}${path.sep}`) && fs.statSync(realCandidate).isFile();
  } catch {
    return false;
  }
}

/** Resolve only a canonical `jds/<basename>` pointer inside the selected data
 * root. Symlinks and traversal that leave jds/ are rejected. */
export function readJdArchive(root, pointer) {
  if (typeof pointer !== "string" || !/^jds\/[A-Za-z0-9._-]+$/.test(pointer)) {
    return { text: null, captured: false };
  }
  const jdsRoot = path.join(root, "jds");
  const candidate = path.resolve(root, pointer);
  if (!candidate.startsWith(`${path.resolve(jdsRoot)}${path.sep}`) || !isRegularContainedFile(candidate, jdsRoot)) {
    return { text: null, captured: false };
  }
  const ext = path.extname(candidate).toLowerCase();
  if (![".md", ".txt", ".html", ".htm"].includes(ext)) {
    // The caller may use its existing PDF extraction path. This result records
    // that the pointer was contained but not directly text-readable here.
    return { text: null, captured: true, candidate, ext };
  }
  try {
    return { text: fs.readFileSync(candidate, "utf8").trim() || null, captured: true, candidate, ext };
  } catch {
    return { text: null, captured: true, candidate, ext };
  }
}
