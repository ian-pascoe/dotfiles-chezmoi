# Chezmoi Source

- Chezmoi source names encode target paths and attributes: for example,
  `dot_config/` deploys to `~/.config/`. Check `.chezmoiignore` for repo-only and
  OS-specific paths.
- Define fetched plugins and assets in `.chezmoiexternal.toml`; keep their
  downloaded contents external.
- Keep repo-only agent guidance here. Before editing another `AGENTS.md`, check
  whether chezmoi manages its target; managed copies change user-level behavior.
- Deployment is a separate, user-approved step. Scope `chezmoi apply` to the
  changed targets after explicit direction or confirmed proposal; otherwise
  report that the source changed but the targets remain unapplied.

## Managed Surfaces

- TypeScript tooling is a pnpm workspace. Verify package-local changes with that
  package's scripts; verify shared tooling and cross-package changes from the
  root.
- Installed skill changes are complete only when `dot_agents/skills/` and the
  provenance lockfile at `dot_local/state/skills/dot_skill-lock.json` agree.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses multiple domain contexts for Pi, Oh My Pi, and OpenCode configuration.
See `docs/agents/domain.md`.
