-- Run this once in Supabase SQL Editor
alter table public.stock_products
  add column if not exists stock_type text not null default 'unit',
  add column if not exists bottle_ml integer,
  add column if not exists measure_ml integer not null default 25,
  add column if not exists containers_received numeric not null default 0;

-- Spirits are tracked internally as 25ml measures, while containers_received
-- keeps the number of bottles visible for stock checks.
