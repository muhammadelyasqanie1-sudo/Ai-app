# Workspace packages

- `shared`: shared Zod schemas and canonical identifiers.
- `providers`: server-only provider adapter public exports.
- `i18n`: locale dictionaries and strict formatting exports.
- `ui`: shared design-system exports.

These package entry points currently bridge to the compatible root implementation. Keep exactly one source implementation for each domain until the physical workspace migration is completed.
