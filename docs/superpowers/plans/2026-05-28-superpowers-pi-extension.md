# Superpowers Pi Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pi Coding Agent extension that activates the installed `obra/superpowers` package by registering its skills and injecting the `using-superpowers` bootstrap context.

**Architecture:** Implement a focused single-file TypeScript extension in `dot_pi/agent/extensions/superpowers.ts`. The extension resolves the Superpowers repo from `PI_SUPERPOWERS_DIR` or Pi's git package cache, validates the `skills/using-superpowers/SKILL.md` bootstrap, registers the skills path through `resources_discover`, injects cached bootstrap text through `before_agent_start`, and exposes `/superpowers-status` for diagnostics.

**Tech Stack:** Pi Coding Agent extension API, Node.js `fs/promises`, Node.js `os`, Node.js `path`, TypeScript, `tsgo --noEmit` for verification.

---

## File Structure

- Create `dot_pi/agent/extensions/superpowers.ts`: all Superpowers integration logic. It remains a single file because the extension has one responsibility and no reusable project-wide utilities exist for extension path/bootstrap loading.
- No settings change is required. `dot_pi/agent/settings.json` already installs the git package into `~/.pi/agent/git/github.com/obra/superpowers`.

## Task 1: Resolve and Validate Superpowers Install

**Files:**
- Create: `dot_pi/agent/extensions/superpowers.ts`

- [ ] **Step 1: Write the initial extension skeleton with path resolution helpers**

Create `dot_pi/agent/extensions/superpowers.ts` with:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_SUPERPOWERS_ROOT = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "git",
  "github.com",
  "obra",
  "superpowers",
);

function normalizePath(input: string | undefined) {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return path.resolve(trimmed);
}

function superpowersRoot() {
  return normalizePath(process.env.PI_SUPERPOWERS_DIR) ?? DEFAULT_SUPERPOWERS_ROOT;
}

async function pathExists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function stripFrontmatter(content: string) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match?.[1] ?? content;
}

export default function (_pi: ExtensionAPI) {}
```

- [ ] **Step 2: Run typecheck to verify the skeleton compiles**

Run:

```bash
npm run typecheck --workspace ./dot_pi/agent
```

Expected: PASS with `tsgo --noEmit` completing successfully.

- [ ] **Step 3: Commit the skeleton**

```bash
git add dot_pi/agent/extensions/superpowers.ts
git commit -m "feat(pi): start superpowers extension"
```

## Task 2: Register Superpowers Skills and Bootstrap Injection

**Files:**
- Modify: `dot_pi/agent/extensions/superpowers.ts`

- [ ] **Step 1: Add install inspection and cached bootstrap loading**

Replace `export default function (_pi: ExtensionAPI) {}` with:

```typescript
type SuperpowersInstall = {
  root: string;
  skillsDir: string;
  bootstrapPath: string;
  available: boolean;
};

let bootstrapCache: string | null | undefined;

function inspectInstall(): SuperpowersInstall {
  const root = superpowersRoot();
  const skillsDir = path.join(root, "skills");
  const bootstrapPath = path.join(skillsDir, "using-superpowers", "SKILL.md");
  return { root, skillsDir, bootstrapPath, available: false };
}

async function getInstall() {
  const install = inspectInstall();
  install.available =
    (await pathExists(install.skillsDir)) && (await pathExists(install.bootstrapPath));
  return install;
}

async function getBootstrapContent(install: SuperpowersInstall) {
  if (!install.available) return null;
  if (bootstrapCache !== undefined) return bootstrapCache;

  const fullContent = await readFile(install.bootstrapPath, "utf8");
  const body = stripFrontmatter(fullContent).trim();

  const toolMapping = `**Tool Mapping for Pi Coding Agent:**
When skills reference tools you don't have, substitute Pi equivalents:
- \`TodoWrite\` → \`todo\`
- \`Task\` tool with subagents → \`subagent\`
- \`Skill\` tool → Pi's built-in skill loading/invocation system
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Pi's native tools

Use Pi's available skills list and skill invocation protocol when a skill should be loaded.`;

  bootstrapCache = `<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT try to load "using-superpowers" again - that would be redundant.**

${body}

${toolMapping}
</EXTREMELY_IMPORTANT>`;

  return bootstrapCache;
}

