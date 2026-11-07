-- Re-prioritize queued work after topic curriculum priority changes.
UPDATE world_knowledge_research_jobs j
SET priority=t.priority,updated_at=now()
FROM world_knowledge_topics t
WHERE j.topic_key=t.topic_key
  AND j.status IN ('queued','failed')
  AND j.priority IS DISTINCT FROM t.priority;
