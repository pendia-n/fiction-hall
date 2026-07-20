-- Add stripe_country column for Connect account country detection
ALTER TABLE user ADD COLUMN stripe_country TEXT;

-- Seed alohai as HK for testing blocked gift flow
UPDATE user SET stripe_country = 'HK' WHERE username = 'alohai';
