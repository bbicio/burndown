-- Currency cycle 3: a client rate card entry may have no EUR rate.
-- NULL hourly_rate = no client EUR rate for the role; the agency default (roles.hourly_rate) applies.
-- Idempotent. Applied by hand.
ALTER TABLE ratecard_entries ALTER COLUMN hourly_rate DROP NOT NULL;
