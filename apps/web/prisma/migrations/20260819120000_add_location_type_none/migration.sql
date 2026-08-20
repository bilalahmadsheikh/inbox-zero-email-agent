-- Adds a "no location" option used by calendar events created from chat.
-- Additive only: existing rows keep their current value and no default changes.
ALTER TYPE "BookingLinkLocationType" ADD VALUE IF NOT EXISTS 'NONE';
