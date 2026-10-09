-- Meta / Google Ads credentials become one team connection managed by supervisors (shared.* keys).
-- Carry over the connection the supervisor used until now, so syncing keeps working: their personal
-- (user.<id>.*) rows, or else the legacy global rows they saved, which older releases read for the user in
-- updated_by_id. Ciphertexts are bound to AUTH_SECRET only, so they are copied as they are. Source rows are
-- left untouched (google.connection stays the Google Sheets fallback); advertisers' personal rows are no longer read.
WITH src AS (
  SELECT u.id FROM users u JOIN app_settings s ON s.key = 'user.' || u.id || '.meta.access_token'
  WHERE u.role = 'supervisor' AND u.is_active AND s.value <> ''
  ORDER BY s.updated_at DESC LIMIT 1
)
INSERT INTO app_settings (key, value, updated_by_id, updated_at)
SELECT 'shared.' || substring(s.key FROM length('user.' || src.id || '.') + 1), s.value, src.id, now()
FROM app_settings s, src
WHERE s.key IN ('user.' || src.id || '.meta.access_token', 'user.' || src.id || '.meta.app_id', 'user.' || src.id || '.meta.app_secret', 'user.' || src.id || '.meta.token_info')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO app_settings (key, value, updated_by_id, updated_at)
SELECT 'shared.' || s.key, s.value, s.updated_by_id, now()
FROM app_settings s JOIN users u ON u.id = s.updated_by_id
WHERE s.key IN ('meta.access_token', 'meta.app_id', 'meta.app_secret', 'meta.token_info')
  AND u.role = 'supervisor' AND u.is_active AND s.value <> ''
  AND NOT EXISTS (SELECT 1 FROM app_settings x WHERE x.key = 'shared.meta.access_token')
  AND EXISTS (SELECT 1 FROM app_settings t JOIN users tu ON tu.id = t.updated_by_id WHERE t.key = 'meta.access_token' AND tu.role = 'supervisor' AND tu.is_active AND t.value <> '')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
WITH candidates AS (
  SELECT s.value, u.id AS owner, 1 AS priority, s.updated_at FROM users u JOIN app_settings s ON s.key = 'user.' || u.id || '.google.connection'
  WHERE u.role = 'supervisor' AND u.is_active AND s.value <> ''
  UNION ALL
  SELECT s.value, u.id, 2, s.updated_at FROM app_settings s JOIN users u ON u.id = s.updated_by_id
  WHERE s.key = 'google.connection' AND u.role = 'supervisor' AND u.is_active AND s.value <> ''
)
INSERT INTO app_settings (key, value, updated_by_id, updated_at)
SELECT 'shared.google_ads.connection', value, owner, now()
FROM candidates ORDER BY priority, updated_at DESC LIMIT 1
ON CONFLICT (key) DO NOTHING;
