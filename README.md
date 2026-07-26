# Snake Jr. 🐍

A juicy little snake game for iPad, built for a 7-year-old. Swipe to turn, eat apples, chase the **golden 67-point apple**, unlock new snake skins, post your initials on the global leaderboard.

- Vanilla HTML/CSS/JS + Canvas 2D — no build step
- Designed for iPad Safari (touch swipes), but works on desktop too (arrow keys / WASD)
- Persistent global leaderboard via Supabase free tier
- Ships as static files to GitHub Pages

## How it plays

| | |
|---|---|
| Move | Swipe up/down/left/right anywhere on the play area. Desktop: arrow keys or WASD. |
| Walls | Wrap around — no death on edges. |
| Death | Only by running into your own tail. |
| Speed | Increases with every apple eaten. |
| 🍎 | +1 point. |
| ✨ 67 ✨ | Rare golden apple, +67 points. Disappears after 8 seconds. |
| Combo | Eat the next apple within ~2.6s to chain a combo, up to 5× (MAX AURA). Golden apples are always exactly +67 — no multiplier. |
| Milestones | Score 10/25/33/50/67/100/134/150/201/250 triggers a celebration banner. |
| Skins | Unlock new snake skins by setting personal bests (15, 25, 33, 50, 67, 100, 150, 250). |
| Pause / Mute | ⏸ and 🔊 live in the top-right HUD. Auto-pauses if the app is backgrounded. |
| Flavor | Title taglines and game-over headings rotate randomly from lists in `src/config.js` — refresh them as the memes age. |

## Project layout

```
snake_jr/
├── index.html
├── styles.css
├── README.md
├── supabase/
│   └── migrations/     # tracked database schema + RLS policies
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
    └── config.js        # constants, meme text, Supabase publishable config
```
