#!/usr/bin/env python3
"""Check curated ownership without running any package managers (Python 3.11+)."""
import json
from pathlib import Path
import re
import tomllib

ROOT = Path(__file__).resolve().parents[1]
tools = tomllib.loads((ROOT / "dot_config/mise/config.toml").read_text())["tools"]
packages = ROOT / "dot_config/packages"


def entries(path):
    return {line.strip() for line in path.read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")}


# Preserve the migrated tools, including registry aliases with different names.
aliases = {
    "cargo:cargo-binstall": "cargo-binstall", "cargo:cargo-deny": "cargo-deny",
    "npm:@openai/codex": "codex", "npm:@pnpm/exe": "pnpm",
    "npm:playwright": "playwright", "pipx:pipx": "pipx", "pipx:yt-dlp": "yt-dlp",
}
migrated = {
    "cargo": "cargo-audit cargo-binstall cargo-cache cargo-deny cargo-edit cargo-nextest cargo-outdated cargo-run-bin cargo-update cargo-watch cargo-zigbuild cross lspctl terminal-control",
    "npm": "@earendil-works/pi-coding-agent @firecrawl/anydoc @googleworkspace/cli @openai/codex @pnpm/exe agent-browser hunkdiff impeccable playwright",
    "pipx": "browser-use camoufox pipx pyflakes pytest spotdl trafilatura yt-dlp",
}
for backend, names in migrated.items():
    for name in names.split():
        key = f"{backend}:{name}"
        assert aliases.get(key, key) in tools, f"Lost migrated tool: {key}"

for filename, backend in {
    "private_cargo-install.txt": "cargo", "private_pnpm-global.txt": "npm",
    "private_npm-global.txt": "npm", "private_bun-global.txt": "npm",
    "private_uv-tools.txt": "pipx", "pipx.txt": "pipx",
}.items():
    for name in entries(packages / filename):
        key = f"{backend}:{name}"
        assert aliases.get(key, key) not in tools, f"Duplicate owner: {filename}: {name}"

native_aliases = {
    "git-delta": "delta", "ninja-build": "ninja", "dotnet-sdk": "dotnet",
    "jid": "go:github.com/simeji/jid/cmd/jid",
    "python@3.13": "python", "python@3.14": "python",
}
scoop = json.loads((ROOT / "dot_config/scoop/scoopfile.json").read_text())
# Git and Mise remain OS-owned bootstrap tools, not redundant runtime selections.
for owner, names in {
    "apt": entries(packages / "private_apt.txt"),
    "scoop": {app["Name"] for app in scoop["apps"]},
    "brew": set(re.findall(r'^brew "([^"]+)"', (ROOT / "Brewfile").read_text(), re.M)),
}.items():
    for name in names - {"git", "mise"}:
        assert native_aliases.get(name, name) not in tools, f"Duplicate owner: {owner}: {name}"

assert set(tools["tmux"]["os"]) == {"linux", "macos"}
for name in ("btop", "mold", "cargo:terminal-control"):
    assert tools[name]["os"] == ["linux"]
# macOS SDKs with arm64e-only stubs cannot link Zig 0.15.2 source builds.
for arch in ("arm64", "x64"):
    key = f"npm:@kitlangton/terminal-control-darwin-{arch}"
    assert tools[key] == {
        "version": "latest", "os": [f"macos/{arch}"], "allow_low_downloads": True,
    }
assert tools["zig"] == "0.15.2"
assert tools["cargo:terminal-control"]["depends"] == ["zig"]
print("PASS: migrated tools retained, unique curated owners, platform exceptions")
