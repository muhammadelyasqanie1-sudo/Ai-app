-- Programming-only knowledge domain catalog and bounded search-worker metadata.
-- This scopes the knowledge acquisition engine without limiting ordinary chat topics.
CREATE TABLE IF NOT EXISTS world_knowledge_topics (
  topic_key text PRIMARY KEY CHECK (char_length(topic_key) BETWEEN 2 AND 80),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '',
  search_queries text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 5 CHECK (priority BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO world_knowledge_topics(topic_key,label,description,search_queries,priority) VALUES
('languages','Programming languages','Language syntax, semantics, runtimes, compilers and language evolution',ARRAY['programming language design syntax semantics compiler runtime','Python JavaScript TypeScript Java Kotlin C++ Go Rust language updates'],9),
('web-frontend','Web frontend','HTML CSS JavaScript TypeScript UI frameworks accessibility and browser APIs',ARRAY['modern frontend development React Vue Angular Svelte web standards','HTML CSS accessibility browser APIs frontend engineering'],8),
('backend-apis','Backend and APIs','Backend runtimes, API design, protocols, authentication and distributed services',ARRAY['backend engineering REST GraphQL gRPC API design','Node.js Python FastAPI Go backend server architecture'],9),
('databases','Databases and storage','SQL, NoSQL, transactions, indexing, replication, caching and data systems',ARRAY['database engineering PostgreSQL MySQL SQLite MongoDB Redis','database indexing transactions query optimization data modeling'],9),
('mobile','Mobile development','Android, iOS, cross-platform apps, native APIs and app delivery',ARRAY['Android Kotlin Jetpack Compose app development','iOS Swift SwiftUI mobile app engineering React Native Flutter'],8),
('ai-ml','AI and machine learning','LLMs, machine learning, inference, evaluation, agents, RAG and model serving',ARRAY['LLM engineering RAG agents embeddings evaluation inference','machine learning deep learning MLOps model serving documentation'],10),
('devops-cloud','DevOps and cloud','CI/CD, containers, orchestration, cloud platforms, observability and reliability',ARRAY['DevOps Docker Kubernetes CI CD infrastructure as code','cloud engineering serverless observability SRE deployment'],8),
('security','Secure software engineering','Defensive application security, secure coding, threat modeling and remediation',ARRAY['secure software development OWASP application security code review','dependency security secrets management threat modeling remediation'],8),
('testing-quality','Testing and quality','Unit, integration, end-to-end, performance, accessibility and reliability testing',ARRAY['software testing unit integration end to end performance testing','test automation code quality static analysis software reliability'],7),
('architecture','Software architecture','Design patterns, system design, modularity, scalability and maintainability',ARRAY['software architecture system design design patterns scalability','distributed systems event driven architecture modular monolith'],8),
('tooling','Developer tooling','Git, editors, terminals, package managers, build systems and debugging',ARRAY['developer tools Git IDE terminal debugger package manager','compiler build systems lint format code navigation developer productivity'],7),
('open-source','Open source engineering','Open-source projects, licenses, contribution workflows and project maintenance',ARRAY['open source software maintainer guide contribution workflow','software licenses open source governance project maintenance'],6),
('data-engineering','Data engineering','Pipelines, streaming, analytics, warehouses and data orchestration',ARRAY['data engineering ETL ELT streaming data pipelines','Apache Kafka Spark dbt data warehouse orchestration'],7),
('game-development','Game development','Game engines, graphics, physics, networking and interactive systems',ARRAY['game development engine Unity Unreal Godot graphics','game programming rendering physics multiplayer networking'],6),
('embedded-iot','Embedded and IoT','Firmware, microcontrollers, device software and edge computing',ARRAY['embedded systems firmware microcontroller programming','IoT edge computing device software engineering'],6),
('documentation','Technical documentation','API references, standards, specifications, tutorials and migration guides',ARRAY['official programming documentation API reference language specification','software framework release notes migration guide'],9)
ON CONFLICT(topic_key) DO UPDATE SET
  label=EXCLUDED.label,description=EXCLUDED.description,
  search_queries=EXCLUDED.search_queries,priority=EXCLUDED.priority,updated_at=now();

CREATE INDEX IF NOT EXISTS world_knowledge_topics_enabled_priority_idx
  ON world_knowledge_topics(enabled,priority DESC);
