#!/usr/bin/env python3
"""Inventory regression checks with fake managers only; no real package operations."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "dot_local/bin/executable_sync-package-manifests"
STUB = r'''
import json, os, pathlib, sys
name, args = pathlib.Path(sys.argv[0]).name, sys.argv[1:]
root = pathlib.Path(os.environ["TEST_ROOT"])
config = json.loads((root / "config.json").read_text())
with (root / "calls").open("a") as log:
    log.write(json.dumps([name, *args]) + "\n")
if config.get("fail") == name:
    sys.exit(73)
empty = config.get("empty", False)
if name == "apt-mark" and args == ["showmanual"]:
    print("" if empty else config.get("apt", "zebra\nalpha\nzebra"))
elif name in ("npm", "pnpm") and args == ["root", "-g"]:
    print(root / ".local/share/mise/installs/sample/1/node_modules")
elif name in ("npm", "pnpm") and args == ["list", "-g", "--depth=0", "--json"]:
    data = {"dependencies": {} if empty else {"zebra": {}, "@scope/alpha": {}, "npm": {}}}
    print("malformed" if config.get("bad") == name else json.dumps(data if name == "npm" else [data]))
elif name == "bun" and args == ["pm", "ls", "-g"]:
    if config.get("bun_missing_manifest"):
        print('error: No package.json was found for directory "/Users/ianpascoe/.cache/.bun/install/global"\nnote: Run "bun init" to initialize a project', file=sys.stderr)
        sys.exit(1)
    if config.get("bun_missing_lock"):
        print("error: missing lockfile, nothing to list\nnote: run 'bun install' first", file=sys.stderr)
        sys.exit(1)
    print(str(root / "bun/node_modules") + " (0)" if empty else str(root / "bun/node_modules") + " (2)\n├── zebra@1.0\n└── @scope/alpha@2.0")
elif name == "uv" and args == ["tool", "dir"]:
    print(root / "uv")
elif name == "uv" and args == ["tool", "list"]:
    print("" if empty else "zebra v1.0\n- zebra\npyflakes v2.0\n- pyflakes")
elif name == "cargo" and args[:2] == ["install", "--list"]:
    assert args[2:] == ["--root", str(root / ".cargo")]
    print("" if empty else "zebra v1.0:\n    zebra\nalpha v2.0:\n    alpha")
elif name == "pipx" and args == ["environment", "--value", "PIPX_HOME"]:
    print(root / "pipx")
elif name == "pipx" and args == ["list", "--json"]:
    print(json.dumps({"venvs": {} if empty else {"zebra": {}, "alpha": {}}}))
elif name == "scoop" and args == ["export"]:
    data = {"apps": [] if empty else [{"Name": "zebra", "Info": "Global install", "Version": "1"}, {"Name": "alpha", "Info": "Held package", "Version": "2"}], "buckets": [{"Name": "main", "Source": "https://example.test/main"}]}
    print("{}" if config.get("bad") == name else json.dumps(data))
elif name == "mise" and args == ["ls", "--installed", "--json"]:
    print(json.dumps({} if empty else {"node": [{"version": "22.0", "installed": True}, {"version": "20.0", "installed": True}]}))
elif name == "brew" and args == ["info", "--json=v2", "--installed"]:
    print(json.dumps({"formulae": [] if empty else [{"name": "zebra"}, {"name": "alpha"}], "casks": []}))
else:
    raise AssertionError(f"Unexpected (possibly mutating) command: {name} {args}")
'''

with tempfile.TemporaryDirectory(prefix="inventory-' space-") as directory:
    root = Path(directory)
    bin_dir = root / "bin"
    bin_dir.mkdir()
    managers = ("apt-mark", "npm", "bun", "pnpm", "uv", "cargo", "pipx", "scoop", "mise", "brew")
    for manager in managers:
        path = bin_dir / manager
        path.write_text(f"#!{sys.executable}\n" + STUB)
        path.chmod(0o755)
    curated = root / ".config/packages"
    curated.mkdir(parents=True)
    (curated / "apt.txt").write_text("curated-only\n")
    default = root / ".local/state/package-inventory"
    env = {"HOME": str(root), "PATH": str(bin_dir), "TEST_ROOT": str(root), "LC_ALL": "C"}

    def run(*args, config=None, success=True, **overrides):
        (root / "config.json").write_text(json.dumps(config or {}))
        (root / "calls").write_text("")
        result = subprocess.run([sys.executable, str(SCRIPT), *args], env=env | overrides,
                                capture_output=True, text=True)
        assert (result.returncode == 0) == success, (result.stdout, result.stderr)
        assert (curated / "apt.txt").read_text() == "curated-only\n"
        return result

    run()
    assert len(list(default.iterdir())) == 10
    for path in default.glob("*.txt"):
        names = [line for line in path.read_text().splitlines() if not line.startswith("#")]
        assert names == sorted(set(names))
        assert names
    assert "npm\n" in (default / "npm-global.txt").read_text()  # Inventory retains bootstrap tools.
    scoop = json.loads((default / "scoopfile.json").read_text())
    assert [app["name"] for app in scoop["apps"]] == ["alpha", "zebra"]
    assert scoop["apps"][1]["info"] == "Global install"
    assert scoop["buckets"][0]["Source"] == "https://example.test/main"
    assert [record["version"] for record in json.loads((default / "mise.json").read_text())["node"]] == ["20.0", "22.0"]

    def saved():
        return {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in default.iterdir()}

    before = saved()
    run()
    assert saved() == before
    for missing in ("bun_missing_lock", "bun_missing_manifest"):
        result = run(config={missing: True})
        assert "Skipping bun:" in result.stdout
        assert saved() == before
        fresh = root / missing
        run("--output-dir", str(fresh), config={missing: True})
        assert not (fresh / "bun-global.txt").exists()
        assert (fresh / "apt.txt").exists()
    for config in ({"fail": "bun"}, {"fail": "uv"}, {"bad": "npm"}, {"bad": "scoop"}, {"fail": "brew", "apt": "new-package"}):
        run(config=config, success=False)
        assert saved() == before  # Even a late collector failure writes nothing.
    run("--dry-run", config={"apt": "new-package"})
    assert saved() == before
    dry = root / "not-created"
    run("--dry-run", "--output-dir", str(dry))
    assert not dry.exists()
    state = root / "custom-state"
    run(XDG_STATE_HOME=str(state))
    assert (state / "package-inventory/apt.txt").exists()
    override = root / "override"
    run(MANIFEST_DIR=str(override))
    assert (override / "apt.txt").exists()
    explicit = root / "explicit"
    run("--output-dir", str(explicit), MANIFEST_DIR=str(root / "unused"))
    assert (explicit / "apt.txt").exists() and not (root / "unused").exists()
    run("--output-dir", str(curated), success=False)
    assert not (root / "calls").read_text()
    alias = root / "curated-link"
    alias.symlink_to(curated, target_is_directory=True)
    run(MANIFEST_DIR=str(alias), success=False)

    # Missing managers do not fabricate empty manifests or clobber old snapshots.
    for manager in managers:
        (bin_dir / manager).unlink()
    run()
    assert saved() == before
    missing = root / "missing"
    run("--output-dir", str(missing))
    assert not missing.exists()
    for manager in managers:
        path = bin_dir / manager
        path.write_text(f"#!{sys.executable}\n" + STUB)
        path.chmod(0o755)
    run(config={"empty": True})
    assert all(line.startswith("#") for line in (default / "apt.txt").read_text().splitlines())
    assert json.loads((default / "scoopfile.json").read_text())["apps"] == []
    assert not list(default.glob(".inventory-*"))

print("PASS: all inventories, deterministic snapshots, missing/failure safety, output guards and dry-run")
