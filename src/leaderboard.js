// Supabase REST client — no SDK, just fetch.
// The URL and publishable key identify this public browser app; RLS is the
// actual authorization boundary.

import { EMOJIS, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { storage } from "./storage.js";

const MAX_LEADERBOARD_ROWS = 50;

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function headers(extra = {}) {
  return {
    "apikey": SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizeEntry({ emoji, initials, score } = {}) {
  const normalizedInitials = typeof initials === "string" ? initials.trim().toUpperCase() : "";
  const normalizedScore = Number(score);
  if (!EMOJIS.includes(emoji)) return null;
  if (!/^[A-Z]{3}$/.test(normalizedInitials)) return null;
  if (!Number.isInteger(normalizedScore) || normalizedScore < 0 || normalizedScore > 9999) return null;
  return { emoji, initials: normalizedInitials, score: normalizedScore };
}

export async function fetchTop(limit = 50) {
  if (!configured()) return { ok: false, reason: "not-configured", rows: [] };
  const requestedLimit = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : MAX_LEADERBOARD_ROWS;
  const safeLimit = Math.min(MAX_LEADERBOARD_ROWS, Math.max(1, requestedLimit));
  const params = new URLSearchParams({
    select: "id,emoji,initials,score,created_at",
    order: "score.desc,created_at.desc,id.desc",
    limit: String(safeLimit),
  });
  const url = `${SUPABASE_URL}/rest/v1/scores?${params}`;
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return { ok: false, reason: `http-${res.status}`, rows: [] };
    const rows = await res.json();
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    return { ok: false, reason: "network", rows: [] };
  }
}

export async function submitScore(scoreData) {
  const entry = normalizeEntry(scoreData);
  if (!entry) return { ok: false, reason: "invalid", queued: false };
  if (!configured()) {
    storage.pushQueue(entry);
    return { ok: false, reason: "not-configured", queued: true };
  }
  const url = `${SUPABASE_URL}/rest/v1/scores`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      // 4xx means the server rejected the entry (validation) — retrying the
      // same payload will never succeed, so don't queue it. 5xx may be
      // transient, so queue for a retry on the next visit.
      if (res.status >= 500) {
        storage.pushQueue(entry);
        return { ok: false, reason: `http-${res.status}`, queued: true };
      }
      return { ok: false, reason: `http-${res.status}`, queued: false };
    }
    const [row] = await res.json();
    return { ok: true, row };
  } catch (e) {
    storage.pushQueue(entry);
    return { ok: false, reason: "network", queued: true };
  }
}

// Try to flush any queued scores on load. Best-effort, fire-and-forget.
export async function flushQueue() {
  if (!configured()) return;
  const queue = storage.getQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const queuedEntry of queue) {
    const entry = normalizeEntry(queuedEntry);
    if (!entry) continue;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: "POST",
        headers: headers({ Prefer: "return=minimal" }),
        body: JSON.stringify(entry),
      });
      // Keep only entries worth retrying — drop permanent (4xx) rejections.
      if (!res.ok && res.status >= 500) remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  storage.setQueue(remaining);
}
