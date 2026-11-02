# Database source of truth

Canonical schema and migrations remain in `database/schema.sql` and `database/migrations` because the current migration runner and deployment use those paths. Do not duplicate migration SQL here. Move it only together with the runner and deployment configuration.
