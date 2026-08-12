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

# Managed Surfaces

- TypeScript tooling is a pnpm workspace. Verify package-local changes with that
  package's scripts; verify shared tooling and cross-package changes from the
  root.
- Installed skill changes are complete only when `dot_agents/skills/` and the
  provenance lockfile at `dot_local/state/skills/dot_skill-lock.json` agree.

# Workflow Context

- **Issues and PRDs:** follow `docs/agents/issue-tracker.md` when reading,
  publishing, or updating tracker work.
- **Triage:** follow `docs/agents/triage-labels.md` when labeling issues.
- **Domain work:** follow `docs/agents/domain.md` when modeling terminology or
  recording architectural decisions.
