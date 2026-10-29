-- DYNamiQ MemeForge. Public chain snapshots are not personal data.
-- Per-user rows are always scoped by the verified session user id.

create table if not exists profiles (
  user_id      text primary key,
  display_name text not null default '',
  wallet_pubkey text,
  role         text not null default 'advertiser' check (role in ('advertiser', 'admin')),
  created_at   timestamptz not null default now()
);

create table if not exists token_lookups (
  mint              text primary key,
  name              text,
  symbol            text,
  decimals          integer,
  supply_raw        text,
  supply_ui         text,
  mint_authority    text,
  freeze_authority  text,
  owner_program     text,
  price_usd         text,
  market_cap_usd    text,
  liquidity_usd     text,
  volume_24h_usd    text,
  market_pair_url   text,
  market_source     text,
  chain_source      text not null,
  fetched_at        timestamptz not null default now(),
  fetched_by        text not null
);

create table if not exists creatives (
  id             text primary key,
  user_id        text not null,
  kind           text not null check (kind in ('meme', 'graphic', 'copy')),
  title          text not null,
  prompt         text,
  copy_text      text,
  image_data     text,
  review_status  text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_note    text,
  created_at     timestamptz not null default now()
);
create index if not exists creatives_user_idx on creatives (user_id, created_at desc);

create table if not exists campaigns (
  id                  text primary key,
  user_id             text not null,
  name                text not null,
  mint                text not null,
  channels            text not null,
  headline            text not null,
  body                text not null,
  cta                 text not null,
  destination_url     text,
  targeting           text not null default '{}',
  status              text not null default 'draft' check (status in ('draft', 'in_review', 'live', 'paused', 'rejected')),
  creative_id         text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  onchain_cluster     text,
  onchain_memo        text,
  onchain_signature   text,
  onchain_verified_at timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists campaigns_user_idx on campaigns (user_id, updated_at desc);
create index if not exists campaigns_status_idx on campaigns (status);

create table if not exists partners (
  id             text primary key,
  user_id        text not null,
  name           text not null,
  site_url       text not null,
  api_key_hash   text not null,
  api_key_prefix text not null,
  status         text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  created_at     timestamptz not null default now()
);
create index if not exists partners_user_idx on partners (user_id);

create table if not exists missions (
  id           text primary key,
  campaign_id  text not null,
  user_id      text not null,
  proof_url    text not null,
  note         text,
  status       text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected')),
  review_note  text,
  created_at   timestamptz not null default now()
);
create index if not exists missions_campaign_idx on missions (campaign_id, created_at desc);

create table if not exists abuse_reports (
  id           text primary key,
  user_id      text not null,
  campaign_id  text not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);

create table if not exists analytics_events (
  id           bigserial primary key,
  campaign_id  text not null,
  partner_id   text,
  surface      text not null check (surface in ('property', 'partner')),
  event_type   text not null check (event_type in ('impression', 'click')),
  slot         text,
  created_at   timestamptz not null default now()
);
create index if not exists analytics_campaign_idx on analytics_events (campaign_id, created_at desc);

create table if not exists activity_logs (
  id         bigserial primary key,
  actor_id   text,
  action     text not null,
  target     text,
  detail     text,
  created_at timestamptz not null default now()
);

create table if not exists rate_limits (
  bucket       text primary key,
  window_start timestamptz not null,
  hits         integer not null
);
