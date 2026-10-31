alter table public.brackets add column if not exists archived_at timestamptz;
create index if not exists brackets_archived_at_idx on public.brackets(archived_at);
