// localStorage wrapper: personal best, unlocked skins, last initials/emoji, score queue

const KEYS = {
  best: "snakejr.best",
  emoji: "snakejr.emoji",
  initials: "snakejr.initials",
  skin: "snakejr.skin",
  queue: "snakejr.queue",
};

const MAX_SCORE_QUEUE = 20;

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const storage = {
  getBest()           { return read(KEYS.best, 0); },
  setBest(n)          { write(KEYS.best, n); },
  getEmoji()          { return read(KEYS.emoji, "🔥"); },
  setEmoji(e)         { write(KEYS.emoji, e); },
  getInitials()       { return read(KEYS.initials, "AAA"); },
  setInitials(s)      { write(KEYS.initials, s); },
  getSkin()           { return read(KEYS.skin, "default"); },
  setSkin(id)         { write(KEYS.skin, id); },

  getQueue()          {
    const queue = read(KEYS.queue, []);
    return Array.isArray(queue) ? queue : [];
  },
  pushQueue(entry)    {
    const q = this.getQueue();
    q.push(entry);
    write(KEYS.queue, q.slice(-MAX_SCORE_QUEUE));
  },
  setQueue(entries)   { write(KEYS.queue, Array.isArray(entries) ? entries.slice(-MAX_SCORE_QUEUE) : []); },
  clearQueue()        { write(KEYS.queue, []); },
};
