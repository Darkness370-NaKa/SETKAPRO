-- Store match fouls and pending remarks for direct display in the bracket.
alter table public.matches
  add column if not exists fouls_a integer not null default 0 check (fouls_a >= 0),
  add column if not exists fouls_b integer not null default 0 check (fouls_b >= 0),
  add column if not exists remarks_a integer not null default 0 check (remarks_a >= 0 and remarks_a <= 1),
  add column if not exists remarks_b integer not null default 0 check (remarks_b >= 0 and remarks_b <= 1),
  add column if not exists finish_reason text;
