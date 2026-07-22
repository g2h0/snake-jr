begin;

create table public.scores (
  id bigint generated always as identity primary key,
  emoji text not null,
  initials text not null,
  score integer not null,
  created_at timestamptz not null default now(),

  constraint scores_emoji_allowed check (
    emoji = any (array[
      '🔥','🐢','🦖','🌮','👽','🦄','🍕','🎮',
      '🐸','🦊','🍩','🚀','🌈','⚡','💎','🦦',
      '🐙','🍉','🪐','🍦','🐉','🦕','🐳','🧃',
      '🗿','🥶','🫡','🧋','👾','🫧','🦥','🍄'
    ]::text[])
  ),
  constraint scores_initials_format check (initials ~ '^[A-Z]{3}$'),
  constraint scores_score_range check (score between 0 and 9999)
);

create index scores_leaderboard_idx
  on public.scores (score desc, created_at desc, id desc);

alter table public.scores enable row level security;

-- Start from no public table privileges, then grant only what the browser uses.
revoke all on table public.scores from public, anon, authenticated;
grant select on table public.scores to anon;
grant insert (emoji, initials, score) on table public.scores to anon;

create policy "Public scores are readable"
  on public.scores
  for select
  to anon
  using (true);

create policy "Valid public scores are insertable"
  on public.scores
  for insert
  to anon
  with check (
    emoji = any (array[
      '🔥','🐢','🦖','🌮','👽','🦄','🍕','🎮',
      '🐸','🦊','🍩','🚀','🌈','⚡','💎','🦦',
      '🐙','🍉','🪐','🍦','🐉','🦕','🐳','🧃',
      '🗿','🥶','🫡','🧋','👾','🫧','🦥','🍄'
    ]::text[])
    and initials ~ '^[A-Z]{3}$'
    and score between 0 and 9999
  );

commit;
