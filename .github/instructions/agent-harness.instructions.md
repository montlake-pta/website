---
description: 'Rules for maintaining Copilot instructions, custom agents, skills, hooks, and agent-facing documentation'
applyTo: 'AGENTS.md,.github/copilot-instructions.md,.github/instructions/**/*.instructions.md,.github/agents/montlake-*.agent.md,.github/agents/wix-content-maintainer.agent.md,.github/agents/release-readiness.agent.md,scripts/check-agent-harness.mjs'
excludeAgent: 'code-review'
---

# Agent harness instructions

- Keep `AGENTS.md` authoritative and repository-specific; avoid restating
  generic software-engineering advice.
- Path-specific instruction files require `applyTo` frontmatter; a concise
  `description` is recommended for editors that display it.
- Custom agent files require `description` frontmatter. A human-readable `name`
  is recommended; otherwise the filename is used.
- Omit `tools` to inherit the environment defaults. Use `tools: []` only for an
  intentionally tool-less agent; never use `tools: null`.
- Prefer a small set of agents with distinct ownership over many overlapping
  personas.
- Agents that implement changes must run the repository validation matrix.
- Read-only reviewers must not edit files and should report only actionable,
  evidence-backed findings.
- Keep secrets and user-specific workflow preferences out of shared agent
  instructions.
- Do not edit vendored Impeccable agents, hooks, or skill files directly.
- Run `npm run check:agents` after changing the harness.
