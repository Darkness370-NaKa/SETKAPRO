-- Double-elimination graph metadata for SETKA PRO
alter table public.matches
  add column if not exists bracket_side text not null default 'winners'
    check (bracket_side in ('winners','losers','grand_final','reset_final')),
  add column if not exists next_match_id uuid references public.matches(id) on delete set null,
  add column if not exists next_slot text check (next_slot in ('athlete_a_id','athlete_b_id')),
  add column if not exists loser_next_match_id uuid references public.matches(id) on delete set null,
  add column if not exists loser_next_slot text check (loser_next_slot in ('athlete_a_id','athlete_b_id'));
create index if not exists matches_next_match_idx on public.matches(next_match_id);
create index if not exists matches_loser_next_match_idx on public.matches(loser_next_match_id);
