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
