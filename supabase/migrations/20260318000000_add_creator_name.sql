-- Add creator_name to recipes for original recipe attribution
ALTER TABLE recipes ADD COLUMN creator_name text;
