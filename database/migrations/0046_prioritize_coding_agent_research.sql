-- Keep priorities within the schema's 0..10 range while making coding agents
-- outrank the generic AI/ML curriculum.
UPDATE world_knowledge_topics SET priority=10,updated_at=now() WHERE topic_key='coding-agents';
UPDATE world_knowledge_topics SET priority=9,updated_at=now()
WHERE topic_key IN ('ai-ml','open-source','browser-automation','compiler-tooling','testing-quality','architecture');
