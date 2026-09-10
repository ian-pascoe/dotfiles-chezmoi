#!/usr/bin/env python3
"""Run the real bridge with isolated global-package fixtures (POSIX, Node 22.18+)."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
assert NODE, "Node is required"

with tempfile.TemporaryDirectory(prefix="minuet-pi-' space-") as directory:
    base = Path(directory)
    bridge = base / "minuet-codex-bridge.mts"
    shutil.copyfile(ROOT / "dot_config/nvim/scripts/minuet-codex-bridge.ts", bridge)
    tools = base / "bin"
    tools.mkdir()
    env = {**os.environ, "PATH": str(tools)}
    for key in ("PI_PACKAGE_DIR", "NODE_PATH", "NODE_OPTIONS"):
        env.pop(key, None)

    def package(path, label):
        (path / "dist").mkdir(parents=True)
        (path / "package.json").write_text(json.dumps({
            "name": "@earendil-works/pi-coding-agent", "type": "module",
            "exports": "./dist/index.js",
        }))
        (path / "dist/index.js").write_text(
            "export class ModelRuntime { static create() { "
            f"console.log({json.dumps(label)}); process.exit(0);"
            " } }\n"
        )

    def executable(name, body):
        path = tools / name
        path.write_text("#!/bin/sh\nset -eu\n" + body)
        path.chmod(0o755)

    def check(label, **overrides):
        result = subprocess.run(
            [NODE, str(bridge), "0"], cwd=base, env={**env, **overrides},
            input="", capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 0, result.stderr
        assert label in result.stdout.splitlines(), (label, result.stdout, result.stderr)

    install = base / "mise-install"
    package(install / "node_modules/@earendil-works/pi-coding-agent", "mise")
    (install / "package.json").write_text("{}")
    env["TEST_INSTALL_ROOT"] = str(install)
    executable("mise", 'test "$*" = "where npm:@earendil-works/pi-coding-agent"\nprintf "%s\\n" "$TEST_INSTALL_ROOT"\n')
    # A non-pnpm launcher must not interfere with Mise's npm package resolution.
    executable("pi", "exit 99\n")
    check("mise")

    legacy = base / "legacy"
    package(legacy, "legacy")
    executable("pi", f"# cmd-shim-target={legacy}/dist/bundle/cli.js\nexit 99\n")
    check("mise")  # Mise precedes the legacy shim.
    executable("mise", "exit 1\n")
    check("legacy")
    (tools / "mise").unlink()
    check("legacy")  # Mise need not be installed at all.

    explicit = base / "explicit"
    package(explicit, "explicit")
    local = base / "node_modules/@earendil-works/pi-coding-agent"
    package(local, "local")
    check("local")
    check("explicit", PI_PACKAGE_DIR=str(explicit))
    shutil.rmtree(base / "node_modules")
    (tools / "pi").unlink()
    result = subprocess.run(
        [NODE, str(bridge), "0"], cwd=base, env=env,
        input="", capture_output=True, text=True, timeout=10,
    )
    assert result.returncode != 0
    assert "cannot locate Pi via Mise or PATH; set PI_PACKAGE_DIR" in result.stderr

print("PASS: Mise, legacy pnpm, local and explicit Pi resolution; missing-install error")
