-- NEXUS Investment Suite — Supabase Schema
-- Run this in the Supabase SQL Editor after creating your project.
-- Requires: Authentication enabled (Supabase Auth)

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id        uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username  text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Trigger: auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- PORTFOLIOS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portfolios (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL DEFAULT 'Mein Portfolio',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- POSITIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS positions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE NOT NULL,
  ticker       text NOT NULL,
  name         text,
  buy_price    numeric(18, 4) NOT NULL,
  buy_date     date NOT NULL,
  shares       numeric(18, 6) NOT NULL,
  sector       text,
  region       text,
  currency     text DEFAULT 'USD',
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_positions_ticker    ON positions(ticker);

CREATE TABLE IF NOT EXISTS watchlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  ticker text NOT NULL,
  name text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, ticker)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- POSITION TRANSACTION HISTORY
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS position_transactions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  position_id   uuid REFERENCES positions(id) ON DELETE CASCADE NOT NULL,
  entry_price   numeric(18, 4) NOT NULL,
  shares        numeric(18, 6) NOT NULL,
  purchase_date date NOT NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_position_transactions_position
  ON position_transactions(position_id, purchase_date DESC, created_at DESC);

-- Trigger: update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS positions_updated_at ON positions;
CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- API KEYS (BYOK)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  provider      text NOT NULL,                -- 'claude' | 'alpha_vantage' | 'ollama'
  encrypted_key text NOT NULL,               -- AES-256 encrypted
  is_active     boolean DEFAULT true,
  last_tested   timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, provider);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_unique ON api_keys(user_id, provider) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- ANALYSIS CACHE (replaces SQLite altair_reports + elara_results)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analysis_cache (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_type   text NOT NULL,     -- 'altair' | 'elara'
  cache_key    text NOT NULL,     -- ticker or sector_query
  report_json  jsonb NOT NULL,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cache_lookup ON analysis_cache(cache_type, cache_key, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist   ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own profile
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Portfolios: users can only CRUD their own
CREATE POLICY "portfolios_owner" ON portfolios
  FOR ALL USING (auth.uid() = user_id);

-- Positions: via portfolio ownership
CREATE POLICY "positions_owner" ON positions
  FOR ALL USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

CREATE POLICY "watchlist_owner" ON watchlist
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "position_transactions_owner" ON position_transactions
  FOR ALL USING (
    position_id IN (
      SELECT p.id FROM positions p
      JOIN portfolios pf ON pf.id = p.portfolio_id
      WHERE pf.user_id = auth.uid()
    )
  );

-- API keys: users own their keys
CREATE POLICY "api_keys_owner" ON api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Analysis cache: authenticated read + write (prevents unauthenticated leak of generated reports)
CREATE POLICY "cache_read_auth"   ON analysis_cache FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cache_write_auth"  ON analysis_cache FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "cache_update_auth" ON analysis_cache FOR UPDATE USING (auth.role() = 'authenticated');
