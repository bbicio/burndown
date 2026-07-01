-- 012_currencies.sql
-- Multi-currency support: currencies master table, rate history log,
-- and schema updates to cost_grid_versions, projects, ratecard_entries.

-- ── Master table ──────────────────────────────────────────────────────────────
CREATE TABLE currencies (
  code         VARCHAR(10)    PRIMARY KEY,
  symbol       VARCHAR(10)    NOT NULL,
  name         VARCHAR(100)   NOT NULL,
  locale       VARCHAR(20)    NOT NULL,
  active       BOOLEAN        NOT NULL DEFAULT false,
  current_rate DECIMAL(10,6)  NOT NULL DEFAULT 1.0,
  updated_at   TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- EUR is always active and locked at 1:1
INSERT INTO currencies (code, symbol, name, locale, active, current_rate) VALUES
  ('EUR', '€',     'Euro',               'it-IT', true,  1.0),
  ('USD', '$',     'US Dollar',          'en-US', false, 1.0),
  ('GBP', '£',     'British Pound',      'en-GB', false, 1.0),
  ('CHF', 'CHF',   'Swiss Franc',        'de-CH', false, 1.0),
  ('JPY', '¥',     'Japanese Yen',       'ja-JP', false, 1.0),
  ('CAD', 'CA$',   'Canadian Dollar',    'en-CA', false, 1.0),
  ('AUD', 'A$',    'Australian Dollar',  'en-AU', false, 1.0),
  ('DKK', 'kr',    'Danish Krone',       'da-DK', false, 1.0),
  ('NOK', 'kr',    'Norwegian Krone',    'nb-NO', false, 1.0),
  ('SEK', 'kr',    'Swedish Krona',      'sv-SE', false, 1.0),
  ('PLN', 'zł',    'Polish Zloty',       'pl-PL', false, 1.0),
  ('CZK', 'Kč',    'Czech Koruna',       'cs-CZ', false, 1.0),
  ('HUF', 'Ft',    'Hungarian Forint',   'hu-HU', false, 1.0),
  ('RON', 'lei',   'Romanian Leu',       'ro-RO', false, 1.0),
  ('BGN', 'лв',    'Bulgarian Lev',      'bg-BG', false, 1.0),
  ('CNY', '¥',     'Chinese Yuan',       'zh-CN', false, 1.0),
  ('INR', '₹',     'Indian Rupee',       'hi-IN', false, 1.0),
  ('BRL', 'R$',    'Brazilian Real',     'pt-BR', false, 1.0),
  ('SGD', 'S$',    'Singapore Dollar',   'en-SG', false, 1.0),
  ('AED', 'د.إ',   'UAE Dirham',         'ar-AE', false, 1.0);

-- ── Rate history log ──────────────────────────────────────────────────────────
CREATE TABLE currency_rates (
  id            SERIAL PRIMARY KEY,
  currency_code VARCHAR(10)   NOT NULL REFERENCES currencies(code),
  rate          DECIMAL(10,6) NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  created_by    UUID          REFERENCES users(id)
);

-- ── cost_grid_versions ────────────────────────────────────────────────────────
ALTER TABLE cost_grid_versions
  DROP COLUMN IF EXISTS currency;

ALTER TABLE cost_grid_versions
  ADD COLUMN currency      VARCHAR(10)   NOT NULL DEFAULT 'EUR' REFERENCES currencies(code),
  ADD COLUMN currency_rate DECIMAL(10,6) NOT NULL DEFAULT 1.0;

-- ── projects ──────────────────────────────────────────────────────────────────
ALTER TABLE projects
  DROP COLUMN IF EXISTS currency;

ALTER TABLE projects
  ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'EUR' REFERENCES currencies(code);

-- ── ratecard_entries ──────────────────────────────────────────────────────────
ALTER TABLE ratecard_entries
  ADD COLUMN IF NOT EXISTS rate_overrides JSONB NOT NULL DEFAULT '{}';
