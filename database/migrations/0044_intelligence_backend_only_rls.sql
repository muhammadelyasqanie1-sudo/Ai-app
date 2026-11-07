-- All intelligence and research tables are backend-only. The application uses
-- its authenticated server API and a private PostgreSQL connection; no direct
-- anon/authenticated Data API access is granted to these tables.
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_knowledge_research_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_knowledge_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_knowledge_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_knowledge_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_knowledge_code_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_automation_profiles ENABLE ROW LEVEL SECURITY;
