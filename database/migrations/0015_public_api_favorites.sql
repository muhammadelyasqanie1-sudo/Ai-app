-- User-owned API bookmarks keep catalog discovery useful across sessions and devices.
CREATE TABLE IF NOT EXISTS user_public_api_favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key text NOT NULL REFERENCES public_api_catalog(source_key) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,source_key)
);
CREATE INDEX IF NOT EXISTS user_public_api_favorites_user_idx
  ON user_public_api_favorites(user_id,created_at DESC);
