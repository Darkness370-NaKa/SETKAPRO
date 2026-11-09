create table if not exists public.qr_login_requests (
  id uuid primary key,
  qr_token_hash text not null,
  desktop_token_hash text not null,
  auth_token_hash text,
  user_id uuid references auth.users(id) on delete cascade,
  approved_email text,
  status text not null default 'pending' check (status in ('pending','approving','approved','consumed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz
);

create index if not exists qr_login_requests_expires_at_idx
  on public.qr_login_requests (expires_at);

alter table public.qr_login_requests enable row level security;
revoke all on table public.qr_login_requests from public, anon, authenticated;
