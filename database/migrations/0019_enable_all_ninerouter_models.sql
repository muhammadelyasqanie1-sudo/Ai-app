-- Enable the full live 9Router catalogue so every discovered model is listed in AFG AI.
-- This is a one-time bootstrap; subsequent catalogue refreshes preserve admin choices.
UPDATE model_catalog
   SET enabled = true,
       updated_at = now()
 WHERE provider_key = '9router';
