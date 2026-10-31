# AGENTS.md

> See [GEMINI.md](./GEMINI.md) for full project rules, architectural specs, and domain invariants.

## Antigravity Workspace Guidelines

This repository (`magz-egg-tracker`) is configured for Google Antigravity and Gemini CLI.

- **Stack**: Nuxt 4 (SSR) + Nitro + TypeScript + Firebase Auth + Turso (libSQL) via Drizzle ORM (database-per-tenant) + Nuxt UI v4 + Tailwind CSS v4 + Bun.
- **Rules & Invariants**: Always consult [GEMINI.md](./GEMINI.md) before writing or modifying code.
- **Subagents**: Specialized agent instructions are located in `.agents/agents/`.
- **Command Runner**: Always use `bun` (`bun run <script>`, `bunx`). Do not use npm or yarn.
