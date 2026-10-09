-- The Kie.ai API key becomes one team key managed by supervisors (shared.kie.*). Carry over the key of the
-- active supervisor who saved one most recently (personal user.<id>.kie.* rows, or legacy global kie.* rows
-- they saved), so Analisa AI keeps working for everyone. Ciphertexts are bound to AUTH_SECRET only, so they
-- are copied as they are. Source rows are left untouched and no longer read.
WITH candidates AS (
  SELECT u.id AS owner, 'user.' || u.id || '.' AS prefix, s.updated_at FROM users u JOIN app_settings s ON s.key = 'user.' || u.id || '.kie.api_key'
  WHERE u.role = 'supervisor' AND u.is_active AND s.value <> ''
  UNION ALL
  SELECT u.id, '', s.updated_at FROM app_settings s JOIN users u ON u.id = s.updated_by_id
  WHERE s.key = 'kie.api_key' AND u.role = 'supervisor' AND u.is_active AND s.value <> ''
), src AS (SELECT owner, prefix FROM candidates ORDER BY updated_at DESC LIMIT 1)
INSERT INTO app_settings (key, value, updated_by_id, updated_at)
SELECT 'shared.' || substring(s.key FROM length(src.prefix) + 1), s.value, src.owner, now()
FROM app_settings s, src
WHERE s.key IN (src.prefix || 'kie.api_key', src.prefix || 'kie.key_info') AND s.value <> ''
ON CONFLICT (key) DO NOTHING;
