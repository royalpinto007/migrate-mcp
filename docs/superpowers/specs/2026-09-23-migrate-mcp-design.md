# migrate-mcp Design

## Product intent

`migrate-mcp` is an open-source local MCP server that helps coding agents understand and prepare database migrations without silently changing a database. It detects the repository's migration framework, reports migration state and drift using that framework's verified interfaces, reviews migration files for risk, generates reviewable migration files, explains changes in plain English, and provides rollback guidance.

The initial release supports Alembic, golang-migrate, TypeORM, Sequelize, and Prisma. It is a migration workflow assistant, not a database deployment system.

Positioning:

> Database migrations your coding agent can inspect before anyone runs them.

## Success criteria

Version 0.0.1 is successful when a user can install the npm package, register its stdio server in an MCP host, point the host at a repository, and reliably:

1. identify every supported migration framework present in that repository;
2. list on-disk and database-backed migration status where the installed framework supports it;
3. distinguish source-schema drift, migration-history drift, and database drift without claiming evidence that was not obtained;
4. identify destructive or operationally risky migration operations with file locations and confidence;
5. generate a migration through the framework's official command only after an explicit tool call;
6. inspect and explain the generated migration before it is ever applied;
7. receive concrete rollback guidance based on the actual framework and migration contents;
8. confirm that no tool applies, reverts, resets, drops, stamps, resolves, forces, or otherwise mutates a database.

## Non-goals

Version 0.0.1 does not:

- apply, deploy, run, revert, reset, drop, repair, stamp, resolve, or force migrations;
- provide a generic SQL client;
- manage database credentials;
- infer unsupported relationships between source models and migration history;
- promise perfect schema-drift detection when the framework cannot prove it;
- install migration frameworks or database drivers;
- execute arbitrary user-provided shell commands;
- expose a remote HTTP MCP endpoint;
- replace framework-native migration review or production change management.

## Upstream contract snapshot

Implementation and fixtures are based on the following upstream repository revisions observed on 23 September 2026:

| Framework          | Upstream revision                          |
| ------------------ | ------------------------------------------ |
| MCP TypeScript SDK | `0b403f0e072eb49e5ee063bba606c492e2fe04f1` |
| Alembic            | `b42ebe1ff576e02b8bfc9ef1c3c3a5fd1ac41bf4` |
| golang-migrate     | `504568a3cbd23b8754760f55a3d89aec1b0c4963` |
| TypeORM            | `f279fd1367f24ad108a1b11cf833f1620274088d` |
| Sequelize CLI      | `679054aea251572ac7f6fa152f5d9eff9dbbbe9c` |
| Prisma             | `ca357d5d3e5b74c8247dd51d1dea40ebaec7f6a5` |

The package documentation will record supported command families rather than claiming compatibility with every past or future release. An offline maintenance script will detect upstream contract drift. It is never required during normal package use.

## Architecture

The package uses ports and adapters. MCP handlers validate requests and call application services. Services depend on a narrow `MigrationAdapter` contract. Framework adapters own detection, command construction, output parsing, and capability reporting. Pure analyzers inspect SQL or migration source without starting framework processes. A constrained process runner is the only module allowed to launch child processes.

```text
MCP host
  -> stdio server
  -> validated tool request
  -> workflow service
  -> framework registry
       -> Alembic adapter
       -> golang-migrate adapter
       -> TypeORM adapter
       -> Sequelize adapter
       -> Prisma adapter
  -> constrained process runner
  -> structured report
```

Planned source layout:

```text
src/
  cli.ts
  server.ts
  tools/
  services/
  domain/
  adapters/
    alembic/
    golang-migrate/
    typeorm/
    sequelize/
    prisma/
  analysis/
  process/
  security/
  testing/
```

The domain and analysis layers never import the MCP SDK or spawn processes. Adapter commands are argument arrays selected from fixed allowlists, never shell strings.

## Framework adapter contract

Each adapter exposes:

- identity and detection evidence;
- a capability matrix for status, drift, generation, explanation, and rollback evidence;
- on-disk migration discovery;
- optional read-only status and drift probes;
- generation planning and execution;
- normalization into shared migration and drift reports.

An adapter must return `unsupported` with a reason when the installed framework/version cannot provide trustworthy evidence. Unsupported is a valid result, not an internal error.

### Alembic