export default function (pi: ExtensionAPI) {
  pi.on("resources_discover", async () => {
    const install = await getInstall();
    if (!install.available) return;
    return { skillPaths: [install.skillsDir] };
  });

  pi.on("before_agent_start", async (event) => {
    if (event.systemPrompt.includes("<EXTREMELY_IMPORTANT>\nYou have superpowers.")) return;

    const install = await getInstall();
    const bootstrap = await getBootstrapContent(install);
    if (!bootstrap) return;

    return { systemPrompt: `${event.systemPrompt}\n\n${bootstrap}` };
  });
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck --workspace ./dot_pi/agent
```

Expected: PASS with `tsgo --noEmit` completing successfully.

- [ ] **Step 3: Commit skills and bootstrap integration**

```bash
git add dot_pi/agent/extensions/superpowers.ts
git commit -m "feat(pi): load superpowers skills"
```

## Task 3: Add `/superpowers-status` Diagnostics

**Files:**
- Modify: `dot_pi/agent/extensions/superpowers.ts`

- [ ] **Step 1: Add command handler inside the default export**

Inside `export default function (pi: ExtensionAPI) {`, before the `pi.on("resources_discover"...)` handler, add:

```typescript
  pi.registerCommand("superpowers-status", {
    description: "Show Superpowers package path and bootstrap status",
    handler: async (_args, ctx) => {
      const install = await getInstall();
      const bootstrap = await getBootstrapContent(install);
      const source = process.env.PI_SUPERPOWERS_DIR ? "PI_SUPERPOWERS_DIR" : "Pi git package cache";
      const lines = [
        `Superpowers source: ${source}`,
        `Root: ${install.root}`,
        `Skills: ${install.skillsDir}`,
        `Bootstrap: ${install.bootstrapPath}`,
        `Available: ${install.available ? "yes" : "no"}`,
        `Bootstrap loaded: ${bootstrap ? "yes" : "no"}`,
      ];

      ctx.ui.notify(lines.join("\n"), install.available ? "info" : "warning");
    },
  });
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck --workspace ./dot_pi/agent
```

Expected: PASS with `tsgo --noEmit` completing successfully.

- [ ] **Step 3: Commit diagnostics command**

```bash
git add dot_pi/agent/extensions/superpowers.ts
git commit -m "feat(pi): add superpowers status command"
```

## Task 4: Final Verification

**Files:**
- Verify: `dot_pi/agent/extensions/superpowers.ts`
- Verify: `dot_pi/agent/settings.json`

- [ ] **Step 1: Confirm installed package paths exist**

Run:

```bash
test -f /home/ianpascoe/.pi/agent/git/github.com/obra/superpowers/skills/using-superpowers/SKILL.md && \
test -d /home/ianpascoe/.pi/agent/git/github.com/obra/superpowers/skills
```

Expected: exit code 0.

- [ ] **Step 2: Run full dot_pi agent typecheck**

Run:

```bash
npm run typecheck --workspace ./dot_pi/agent
```

Expected: PASS with `tsgo --noEmit` completing successfully.

- [ ] **Step 3: Run formatter check for the workspace**

Run:

```bash
npm run format:check --workspace ./dot_pi/agent
```

Expected: PASS or report only formatting differences in files touched by this plan. If it reports formatting differences in `dot_pi/agent/extensions/superpowers.ts`, run `npm run format --workspace ./dot_pi/agent`, re-run the check, and commit the formatted result.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff -- dot_pi/agent/extensions/superpowers.ts
```

Expected: diff only contains the new Superpowers extension.

- [ ] **Step 5: Commit final formatting fixes if needed**

If Step 3 changed formatting, run:

```bash
git add dot_pi/agent/extensions/superpowers.ts
git commit -m "style(pi): format superpowers extension"
```

If Step 3 made no changes, no commit is needed.

## Self-Review

- Spec coverage: the plan covers the package-cache install path, env override, skills registration, bootstrap injection, frontmatter stripping, Pi-specific tool mapping, silent startup behavior, and `/superpowers-status` diagnostics.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: helper names and extension event names are consistent across tasks.
