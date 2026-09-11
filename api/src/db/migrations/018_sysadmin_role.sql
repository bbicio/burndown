-- Migration 018: allow role = 'sysadmin' on users (third tier above 'admin')
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'sysadmin'));