Detection uses `alembic.ini`, `env.py`, migration script locations, and Python dependency declarations. On-disk history comes from revision metadata. Database-backed status uses official current/heads/history commands. Drift uses Alembic's official check/autogenerate pathway when configured by the repository. Generation uses `alembic revision --autogenerate -m <name>` and is treated as a file mutation. The adapter never calls upgrade, downgrade, stamp, or ensure-version.

### golang-migrate

Detection uses paired `{version}_{title}.up.sql` and `.down.sql` files, Go module references, and repository scripts. Offline status lists ordered pairs and detects gaps, duplicates, and missing directions. Database status can use the official read-only `version` command only when the user supplies or explicitly selects a database configuration. Since golang-migrate has no source-model autogenerator, generation creates an empty official up/down pair through `migrate create`; it never invents SQL. Drift is limited to migration version/history evidence and must not be presented as full schema drift.

### TypeORM

Detection uses TypeORM dependencies, data-source files, migration configuration, and migration classes. Status uses `migration:show`. Drift and generation use `migration:generate` because TypeORM compares entities with the configured database. Generation requires a named data source and explicit approval. The adapter never calls `migration:run`, `migration:revert`, `schema:sync`, or `schema:drop`.

### Sequelize

Detection uses `sequelize` and `sequelize-cli` dependencies, `.sequelizerc`, configured migration directories, and migration modules. Status uses `db:migrate:status` when available. Official generation produces a skeleton through `migration:generate`; the server must describe that this does not infer schema changes. Drift is reported as unsupported unless a future verified Sequelize interface proves it. The adapter never calls `db:migrate`, undo, undo-all, or schema-changing commands.

### Prisma

Detection uses Prisma dependencies, Prisma schema/config files, and migration directories. The adapter detects the installed major version before selecting commands. It uses the installed version's official status, diff/check, and create-only or planning interfaces. It never uses reset, deploy/db-migrate, resolve/sign, db push/update, or db execute. MongoDB is reported unsupported for Prisma migration workflows. Shadow-database behavior is surfaced before any generation probe.

## MCP tools

### `detect_migration_frameworks`

Input: repository path.

Output: detected frameworks, confidence, evidence, relevant paths, installed CLI/version when discoverable, and capabilities.

This tool reads files and may run version commands. It does not access a database.

### `list_migration_status`

Input: repository path, optional framework selector, optional named environment/configuration.

Output: applied, pending, unknown, divergent, or dirty state with supporting evidence. Offline results remain distinct from database-backed results.

### `detect_schema_drift`

Input: repository path, optional framework selector, optional named environment/configuration.

Output: separate code-to-migrations, migrations-to-database, and code-to-database conclusions. Each conclusion carries `verified`, `partial`, `unsupported`, or `failed` status and the exact probe used.

### `review_migrations`

Input: repository path, optional migration paths or pending-only selector.

Output: findings with severity, category, operation, affected object, source location, confidence, rationale, and safer alternative where one is justified.

### `generate_migration`

Input: repository path, framework selector when ambiguous, validated migration name, required `approved: true`, and framework-specific safe options.

Output: files created or changed, framework output, risk review, and next manual review steps.

The tool rejects missing approval, ambiguous framework selection, production-looking environments, paths outside the repository, dirty unexpected writes, unsupported generation, and commands requiring an interactive prompt. It snapshots the repository file set before generation and reports every resulting change.

### `explain_migration`

Input: repository path and selected migration paths.

Output: deterministic plain-English explanation derived from parsed operations. No LLM or network service is required.

### `get_rollback_guidance`

Input: repository path and selected migration paths.

Output: available down/revert evidence, irreversible steps, data-loss caveats, verification queries or checks, and framework-native guidance. It never runs a rollback.

## Risk analysis

The analyzer separates definite destructive operations from operational warnings.

Definite destructive findings include dropping tables, columns, schemas, indexes with constraint implications, destructive renames expressed as drop/add, truncation, deleting without a predicate, and irreversible down migrations.

Operational warnings include adding non-null columns without a safe default/backfill, narrowing types, large table rewrites, concurrent-index omissions where relevant, unbounded updates, long locks, foreign-key validation risks, missing transactions, missing down migrations, and framework calls that execute raw SQL the parser cannot fully understand.

Every finding states its evidence and confidence. Unknown dynamic code is reported as unknown, never silently classified as safe.

## Safety model

