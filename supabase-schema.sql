-- Knights Stock Control shared database
-- Run this entire file once in Supabase -> SQL Editor.

create table if not exists public.stock_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  received integer not null default 0,
  sold integer not null default 0,
  low_stock_level integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

-- Case-insensitive product names are enforced by this unique index.
create unique index if not exists stock_products_name_lower_idx
  on public.stock_products (lower(name));

create table if not exists public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_sales_reports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_takes (
  id uuid primary key default gen_random_uuid(),
  physical_total integer not null default 0,
  expected_total integer not null default 0,
  difference integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.stock_products enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_sales_reports enable row level security;
alter table public.stock_takes enable row level security;

-- This app uses its own simple password screen rather than Supabase Auth.
-- These policies therefore allow the public/publishable client key to read/write
-- the stock data. Do NOT put a secret/service-role key in the browser.
do $$ begin
  create policy "public read products" on public.stock_products for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public insert products" on public.stock_products for insert to anon with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public update products" on public.stock_products for update to anon using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read receipts" on public.stock_receipts for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public insert receipts" on public.stock_receipts for insert to anon with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read sales reports" on public.stock_sales_reports for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public insert sales reports" on public.stock_sales_reports for insert to anon with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read stock takes" on public.stock_takes for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public insert stock takes" on public.stock_takes for insert to anon with check (true);
exception when duplicate_object then null; end $$;
