CREATE TABLE IF NOT EXISTS player_stats (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 rating integer NOT NULL DEFAULT 1000, played integer NOT NULL DEFAULT 0,
 wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0, draws integer NOT NULL DEFAULT 0,
 streak integer NOT NULL DEFAULT 0, highest_score integer NOT NULL DEFAULT 0, total_score bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS stats_rating_idx ON player_stats(rating DESC);
CREATE TABLE IF NOT EXISTS matches (
 id text PRIMARY KEY, seed bigint NOT NULL, started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
 duration_ms integer NOT NULL, rated boolean NOT NULL, winner integer, reason text NOT NULL,
 config jsonb NOT NULL, initial_matrices jsonb NOT NULL, final_matrices jsonb NOT NULL, events jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_date_idx ON matches(ended_at DESC);
CREATE TABLE IF NOT EXISTS performance_minutes (
 bucket_start timestamptz NOT NULL, instance_id uuid NOT NULL, metrics jsonb NOT NULL,
 PRIMARY KEY(bucket_start,instance_id)
);
CREATE TABLE IF NOT EXISTS match_participants (
 match_id text NOT NULL REFERENCES matches(id) ON DELETE CASCADE, seat integer NOT NULL,
 user_id text REFERENCES "user"(id) ON DELETE SET NULL, display_name text NOT NULL,
 score integer NOT NULL, result text NOT NULL, rating_before integer, rating_after integer,
 PRIMARY KEY(match_id,seat)
);
CREATE INDEX IF NOT EXISTS participants_user_idx ON match_participants(user_id,match_id);
CREATE TABLE IF NOT EXISTS rating_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 match_id text NOT NULL REFERENCES matches(id), before_rating integer NOT NULL, after_rating integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,match_id)
);
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
UPDATE settings SET value = value || jsonb_build_object(
  'maxRows', LEAST((value->>'maxRows')::int, 5),
  'maxColumns', LEAST((value->>'maxColumns')::int, 5),
  'maxCellValue', LEAST((value->>'maxCellValue')::int, 10000)
), updated_at = now()
WHERE key = 'balance' AND ((value->>'maxRows')::int > 5 OR (value->>'maxColumns')::int > 5 OR (value->>'maxCellValue')::int > 10000);
CREATE TABLE IF NOT EXISTS ad_campaigns (
 id text PRIMARY KEY,name text NOT NULL,headline text NOT NULL,body text NOT NULL,image_url text NOT NULL DEFAULT '',
 destination_url text NOT NULL,cta text NOT NULL,audience text NOT NULL CHECK(audience IN ('everyone','guests','registered')),
 active boolean NOT NULL DEFAULT true,starts_at timestamptz,ends_at timestamptz,duration_ms integer NOT NULL DEFAULT 4000,weight integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_impressions (
 id text PRIMARY KEY,campaign_id text REFERENCES ad_campaigns(id) ON DELETE SET NULL,player_id text NOT NULL,
 match_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),clicked_at timestamptz,UNIQUE(player_id,match_id)
);
CREATE INDEX IF NOT EXISTS ad_impression_campaign_idx ON ad_impressions(campaign_id,created_at);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'legacy';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS speed double precision NOT NULL DEFAULT 1;
ALTER TABLE "user" ALTER COLUMN "isGuest" SET DEFAULT false;
-- Better Auth applies field defaults in its adapter; raw guest/seed inserts need SQL defaults too.
ALTER TABLE "user" ALTER COLUMN city SET DEFAULT '';
ALTER TABLE "user" ALTER COLUMN "countryCode" SET DEFAULT '';
ALTER TABLE "user" ALTER COLUMN "avatarId" SET DEFAULT 'robot-01';
UPDATE "user" SET city=COALESCE(city,''),"countryCode"=COALESCE("countryCode",''),"avatarId"=COALESCE("avatarId",'robot-01')
 WHERE city IS NULL OR "countryCode" IS NULL OR "avatarId" IS NULL;
ALTER TABLE "user" ALTER COLUMN city SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "countryCode" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "avatarId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_guest_import_idx ON "user"("guestImportId") WHERE "guestImportId" IS NOT NULL;
CREATE TABLE IF NOT EXISTS guest_imports (
 id text PRIMARY KEY, guest_id text NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS user_username_idx ON "user"(lower(username)) WHERE username IS NOT NULL;
CREATE TABLE IF NOT EXISTS billing (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 customer_id text UNIQUE, subscription_id text UNIQUE,
 status text NOT NULL DEFAULT 'none', paid_until timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 checkout_id text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
