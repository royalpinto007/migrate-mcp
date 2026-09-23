ALTER TABLE accounts DROP COLUMN legacy_token;
ALTER TABLE accounts ADD COLUMN owner_id UUID NOT NULL;
