-- Make the core coding-agent architecture curriculum the first research target.
UPDATE world_knowledge_topics SET priority=12,updated_at=now() WHERE topic_key='coding-agents';
UPDATE world_knowledge_topics SET priority=10,updated_at=now()
WHERE topic_key IN ('open-source','browser-automation','compiler-tooling','testing-quality','architecture');
