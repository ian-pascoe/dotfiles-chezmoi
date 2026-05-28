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
  pi.registerCommand("superpowers-status", {
    description: "Show Superpowers package path and bootstrap status",
    handler: async (_args, ctx) => {
      const install = await getInstall();
      const bootstrap = await getBootstrapContent(install);
      const source = process.env.PI_SUPERPOWERS_DIR
        ? "PI_SUPERPOWERS_DIR"
        : "Pi git package cache";
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
