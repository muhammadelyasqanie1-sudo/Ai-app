-- Public APIs MCP directory and owner-scoped remote Streamable HTTP connections.
CREATE TABLE IF NOT EXISTS mcp_directory_catalog (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  auth_type text NOT NULL DEFAULT 'Unknown',
  transports text[] NOT NULL DEFAULT ARRAY[]::text[],
  website_url text,
  install_url text,
  endpoint_url text,
  source_url text NOT NULL DEFAULT 'https://publicapis.lol/mcp',
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_directory_catalog_name_idx ON mcp_directory_catalog(name);

INSERT INTO mcp_directory_catalog(slug,name,description,auth_type,transports,website_url,endpoint_url) VALUES
('ipstack','ipstack MCP server','IP geolocation, threat and timezone lookups for agents','apiKey',ARRAY['stdio','http'],'https://ipstack.com','https://mcp.apilayer.com/mcp'),
('agent-nexus','Agent Nexus','Find agent-callable APIs, MCP servers and CLIs by capability, with live health and uptime data','No auth',ARRAY['http'],'https://agentnexus.app',NULL),
('blockvectra','BlockVectra','Blockchain RPC and indexed data; keyless documentation and chain discovery','apiKey',ARRAY['http'],'https://github.com',NULL),
('catastro-gps','Catastro GPS','Cadastral parcels in 29 European countries by reference, point or address','apiKey',ARRAY['stdio'],'https://github.com',NULL),
('corpusai-cloud-pricing','corpusAI Cloud Pricing','Cloud, GPU and LLM token prices for agents, free discovery tools and paid per-call data','No auth',ARRAY['stdio','http'],'https://www.trycorpus.ai',NULL),
('council-of-ai','Council of AI','Read a signed AI measurement board and verify its signed records and Merkle proofs','No auth',ARRAY['http'],'https://councilof.ai',NULL),
('edgepedia','Edgepedia','Search and read Edgepedia, a free and growing encyclopedia with citations','No auth',ARRAY['http'],'https://github.com',NULL),
('filesystem','Filesystem','Read/write local files','No auth',ARRAY['stdio'],'https://github.com/modelcontextprotocol/servers',NULL),
('github','GitHub MCP','Repositories, issues, pull requests and code search','OAuth',ARRAY['stdio','http'],'https://github.com',NULL),
('kuro','Kuro','Create AI images, video clips, voice-overs, music and editable storyboard films','OAuth',ARRAY['http'],'https://meetkuro.com',NULL),
('master-setter','Master Setter','Pokémon TCG cards, sets and printings in 14 languages, searchable by name in any language','apiKey',ARRAY['http'],'https://api.master-setter.com',NULL),
('monocrawl','Monocrawl','Public posts, profiles, comments and products from 70+ social, shopping and search platforms','apiKey',ARRAY['stdio','http'],'https://github.com',NULL),
('openpath','Openpath','US job listings and local businesses for agents, with application links and owner inboxes','No auth',ARRAY['http'],'https://openpath.sh',NULL),
('openswissdata','OpenSwissData','Swiss customs tariff, FINMA register and warnings, NOGA/NACE/ISIC code crosswalks','No auth',ARRAY['stdio','http'],'https://github.com',NULL),
('refnusa','Refnusa','Indonesian holidays, wages, regions, postal codes, tax, food prices and NIK/plate checks','No auth',ARRAY['http'],'https://refnusa.dev',NULL),
('regsentry','RegSentry','Inspect authorized static tracking signals and review supplied consent evidence','No auth',ARRAY['http'],'https://regsentry.com',NULL),
('shapelessai','ShapelessAI','Write, schedule and publish social posts, carousels and short video to 8 networks','OAuth',ARRAY['stdio','http'],'https://shapelessai.com',NULL),
('silicon-floor','Silicon Floor','Who owns AI and chip stocks, what insiders sell, and how fast they grow using SEC filings','No auth',ARRAY['http'],'https://siliconfloor.com',NULL),
('skyaccess','SkyAccess','Search live empty-leg flights, estimate charter prices and get booking links','No auth',ARRAY['http'],'https://github.com',NULL),
('twinbay','Twinbay','Spin up stateful API twins, read request logs and grade agent runs','OAuth',ARRAY['http'],'https://docs.twinbay.ai',NULL),
('us-recalls','US Recalls','Check US recalls from 9 agencies by UPC, model, NDC, lot or VIN','apiKey',ARRAY['http'],'https://recallsapi.com',NULL),
('vuntum','Vuntum','Sourced, dated data on consumer robots and physical AI: specifications, prices and evidence','No auth',ARRAY['http'],'https://github.com',NULL)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
  auth_type=EXCLUDED.auth_type,transports=EXCLUDED.transports,website_url=EXCLUDED.website_url,
  endpoint_url=COALESCE(mcp_directory_catalog.endpoint_url,EXCLUDED.endpoint_url),
  updated_at=now();

CREATE TABLE IF NOT EXISTS user_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 100),
  endpoint_url text NOT NULL CHECK(endpoint_url ~ '^https://'),
  auth_type text NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none','bearer')),
  credential_encrypted text,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','verified','disabled','error')),
  protocol_version text,
  session_id_encrypted text,
  server_info_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  tools_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,name)
);
CREATE INDEX IF NOT EXISTS user_mcp_servers_owner_idx ON user_mcp_servers(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS user_mcp_servers_enabled_idx ON user_mcp_servers(user_id,enabled,status);
