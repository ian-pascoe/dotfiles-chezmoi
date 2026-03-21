# GPT-5.2 Prompting — block library + notes

Source guide:
<https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide>

Keep SKILL.md lean; use this file when you need more complete blocks/examples.

## Core themes (what usually moves the needle)

1) **Verbosity/output-shape clamps** (most common win)
2) **Scope discipline** (prevents over-building)
3) **Ambiguity + hallucination rails** (forces questions/assumptions)
4) **Tool grounding rules** (prefer tools, parallelize reads, recap writes)
5) **Schemas for extraction** (null instead of guessing)

---

## Verbosity + output shape

```text
<output_verbosity_spec>
- Default: 3–6 sentences or ≤5 bullets for typical answers.
- For simple “yes/no + short explanation”: ≤2 sentences.
- For complex multi-step/multi-file tasks:
  - 1 short overview paragraph
  - then ≤5 bullets tagged: What changed, Where, Risks, Next steps, Open questions.
- Avoid long narrative paragraphs; prefer compact bullets and short sections.
- Do not rephrase the user’s request unless it changes semantics.
</output_verbosity_spec>
```

## Preventing scope drift (esp. UX/frontend)

```text
<design_and_scope_constraints>
- Implement EXACTLY and ONLY what the user requests.
- No extra features, no added components, no UX embellishments.
- Do NOT invent colors, shadows, tokens, animations, or new UI elements unless requested.
- If any instruction is ambiguous, choose the simplest valid interpretation.
</design_and_scope_constraints>
```

## Long-context handling (reduce “lost in the scroll”)

```text
<long_context_handling>
- For very long inputs: first outline the key sections relevant to the request.
- Re-state constraints explicitly (jurisdiction, date range, product/team, etc.) before answering.
- Anchor claims to sections (“In the ‘Data Retention’ section…”) rather than speaking generically.
- If details matter (dates/thresholds/clauses), quote/paraphrase them.
</long_context_handling>
```

## Ambiguity + hallucination risk

```text
<uncertainty_and_ambiguity>
- If ambiguous/underspecified:
  - Ask up to 1–3 precise clarifying questions, OR
  - Present 2–3 plausible interpretations with labeled assumptions.
- When external facts may have changed and no tools are available:
  - Answer in general terms and say details may have changed.
- Never fabricate exact figures, IDs, line numbers, or references.
- When unsure, prefer “Based on the provided context…”
</uncertainty_and_ambiguity>
```

Optional high-risk self-check:

```text
<high_risk_self_check>
Before finalizing in legal/financial/compliance/safety contexts:
- Re-scan for unstated assumptions.
- Remove/qualify specific numbers/claims not grounded in context.
- Soften overly strong language ("always", "guaranteed").
</high_risk_self_check>
```

## Tool usage rules (agents)

```text
<tool_usage_rules>
- Prefer tools over internal knowledge whenever:
  - You need fresh or user-specific data (tickets, orders, configs, logs).
  - You reference specific IDs, URLs, or document titles.
- Parallelize independent reads when possible.
- After any write/update tool call, briefly restate:
  - What changed,
  - Where (ID or path),
  - Follow-up validation performed.
</tool_usage_rules>
```

## Structured extraction (nulls, no guessing)

```text
<extraction_spec>
Extract structured data into JSON.

- Follow this schema exactly (no extra fields):
  {
    "party_name": string,
    "jurisdiction": string | null,
    "effective_date": string | null,
    "termination_clause_summary": string | null
  }
- If a field is not present, set it to null (do not guess).
- Before returning, re-scan the source for missed fields.
</extraction_spec>
```

## Reasoning effort migration (high-level)

The guide emphasizes pinning `reasoning_effort` to avoid default-driven behavior changes.

Suggested default mapping:

| Current model | Target model | Target reasoning_effort | Notes |
|---|---|---:|---|
| GPT-4o | GPT-5.2 | none | keep it snappy; bump only if evals regress |
| GPT-4.1 | GPT-5.2 | none | same idea |
| GPT-5 | GPT-5.2 | same (minimal → none) | preserve latency/quality profile |
| GPT-5.1 | GPT-5.2 | same | preserve existing effort |

(Defaults noted in the guide: GPT-5 default reasoning is medium; GPT-5.1/5.2 default is none.)

## Agentic eagerness calibration (tool-heavy agents)

Source (first-party):

- GPT-5 prompting guide: <https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide>

### Prompting for *less* eagerness (fewer tool calls, faster answers)

Use when you’re seeing: tool spam, over-exploration, long latency.

```text
<context_gathering>
Goal: Get enough context fast. Parallelize discovery and stop as soon as you can act.

Method:
- Start broad, then fan out to focused subqueries.
- In parallel, launch varied queries; read top hits per query.
- Deduplicate and cache; don’t repeat searches.
- Trace only symbols you’ll modify or whose contracts you rely on.

Early stop criteria:
- You can name the exact file(s)/section(s) to change.
- Results converge on one area.

Escalate once:
- If signals conflict, run one refined parallel batch, then proceed.
</context_gathering>
```

### Prompting for *more* eagerness (autonomous completion)

Use when you’re seeing: the agent asks too many questions / stops early.

```text
<persistence>
- You are an agent. Keep going until the user’s request is completely resolved before ending your turn.
- Only stop when you believe the task is done end-to-end.
- If uncertain, make reasonable assumptions, proceed, and document them.
- Ask clarifying questions only when you are blocked by missing information.
</persistence>
```

## Tool preambles (human-visible progress without log spam)

Source (first-party):

- GPT-5 prompting guide: <https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide>

```text
<tool_preambles>
- Before the first tool call: one sentence stating what you’re about to do and why.
- During tool use: only brief updates when the user benefit is high.
- Avoid status theater. No running commentary.
- After finishing: summarize outcomes separately from the plan.
</tool_preambles>
```

## Structured Outputs (schemas; null instead of guessing)

Source (first-party):

- Structured outputs guide: <https://developers.openai.com/api/docs/guides/structured-outputs>

Use when you need *machine-consumable* JSON. Prefer strict schemas over “please output JSON”.

```text
<structured_output_spec>
Return JSON that conforms to the provided schema.

- If information is missing, use null; do not guess.
- Do not add extra fields.
- If you cannot produce valid JSON for the schema, explain why in 1 sentence and output the closest valid JSON with nulls.
</structured_output_spec>
```

## Conversation state + tool calling (implementation note)

Source (first-party):

- Function calling guide: <https://developers.openai.com/api/docs/guides/function-calling>
- Reasoning guide: <https://developers.openai.com/api/docs/guides/reasoning>
- Conversation state guide: <https://platform.openai.com/docs/guides/conversation-state?api-mode=responses>

Key operational rule (Responses API + tool calls):

- **Pass back reasoning/tool-call items** along with tool outputs when continuing a multi-step tool-calling flow, or you’ll degrade performance.

## Compaction (long-running workflows)

For very long, tool-heavy sessions, compaction helps keep context usable.

Source (first-party):

- Responses API compaction + conversation state: <https://platform.openai.com/docs/guides/conversation-state?api-mode=responses>

Use compaction:

- After milestones, not every turn.
- Treat compacted items as opaque.
- Keep prompts functionally identical after compaction to avoid behavior drift.
