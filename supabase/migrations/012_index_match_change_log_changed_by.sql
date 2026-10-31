-- Index the audit actor foreign key to keep history cleanup and joins efficient.
create index if not exists match_change_log_changed_by_idx
  on public.match_change_log (changed_by);
