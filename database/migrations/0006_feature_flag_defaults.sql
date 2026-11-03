-- Operational feature flags are seeded disabled until a real backend capability is configured.
INSERT INTO feature_flags(flag_key,enabled,description)
VALUES
 ('chat',true,'Enable AI chat when a verified chat model is available.'),
 ('research',false,'Enable Tavily-backed web research; requires TAVILY_API_KEY.'),
 ('web_research_enabled',false,'Admin control alias for Tavily-backed web research.'),
 ('voice',false,'Enable server-side voice; requires a verified speech provider.'),
 ('voice_enabled',false,'Admin control alias for server-side voice.'),
 ('image_generation_enabled',false,'Enable image generation only after a verified image provider and generation endpoint exist.'),
 ('terminal_exec_enabled',false,'Shell execution is disabled until an isolated command sandbox is implemented.'),
 ('offline_sync_enabled',false,'Offline pack synchronization is disabled until signed pack sync is implemented.')
ON CONFLICT(flag_key) DO NOTHING;

INSERT INTO system_config(key,value_json)
VALUES('daily_cost_threshold_usd','25'::jsonb)
ON CONFLICT(key) DO NOTHING;
