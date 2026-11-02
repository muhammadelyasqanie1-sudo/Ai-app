CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'dari' CHECK (locale IN ('dari','english')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO user_settings(user_id, locale)
SELECT u.id,
       CASE WHEN p.language IN ('dari','english') THEN p.language
            WHEN u.preferred_language IN ('dari','english') THEN u.preferred_language
            ELSE 'dari' END
FROM users u
LEFT JOIN user_preferences p ON p.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_preferences(user_id, language, default_language)
SELECT u.id,
       CASE WHEN p.language IN ('dari','english') THEN p.language
            WHEN u.preferred_language IN ('dari','english') THEN u.preferred_language
            ELSE 'dari' END,
       CASE WHEN p.default_language IN ('dari','english') THEN p.default_language
            WHEN u.preferred_language IN ('dari','english') THEN u.preferred_language
            ELSE 'dari' END
FROM users u
LEFT JOIN user_preferences p ON p.user_id=u.id
ON CONFLICT (user_id) DO NOTHING;
