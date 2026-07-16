# Guardian Review Residuals

## Residual Review Findings

Source: `ce-code-review` run `20260716-134523-897deb7f` against
`docs/plans/2026-07-15-001-feat-omp-guardian-permission-gate-plan.md`.

- P0 — `private_dot_omp/private_agent/extensions/guardian/policy.ts:354` —
  [Normalize wrapped write targets before Guardian authorization][issue-1]
- P1 — `private_dot_omp/private_agent/extensions/guardian.ts:168` —
  [Require authenticated local-only Guardian approval UI][issue-3]
- P1 — `private_dot_omp/private_agent/extensions/guardian/policy.ts:372` —
  [Remove hook-capable Git status static bypass][issue-2]
- P1 — `private_dot_omp/private_agent/extensions/guardian/policy.ts:351` —
  [Accept normalized hashline edit target shapes][issue-6]
- P1 —
  `private_dot_omp/private_agent/extensions/guardian/session-runtime.ts:90` —
  [Bound the serialized Guardian intent envelope][issue-4]
- P1 —
  `private_dot_omp/private_agent/extensions/guardian/session-runtime.ts:54` —
  [Separate session activity from cache eligibility][issue-5]
- P1 — `private_dot_omp/private_agent/extensions/guardian.ts:193` —
  [Reject timed-out Guardian selections before approval][issue-7]
- P2 — `private_dot_omp/private_agent/extensions/guardian.ts:232` —
  [Preserve Guardian readiness after cancelled navigation][issue-8]
- P2 — `private_dot_omp/private_agent/extensions/guardian/audit.ts:171` —
  [Prevent partial audit writes from recording allow][issue-9]
- P2 — `private_dot_omp/private_agent/extensions/guardian.ts:275` —
  [Propagate parent cancellation into Guardian attempts][issue-12]
- P2 —
  `private_dot_omp/private_agent/extensions/guardian/reviewer.ts:198` —
  [Enforce one-shot bounded Guardian model transport][issue-10]
- P2 — `private_dot_omp/private_agent/extensions/guardian.ts:259` —
  [Process streaming assistant intent incrementally][issue-11]
- P2 — `private_dot_omp/private_agent/extensions/guardian/reviewer.ts:52` —
  [Reject contradictory Guardian verdict tuples][issue-13]
- P2 — `private_dot_omp/private_agent/extensions/guardian.ts:425` —
  [Route thrown reviewer failures through Guardian fallback][issue-15]
- P1 — `private_dot_omp/private_agent/extensions/guardian.test.ts:101` —
  [Add real-host Guardian permission boundary canary][issue-14]
- P1 — `private_dot_omp/private_agent/extensions/guardian.test.ts:105` —
  [Exercise production Guardian UI trust detection][issue-17]
- P1 — `private_dot_omp/private_agent/extensions/guardian.test.ts:467` —
  [Cover Guardian authorization lifecycle invalidation matrix][issue-16]

[issue-1]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/1
[issue-2]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/2
[issue-3]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/3
[issue-4]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/4
[issue-5]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/5
[issue-6]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/6
[issue-7]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/7
[issue-8]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/8
[issue-9]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/9
[issue-10]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/10
[issue-11]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/11
[issue-12]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/12
[issue-13]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/13
[issue-14]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/14
[issue-15]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/15
[issue-16]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/16
[issue-17]: https://github.com/ian-pascoe/dotfiles-chezmoi/issues/17
