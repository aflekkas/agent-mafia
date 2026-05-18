# Next.js 16 Notes

Agent Mafia targets Next.js 16 while staying a single local-first App Router prototype.

## Local Source Of Truth

Before changing Next.js-specific behavior, read the relevant installed docs in `node_modules/next/dist/docs/`. This matters because AI training data can lag behind Next.js 16 behavior.

Recommended starting points:

- `node_modules/next/dist/docs/01-app/index.md` for App Router orientation.
- `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md` for version and runtime expectations.
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` for route handlers.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` for route handler signatures.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/index.md` for `next.config.ts`.
- `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md` for Turbopack behavior.
- `node_modules/next/dist/docs/01-app/02-guides/ai-agents.md` for AI-agent documentation workflow.

If those docs are missing after `pnpm install`, confirm the installed version:

```bash
node -p "require('./node_modules/next/package.json').version"
```

Then use official `nextjs.org/docs` pages as the fallback and mention the missing local docs in the handoff.

## Current Upgrade Contract

- `next` is pinned to `16.2.6`.
- `react` and `react-dom` are pinned to `19.2.6`.
- Node must be `>=20.9.0`; the local machine currently satisfies this with Node 24.
- pnpm is the project package manager; use `pnpm install` and `pnpm <script>`.
- `next dev` and `next build` use Turbopack by default in Next.js 16.
- This repo does not use `next lint`; keep `pnpm typecheck` and `pnpm build` as the required upgrade checks.
- Dynamic route handler params are Promise-based in this codebase; keep awaiting `context.params`.

## Scope Boundaries

Do not treat the Next.js 16 upgrade as permission to expand architecture. Keep the app as:

- Next.js App Router.
- Route handlers for game actions.
- React + TypeScript.
- Plain CSS.
- In-memory local sessions.

Do not add Cache Components, React Compiler, Proxy, Tailwind, shadcn, database persistence, or hosted MCP/runtime integrations unless the user asks for that exact work.
