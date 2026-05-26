// localStorage wrapper: personal best, unlocked skins, last initials/emoji, score queue

const KEYS = {
  best: "snakejr.best",
  emoji: "snakejr.emoji",
  initials: "snakejr.initials",
  skin: "snakejr.skin",
  queue: "snakejr.queue",
};

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

  getQueue()          { return read(KEYS.queue, []); },
  pushQueue(entry)    {
    const q = read(KEYS.queue, []);
    q.push(entry);
    write(KEYS.queue, q);
  },
  clearQueue()        { write(KEYS.queue, []); },
};
