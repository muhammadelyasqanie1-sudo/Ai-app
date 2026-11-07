-- Explicitly discover permissively licensed public GitHub repositories
-- for coding agents, browser automation, compiler tooling and open-source
-- engineering. Repository text is still indexed only after license checks.
UPDATE world_knowledge_topics
SET search_queries = search_queries || ARRAY[
  'site:github.com open source AI coding agent repository tool calling multi file editing planner',
  'site:github.com repository aware coding agent software engineering agent SWE bench open source'
], updated_at=now()
WHERE topic_key='coding-agents';

UPDATE world_knowledge_topics
SET search_queries = search_queries || ARRAY[
  'site:github.com popular open source developer tools libraries frameworks software engineering repository',
  'site:github.com open source reference implementations algorithms data structures software architecture'
], updated_at=now()
WHERE topic_key='open-source';

UPDATE world_knowledge_topics
SET search_queries = search_queries || ARRAY[
  'site:github.com Playwright browser automation open source agent repository examples',
  'site:github.com browser-use browser automation computer use agent open source'
], updated_at=now()
WHERE topic_key='browser-automation';

UPDATE world_knowledge_topics
SET search_queries = search_queries || ARRAY[
  'site:github.com tree-sitter language server protocol AST code intelligence open source',
  'site:github.com compiler parser static analysis language tooling repository'
], updated_at=now()
WHERE topic_key='compiler-tooling';

UPDATE world_knowledge_topics
SET search_queries = search_queries || ARRAY[
  'site:github.com distributed systems reference implementation consensus queue event streaming',
  'site:github.com production ready backend architecture microservices example repository'
], updated_at=now()
WHERE topic_key='distributed-systems';
