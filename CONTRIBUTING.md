# Contributing to Fourty

Thank you for your interest in contributing to Fourty! This guide will help you get started.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check [existing issues](https://github.com/olbboy/fourty/issues) to avoid duplicates.

When filing a bug report:

1. Use the **Bug Report** template
2. Include steps to reproduce the issue
3. Describe the expected vs actual behavior
4. Include your environment details (OS, Node.js version, Postgres version)

### Suggesting Features

Feature requests are welcome! Use the **Feature Request** template and describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Pull Requests

1. **Fork** the repository and create your branch from `main`
2. **Set up** the development environment (see below)
3. **Make your changes** with clear, atomic commits
4. **Add tests** for any new functionality
5. **Run the full test suite** to ensure nothing is broken
6. **Submit** a pull request using the PR template

## Development Setup

### Prerequisites

- **Node.js** ≥ 20.9
- **PostgreSQL** 16
- **Docker** (optional, for containerized development)

### Quick Start

```bash
# Clone your fork
git clone https://github.com/<your-username>/fourty.git
cd fourty

# Install dependencies
npm install

# Start Postgres (Docker)
docker run -d --name fourty-pg \
  -e POSTGRES_USER=fourty \
  -e POSTGRES_PASSWORD=fourty \
  -e POSTGRES_DB=fourty \
  -p 5432:5432 postgres:16

# Create the app role
PGPASSWORD=fourty psql -h localhost -U fourty -d fourty -c \
  "CREATE ROLE fourty_app LOGIN PASSWORD 'fourty_app';"

# Set environment variables
export DATABASE_URL=postgresql://fourty_app:fourty_app@localhost:5432/fourty
export MIGRATE_DATABASE_URL=postgresql://fourty:fourty@localhost:5432/fourty

# Run migrations and start
npm run db:migrate
npm run dev
```

### Running Tests

```bash
# Unit + integration + security tests (real Postgres + RLS)
npm test

# Watch mode
npm run test:watch

# Playwright E2E smoke suite
npm run db:e2e:setup       # provision E2E database (first time)
npm run test:e2e           # Chromium

# Type check
npx tsc --noEmit

# Production build
npm run build
```

### Project Structure

```
fourty/
├── src/
│   ├── app/            # Next.js App Router pages and API routes
│   ├── components/     # React components
│   ├── db/             # Database schema, migrations, connections
│   ├── lib/            # Core business logic and services
│   ├── mcp/            # MCP server (stdio + HTTP)
│   └── worker/         # Background worker handlers
├── packages/
│   └── twenty-migrate/ # Migration CLI from Twenty
├── docs/               # Documentation
├── drizzle/            # Database migrations (up + down)
├── bench/              # Benchmark harness
├── e2e/                # Playwright E2E tests
├── tests/              # Vitest unit + integration tests
├── scripts/            # Utility scripts
└── public/             # Static assets
```

## Coding Guidelines

### Style

- **TypeScript** throughout — no `any` unless absolutely necessary
- **Zod** for all input validation on API boundaries
- **Pure functions** for business logic (scoring, pricing, currency conversion)
- Use existing patterns in the codebase as your guide

### Commits

Write clear, descriptive commit messages:

```
feat(api): add bulk contact import endpoint
fix(sync): handle expired OAuth token during refresh
docs(readme): update quick start instructions
test(scoring): add edge case for zero-engagement contacts
```

Prefix with `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`, or `chore`.

### Tests

- Every new feature **must** include tests
- Tests run against **real Postgres with RLS** — no mocks for database behavior
- Place tests in `tests/` with descriptive names (`feature-name.test.ts`)

### Database Changes

- All schema changes go through **Drizzle migrations** (`npm run db:generate`)
- Every migration must have a matching **down migration** for reversibility
- Reversibility is asserted in CI

## Architecture

See [Architecture](./docs/architecture.md) and the [ADR index](./docs/adr/) for design decisions.

Key principles:
- **Single process + Postgres** — no Redis, no external queue
- **RLS-first** — tenant isolation is database-enforced
- **Fail closed** — missing context returns zero rows, not all rows
- **Evidence-based** — every automatic write shows its source

## Getting Help

- 📖 Read the [Documentation](./docs/)
- 🐛 Search [existing issues](https://github.com/olbboy/fourty/issues)
- 💬 Start a [Discussion](https://github.com/olbboy/fourty/discussions)

## License

By contributing to Fourty, you agree that your contributions will be licensed under the [BSL 1.1](./LICENSE).
