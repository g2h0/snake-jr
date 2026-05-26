# Snake Jr. 🐍

A juicy little snake game for iPad, built for a 7-year-old. Swipe to turn, eat apples, chase the **golden 67-point apple**, unlock new snake skins, post your initials on the global leaderboard.

- Vanilla HTML/CSS/JS + Canvas 2D — no build step
- Designed for iPad Safari (touch swipes), but works on desktop too (arrow keys / WASD)
- Persistent global leaderboard via Supabase free tier
- Ships as static files to GitHub Pages

## Quick start (local)

```bash
# from the snake_jr/ directory
python3 -m http.server 8000
# then open http://localhost:8000
```

You can also just double-click `index.html` to open it in a browser, but the ES module imports work most reliably when served over HTTP.

## Leaderboard setup (Supabase, ~10 minutes)

The game itself works offline without Supabase — you just won't have a global leaderboard.

### 1. Create a free Supabase project

Go to [supabase.com](https://supabase.com) → New project. Pick any region, give it a name and database password. Wait ~2 minutes for it to provision.

### 2. Create the `scores` table

In the Supabase dashboard, open **SQL Editor** → **New query**, paste this, and click **Run**:

```sql
create table public.scores (
  id          bigint generated always as identity primary key,
  emoji       text   not null check (char_length(emoji) between 1 and 8),
  initials    text   not null check (initials ~ '^[A-Z]{3}$'),
  score       int    not null check (score between 0 and 9999),
  created_at  timestamptz default now() not null
);
create index scores_score_desc on public.scores (score desc, created_at desc);

alter table public.scores enable row level security;

create policy "public read" on public.scores
  for select using (true);

create policy "public insert" on public.scores
  for insert with check (
    char_length(initials) = 3
    and initials ~ '^[A-Z]{3}$'
    and score between 0 and 9999
    and char_length(emoji) between 1 and 8
  );
```

### 3. Get your URL + anon key

In the Supabase dashboard: **Project Settings → API** (or **API Keys**). Copy the **Project URL** and the **`anon` `public` key**.

> Both are safe to commit publicly. The anon key is meant for browser use — Row Level Security (the policies above) controls what it can actually do (read all scores, insert valid scores, nothing else).

### 4. Paste into `src/config.js`

```js
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGc...your-anon-key...";
```

Reload the page. The leaderboard should now load (and be empty). Play a round, submit a score, and watch yourself appear at the top.

## Deploying to GitHub Pages

1. Push this directory to a GitHub repo (e.g. `snake-jr`).
2. In the repo: **Settings → Pages**.
3. Source: **Deploy from a branch** → Branch: **main** / Folder: **/ (root)**. Save.
4. Wait a minute, then visit `https://<your-username>.github.io/snake-jr/`.

For a custom subdomain like `snake.g2h0.xyz`, add a CNAME file with that hostname and configure DNS to point at GitHub Pages.

## How it plays

| | |
|---|---|
| Move | Swipe up/down/left/right anywhere on the play area. Desktop: arrow keys or WASD. |
| Walls | Wrap around — no death on edges. |
| Death | Only by running into your own tail. |
| Speed | Increases with every apple eaten. |
| 🍎 | +1 point. |
| ✨ 67 ✨ | Rare golden apple, +67 points. Disappears after 8 seconds. |
| Combo | Eat apples quickly to multiply score up to 5×. |
| Milestones | Score 10/25/50/67/100/150/250 triggers a celebration banner. |
| Skins | Unlock new snake skins by setting personal bests (25, 50, 67, 100, 150). |

## Project layout

```
snake_jr/
├── index.html
├── styles.css
├── README.md
└── src/
    ├── main.js          # boot + scene routing
    ├── game.js          # game loop & state
    ├── renderer.js      # canvas drawing
    ├── input.js         # swipe + keyboard
    ├── effects.js       # shake, popups, confetti
    ├── audio.js         # Web Audio synth (no asset files)
    ├── haptics.js       # navigator.vibrate wrapper
    ├── skins.js         # skin catalog + unlock logic
    ├── storage.js       # localStorage wrapper
    ├── leaderboard.js   # Supabase REST client
    └── config.js        # constants + Supabase keys
```

## Verification checklist

- [ ] Page loads, title screen shows logo and Play button
- [ ] Arrow keys (desktop) or swipe (iPad) turn the snake
- [ ] Eating an apple increases the score and the snake grows
- [ ] Snake speeds up as score climbs
- [ ] Self-collision triggers the score-entry screen
- [ ] Wrapping around the wall works on all 4 sides
- [ ] A golden ✨ apple appears occasionally and grants 67 points + confetti
- [ ] Milestone banners fire at the scores in `config.js`
- [ ] Submitting a score posts to Supabase and appears at the top of the leaderboard
- [ ] Reloading shows the same global leaderboard (proves global persistence)
- [ ] On iPad Safari: no pinch-zoom or scroll while playing
