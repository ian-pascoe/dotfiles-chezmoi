---
name: gpt-prompting
description: Prompt patterns, reusable system-prompt blocks, and a migration checklist for GPT-5.2 (GPT-5-class) models. Use when you need to (1) write/refine prompts for GPT-5.2 production agents, (2) clamp verbosity/output shape, (3) prevent scope drift (esp. frontend/UX and over-building), (4) handle ambiguity and reduce hallucinations, (5) improve tool grounding + structured extraction, or (6) migrate prompts from GPT-5/5.1/4.1/4o to GPT-5.2 with stable reasoning_effort.
---

# GPT Prompting (GPT-5.2)

Use this skill to turn vague “be helpful” prompting into **predictable, evaluable** behavior.

If you need the source guides, see:

- <https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide>
- <https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide> (agentic eagerness + tool preambles)
- <https://developers.openai.com/api/docs/guides/structured-outputs> (schema enforcement)

For the block library + examples, read: [`references/guide.md`](./references/guide.md)

## Quick start (recommended flow)

1) **State the job + constraints** (what success is, what not to do).
2) Add a **verbosity/output-shape clamp**.
3) Add **risk rails** (ambiguity + hallucination guard).
4) If tools exist: add **tool usage rules** and a **post-write change recap**.
5) If extracting data: add an **extraction schema** with null-for-missing.

## Drop-in prompt skeleton

Use as a starting point for system prompts / instruction blocks:

```text
You are an expert assistant.

<output_verbosity_spec>
- Default: 3–6 sentences OR ≤5 bullets.
- Simple questions: ≤2 sentences.
- Complex tasks: 1 short overview paragraph, then ≤5 bullets tagged:
  What changed, Where, Risks, Next steps, Open questions.
- Avoid long narrative paragraphs; prefer compact bullets + short sections.
</output_verbosity_spec>

<uncertainty_and_ambiguity>
- If ambiguous/underspecified: ask up to 1–3 precise clarifying questions OR present 2–3 interpretations with labeled assumptions.
- Never fabricate exact figures, IDs, line numbers, or citations.
- Prefer “Based on the provided context…” over absolute claims when uncertain.
</uncertainty_and_ambiguity>

<tool_usage_rules>
- Prefer tools over memory whenever you need fresh/user-specific data.
- Parallelize independent reads when possible.
- After any write/update tool call, restate:
  What changed, Where, and validation performed.
</tool_usage_rules>

<scope_discipline>
- Implement EXACTLY and ONLY what the user asked.
- No extra features, no embellishments.
- If something is ambiguous, choose the simplest valid interpretation.
</scope_discipline>
```

## Migration checklist (GPT-5/5.1/4.x → GPT-5.2)

- **Make one change at a time**: switch model first; keep prompts functionally identical.
- **Pin `reasoning_effort`** to match the old latency/depth profile (don’t rely on defaults).
- Run evals; only then tune (usually: verbosity clamp + scope discipline + ambiguity rails).

See `references/guide.md` for a compact mapping table.
