# DRSK CBT Examination Platform

[![CI](https://github.com/goel-aadhaar/cbt-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/goel-aadhaar/cbt-platform/actions/workflows/ci.yml)

Multi-tenant, NTA-style Computer-Based Test (CBT) examination platform.

## Tech stack

| Layer    | Technology                            |
| -------- | ------------------------------------- |
| Backend  | NestJS + TypeScript                   |
| Database | PostgreSQL (via Prisma ORM)           |
| Frontend | Next.js + TypeScript _(added later)_  |
| Storage  | AWS S3                                |
| Hosting  | AWS Amplify (web) + AWS EC2/RDS (api) |

## Repository layout (pnpm monorepo)

```
drsk-cbt/
├── apps/
│   └── api/          # NestJS backend
├── packages/
│   └── shared/       # Types/DTOs shared by api + web (added later)
├── pnpm-workspace.yaml
└── package.json      # workspace root
```

## Prerequisites

- Node.js `>=22` (see `.nvmrc`)
- pnpm `>=11` (`npm install -g pnpm`)
- Docker (for local PostgreSQL)

## Getting started

```bash
pnpm install
```

_(More commands added as modules land.)_