The server is local and stdio-only. It is not a sandbox. Framework configuration files and migration code may execute when their official CLIs load them, so documentation must tell users not to inspect untrusted repositories.

Safety controls:

1. No database-mutating MCP tool exists.
2. Executable and argument shapes come from adapter allowlists.
3. The process runner uses `shell: false`, bounded output, timeouts, cancellation, and a repository-scoped working directory.
4. Repository paths are canonicalized and checked against traversal and symlink escapes.
5. Child environments are allowlisted. Sensitive values are passed only when required and never returned.
6. URLs, passwords, tokens, environment values, and command output are redacted before logs or MCP responses.
7. Stdout is reserved for MCP JSON-RPC. Diagnostics use stderr.
8. Generation requires `approved: true`, a clean preflight, and a non-production target classification.
9. Production detection is conservative and based on explicit configuration names, common production markers, and an optional denylist. Uncertain targets are rejected for generation.
10. File writes outside the repository or outside expected migration directories fail the operation and are reported.
11. Status and drift commands are reviewed per framework for side effects. Commands that can create state are not treated as read-only.

No claim of database read-only enforcement is made when a framework CLI uses credentials with broader privileges. Users should supply read-only database credentials for inspection.

## Error model

Tool errors are structured as invalid input, framework not detected, ambiguous framework, CLI unavailable, unsupported capability, approval required, unsafe target, process timeout, framework failure, parse failure, or internal failure. Responses include a safe human message, relevant redacted diagnostics, and recovery steps. Raw stack traces and credentials are never exposed.

Partial multi-framework results are returned when one adapter fails and others succeed.

## Testing strategy

Tests are behavior-first and include:

- detection fixtures for every framework, monorepos, multiple frameworks, misleading filenames, and unsupported versions;
- command-construction tests pinned to current official contracts;
- parser fixtures from official example migrations;
- SQL risk-analysis tables across PostgreSQL, MySQL, and SQLite syntax;
- source-location and redaction tests;
- fake-process integration tests for success, non-zero exits, timeouts, oversized output, cancellation, and executable absence;
- generation tests proving approval gates, production rejection, expected writes, unexpected writes, traversal rejection, and no database-apply commands;
- MCP in-memory and stdio end-to-end tests for tool discovery, schemas, structured results, and stdout cleanliness;
- package consumer tests using the packed tarball;
- optional real-framework integration fixtures in CI where the framework can run without a database;
- property-based tests for names, paths, SQL tokenization boundaries, and redaction.

The release gate is formatting, linting, strict type checking, unit/integration tests, coverage, build, `npm pack`, `publint`, package-content inspection, fresh ESM consumer installation, fresh MCP stdio smoke test, dependency audit, Gitleaks across history, and a clean synchronized repository.

## Package and release

The npm package and public repository are named `migrate-mcp`. The binary is also `migrate-mcp`. The package is ESM-first, publishes declarations and source maps, has explicit exports, and includes only built runtime files, documentation required by npm, and license metadata.

Runtime dependencies are limited to the official MCP server SDK, one Standard Schema-compatible validator if the SDK does not provide sufficient authoring ergonomics, and a deliberately selected SQL parser only if it materially improves correctness over a small tokenizer. Framework CLIs remain peer tools owned by the inspected repository and are never bundled.

The initial release is `0.0.1`. Repository metadata, README, examples, rule/risk documentation, architecture, security guidance, contributing guide, changelog, CI, Dependabot, release workflow, issue templates, terminal demo, social preview, and local-only X launch copy are part of the release scope.

## Demo proof

The public demo is a real 10 to 15 second terminal recording with a soft but distinct palette. It starts with an MCP-host-style migration review of a fixture repository, shows framework detection, pending status, destructive findings, and a plain-English explanation, then shows that applying the migration is unavailable. The README uses the GIF, and Downloads contains GIF and MP4 launch copies. No fake database state or fabricated framework output is shown.

## Release boundaries

The release may claim support only for behavior covered by framework-specific fixtures and integration tests. It must prominently state:

- generation can execute trusted repository configuration code;
- database attribution and drift fidelity vary by framework;
- Sequelize generation is a skeleton, not automatic schema inference;
- golang-migrate cannot infer code-to-schema drift;
- database inspection should use read-only credentials;
- migrate-mcp reviews and generates migrations but never applies or rolls them back.
