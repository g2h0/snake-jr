// Supabase REST client — no SDK, just fetch.
// Both URL and anon key are public-safe; RLS enforces what the anon role can do.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { storage } from "./storage.js";

function configured() {
  return SUPABASE_URL && SUPABASE_ANON_KEY;
}

function headers(extra = {}) {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function fetchTop(limit = 50) {
  if (!configured()) return { ok: false, reason: "not-configured", rows: [] };
  const url = `${SUPABASE_URL}/rest/v1/scores?select=*&order=score.desc,created_at.desc&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return { ok: false, reason: `http-${res.status}`, rows: [] };
    const rows = await res.json();
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, reason: "network", rows: [] };
  }
}

export async function submitScore({ emoji, initials, score }) {
  const entry = { emoji, initials: initials.toUpperCase(), score: Math.floor(score) };
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
  for (const entry of queue) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(entry),
      });
      // Keep only entries worth retrying — drop permanent (4xx) rejections.
      if (!res.ok && res.status >= 500) remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  if (remaining.length) {
    storage.clearQueue();
    for (const r of remaining) storage.pushQueue(r);
  } else {
    storage.clearQueue();
  }
}
