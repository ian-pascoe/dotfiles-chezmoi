# Minimal subagents configuration

Configure the extension in Pi's standard settings files:

- global: `~/.pi/agent/settings.json`
- project: `./.pi/settings.json`, when the project is trusted

Project values override global values. Run `/reload` after editing either file.

## Model roles

`minimalSubagents.modelRoles` gives the parent agent advisory names for
eligible models. The extension defines no roles itself, performs no task
classification, and does not route launches. The parent still passes the
ordinary `model` argument and chooses `thinking_level` independently.

```json
{
  "minimalSubagents": {
    "modelRoles": {
      "budget": "opencode-go/glm-5.2",
      "design": {
        "model": "opencode-go/kimi-k3",
        "hint": "UI design, visual critique, and frontend polish"
      }
    }
  }
}
```

Role names and hints are trimmed, single-line text. Names may be up to 64
characters and hints up to 500 characters. Models use canonical
`provider/model` IDs and must be available under the effective `enabledModels`
scope. Thinking-level suffixes such as `:xhigh` are invalid here.

Global and project roles merge by name in settings order. Expanded role
objects merge by field; a project string replaces the whole global entry. A
project can remove one inherited role with `null`, or clear all inherited
roles by setting `modelRoles` to `null`.

```json
{
  "minimalSubagents": {
    "modelRoles": {
      "budget": null
    }
  }
}
```

Invalid or unavailable entries are omitted. The extension emits one
consolidated startup warning and keeps every valid role.

## Maximum delegation depth

`minimalSubagents.maxSubagentDepth` is a positive safe integer. It counts
subagent levels beneath the interactive root: `1` permits root children, `2`
also permits grandchildren, and so on. The default is `2`.

```json
{
  "minimalSubagents": {
    "maxSubagentDepth": 1
  }
}
```

A trusted project value replaces the global value. Project `null` restores
the built-in default of `2`. An invalid project value emits a warning and
leaves a valid global value in effect.

Reloading with a lower depth does not delete existing agents or change their
launch contracts. Before `/reload` invalidates the old extension runtime, the
extension waits for active child and root work to settle, then disposes idle
child runtimes. A deliberately non-settling agent can therefore delay reload
indefinitely. The new limit controls restored tool availability and future
spawn attempts; the root retains recursive hierarchy management.
