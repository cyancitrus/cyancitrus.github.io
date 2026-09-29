import type { Draft } from "./types";

const key = "shiyu-blog-local-drafts";

export function readDrafts(): Draft[] {
  try {
    const drafts = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(drafts) ? drafts : [];
  } catch { return []; }
}

export function saveDraft(draft: Draft) {
  const drafts = readDrafts().filter(item => item.id !== draft.id);
  localStorage.setItem(key, JSON.stringify([draft, ...drafts]));
}

export function removeDraft(id: string) {
  localStorage.setItem(key, JSON.stringify(readDrafts().filter(item => item.id !== id)));
}
