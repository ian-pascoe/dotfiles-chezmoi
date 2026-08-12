# Domain Docs

How engineering skills consume this repository's domain documentation.

## Before exploring

Read `CONTEXT-MAP.md`, then read each `CONTEXT.md` relevant to the work.

Also read:

- `docs/adr/` for cross-context decisions.
- The relevant context's `docs/adr/` for scoped decisions.

If a referenced context or ADR directory does not exist, proceed silently. Domain-modeling
creates these files lazily when terminology or decisions are resolved.

## Contexts

- **Pi agent configuration**
  - Source: `dot_pi/agent/`
  - Glossary: `dot_pi/agent/CONTEXT.md`
  - ADRs: `dot_pi/agent/docs/adr/`
- **Oh My Pi configuration**
  - Source: `dot_omp/agent/`
  - Glossary: `dot_omp/agent/CONTEXT.md`
  - ADRs: `dot_omp/agent/docs/adr/`
- **OpenCode configuration**
  - Source: `dot_config/opencode/`
  - Glossary: `dot_config/opencode/CONTEXT.md`
  - ADRs: `dot_config/opencode/docs/adr/`

Read every affected context for cross-context changes.

## Use the glossary's vocabulary

Use terms as defined by the relevant `CONTEXT.md`. Avoid synonyms that its glossary
explicitly rejects.

If a needed concept is absent, reconsider whether it belongs to the domain or
record the gap for domain-modeling.

## Flag ADR conflicts

Surface conflicts with existing ADRs explicitly rather than silently
overriding them.
