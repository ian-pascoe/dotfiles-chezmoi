#!/usr/bin/env python3
"""Exercise the installer using only fake managers; never install/remove host packages."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "dot_local/bin/executable_install-package-manifests"

STUB = r'''
import json, os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
base = pathlib.Path(os.environ["TEST_ROOT"])
cfg = json.loads((base / "config.json").read_text())
with (base / "calls.jsonl").open("a") as log:
    log.write(json.dumps([name, *args]) + "\n")
if cfg.get("fail") == name:
    sys.exit(71)
if name == "sudo":
    os.execv(str(base / "bin" / args[0]), args)
if name == "scoop":
    if args == ["export"]:
        apps = [{"Name": pkg, "Info": info} for pkg, info in [("scoop", ""), ("git", ""), ("mise", ""), ("python", ""), ("keep", ""), ("dep", ""), ("held", "Held package"), ("stale", ""), ("global-old", "Global install"), ("global-keep", "Global install")]]
        if cfg.get("scoop_missing"):
            apps = [app for app in apps if app["Name"] != "keep"]
        if cfg.get("scoop_duplicate"):
            apps.append({"Name": "keep", "Info": "Global install"})
        print(json.dumps({} if cfg.get("scoop_invalid") else {"apps": apps}))
    elif args and args[0] == "prefix":
        print(base / "scoop-apps" / args[1] / "current")
    elif args and args[0] == "import":
        (base / "imported.json").write_text(pathlib.Path(args[1]).read_text())
elif name == "dpkg-query":
    for pkg, essential, priority in [("keep", "no", "optional"), ("dep", "no", "optional"), ("stale", "no", "optional"), ("base", "yes", "optional"), ("standard", "no", "standard"), ("python3", "no", "optional"), ("linux-image-test", "no", "optional"), ("held", "no", "optional")]:
        print(f"{pkg}\tinstalled\t{essential}\tno\t{priority}")
elif name == "apt-mark":
    if args == ["showhold"]:
        print("held")
    else:
        assert args[0] == "-f" and pathlib.Path(args[1]).is_relative_to(base)
        assert args[2] in ("auto", "manual")
elif name == "apt-get":
    if "--simulate" in args:
        print("Remv stale [1.0]")
        if cfg.get("unsafe"):
            print("Remv keep [1.0]")
        if cfg.get("changed") and "remove" in args:
            print("Remv dep [1.0]")
        if cfg.get("inst"):
            print("Inst surprise (1.0)")
elif name in ("npm", "pnpm"):
    if args == ["root", "-g"]:
        print(cfg.get("prefix", str(base / name / "lib/node_modules")))
    elif args == ["list", "-g", "--depth=0", "--json"]:
        if cfg.get("malformed"):
            print("not JSON")
        else:
            data = {"dependencies": {"keep": {}, "@scope/stale": {}}}
            if name == "npm":
                data["dependencies"].update({"npm": {}, "corepack": {}})
            else:
                data["dependencies"]["@pnpm/exe"] = {}
            print(json.dumps(data if name == "npm" else [data]))
elif name == "bun" and args == ["pm", "ls", "-g"]:
    if cfg.get("bun_missing_manifest"):
        print('error: No package.json was found for directory "/Users/ianpascoe/.cache/.bun/install/global"\nnote: Run "bun init" to initialize a project', file=sys.stderr)
        sys.exit(1)
    if cfg.get("bun_missing_lock"):
        print("error: missing lockfile, nothing to list\nnote: run 'bun install' first", file=sys.stderr)
        sys.exit(1)
    print(str(base / "bun/node_modules") + " (2)")
    print("├── keep@1.0\n└── @scope/stale@2.0")
elif name == "uv":
    if args == ["tool", "dir"]:
        print(base / "uv")
    elif args == ["tool", "list"]:
        print("keep v1.0\n- keep\nstale v2.0\n- stale")
elif name == "cargo" and args[:2] == ["install", "--list"]:
    print("keep v1.0:\n    keep\nstale v2.0:\n    stale")
elif name == "pipx":
    if args == ["environment", "--value", "PIPX_HOME"]:
        print(base / "pipx")
    elif args == ["list", "--json"]:
        print(json.dumps({"venvs": {"keep": {}, "stale": {}, "other": {}}}))
    elif args and args[0] == "uninstall":
        assert len(args) == 2, "pipx takes one package at a time"
'''

with tempfile.TemporaryDirectory(prefix="prune-test-") as temp:
    base = Path(temp)
    bin_dir = base / "bin"
    bin_dir.mkdir()
    manifests = base / "manifests"
    manifests.mkdir()
    files = ["apt.txt", "npm-global.txt", "bun-global.txt", "pnpm-global.txt", "uv-tools.txt", "cargo-install.txt", "pipx.txt"]
    for name in files:
        (manifests / name).write_text("keep # trailing comment\n")
    for name in ("sudo", "apt-get", "apt-mark", "dpkg-query", "npm", "bun", "pnpm", "uv", "cargo", "pipx"):
        path = bin_dir / name
        path.write_text(f"#!{sys.executable}\n" + STUB)
        path.chmod(0o755)
    env = {"HOME": str(base), "PATH": str(bin_dir), "TEST_ROOT": str(base), "TMPDIR": str(base), "LC_ALL": "C"}

    def execute(*flags, config=None, answer="", success=True):
        (base / "config.json").write_text(json.dumps(config or {}))
        (base / "calls.jsonl").write_text("")
        result = subprocess.run([sys.executable, str(SCRIPT), "--manifest-dir", str(manifests), *flags],
                                env=env, input=answer, capture_output=True, text=True)
        assert (result.returncode == 0) == success, (result.stdout, result.stderr)
        calls = [json.loads(line) for line in (base / "calls.jsonl").read_text().splitlines()]
        return result, calls

    def removals(calls):
        return [c for c in calls if c[0] != "sudo" and "--simulate" not in c
                and ("uninstall" in c or "remove" in c)]

    for flags in (("--dry-run",), ("--yes",)):
        result, calls = execute(*flags)
        assert not any(" install " in line or " add " in line or "apt-get update" in line
                       for line in result.stdout.splitlines() if line.startswith("+ "))
    (manifests / "apt.txt").write_text("keep\nfresh\n")
    result, calls = execute("--dry-run")
    assert "+ sudo apt-get install -y fresh\n" in result.stdout
    assert not any(call[0] in {"sudo", "apt-get"} for call in calls)
    (manifests / "apt.txt").write_text("keep=2.0\n")
    result, calls = execute("--dry-run")
    assert "apt-get install -y keep=2.0" in result.stdout
    (manifests / "apt.txt").write_text("keep # trailing comment\n")
    result, calls = execute("--prune", "--dry-run")
    assert not removals(calls)
    assert all("Prune " + name + ":" in result.stdout for name in ("apt", "npm", "bun", "pnpm", "uv", "cargo", "pipx"))
    assert "Prune apt: stale" in result.stdout
    manual = next(c for c in calls if c[0] == "apt-mark" and "manual" in c)
    assert set(manual[4:]) == {"base", "standard", "python3", "linux-image-test", "held", "keep"}

    _, calls = execute("--prune", "--yes")
    removed = removals(calls)
    assert removed[-1] == ["apt-get", "-y", "--no-auto-remove", "remove", "stale"]
    assert ["pipx", "uninstall", "stale"] in removed and ["pipx", "uninstall", "other"] in removed
    assert not any("@pnpm/exe" in call for call in removed)
    assert not any("keep" in c or "corepack" in c or (c[0] == "npm" and c[-1] == "npm") for c in removed)

    _, calls = execute("--yes")
    assert not removals(calls)
    (manifests / "cargo-install.txt").write_text("fresh\n")
    _, calls = execute("--yes")
    assert ["cargo", "install", "--root", str(base / ".cargo"), "fresh"] in calls
    (manifests / "cargo-install.txt").write_text("keep\n")
    _, calls = execute("--prune", answer="yes\nno\n", success=False)
    assert not removals(calls)
    for flags, missing in ((flags, missing)
                           for flags in (("--prune", "--dry-run"), ("--prune", "--yes"))
                           for missing in ("bun_missing_lock", "bun_missing_manifest")):
        result, calls = execute(*flags, config={missing: True})
        assert "Skipping bun pruning:" in result.stdout
        assert not any(call[0] == "bun" for call in removals(calls))
        assert "Prune npm:" in result.stdout
        if "--dry-run" in flags:
            assert not removals(calls)
        else:
            assert removals(calls)
    for config in ({"fail": "bun"}, {"fail": "uv"}, {"fail": "apt-mark"}, {"malformed": True}, {"unsafe": True}, {"changed": True}, {"inst": True}):
        _, calls = execute("--prune", "--yes", config=config, success=False)
        assert not removals(calls), config

    assert not any("@pnpm/exe" in call for call in removals(calls))
    (manifests / "apt.txt").write_text("virtual-mailer\n")
    _, calls = execute("--prune", "--yes", success=False)
    assert not removals(calls)
    (manifests / "apt.txt").write_text("keep\n")

    # Missing manifests skip their manager, while an explicitly empty file prunes it.
    (manifests / "apt.txt").unlink()
    (manifests / "npm-global.txt").write_text("# intentionally empty\n")
    result, calls = execute("--prune", "--dry-run")
    assert "Prune npm: @scope/stale, keep" in result.stdout
    assert not any(c[0] in {"apt-get", "apt-mark", "dpkg-query"} for c in calls)
    for invalid in ("--all", "git+https://example.com/unidentified.git"):
        (manifests / "npm-global.txt").write_text(invalid + "\n")
        _, calls = execute("--prune", "--yes", success=False)
        assert not calls
    (manifests / "npm-global.txt").write_text("@scope/stale@2\n")
    result, _ = execute("--prune", "--dry-run")
    assert "Prune npm: keep" in result.stdout
    assert "Prune npm: @scope/stale" not in result.stdout
    _, calls = execute("--prune", "--dry-run", config={"prefix": str(base / ".local/share/mise/installs/tool/1/node_modules")}, success=False)
    assert not removals(calls)

    # Scoop uses its separate JSON config; no config means no Scoop operations.
    scoop = bin_dir / "scoop"
    scoop.write_text(f"#!{sys.executable}\n" + STUB)
    scoop.chmod(0o755)
    _, calls = execute("--prune", "--dry-run")
    assert not any(call[0] == "scoop" for call in calls)
    scoop_file = base / "scoop/scoopfile.json"
    scoop_file.parent.mkdir()
    scoop_file.write_text(json.dumps({"apps": [{"Name": "keep"}, {"name": "global-keep", "Info": "Global install"}], "buckets": []}))
    for name in ("scoop", "git", "mise", "python", "keep", "dep", "held", "global-keep"):
        manifest = base / "scoop-apps" / name / "current/manifest.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(json.dumps({"depends": "main/dep"} if name == "keep" else {}))
    result, calls = execute("--prune", "--dry-run")
    assert "Prune scoop: stale" in result.stdout and "Prune scoop: global-old (global)" in result.stdout
    assert not removals(calls)
    _, calls = execute("--prune", "--yes")
    assert not any(call[:2] == ["scoop", "import"] for call in calls)
    assert ["scoop", "uninstall", "stale"] in removals(calls)
    assert ["scoop", "uninstall", "--global", "global-old"] in removals(calls)
    _, calls = execute("--yes", config={"scoop_missing": True})
    assert json.loads((base / "imported.json").read_text())["apps"] == [{"Name": "keep"}]
    assert not any(call[0] == "scoop" and any(pkg in call for pkg in ("dep", "held", "git", "global-keep")) for call in removals(calls))
    for config in ({"scoop_missing": True}, {"scoop_duplicate": True}, {"scoop_invalid": True}):
        _, calls = execute("--prune", "--yes", config=config, success=False)
        assert not removals(calls)
    scoop_file.write_text("{}")
    _, calls = execute("--prune", "--yes", success=False)
    assert not calls
    scoop_file.write_text('{"apps": []}')
    result, _ = execute("--prune", "--dry-run")
    assert "Prune scoop: keep" in result.stdout

print("PASS: apt, Scoop (user/global/dependencies), six language managers, previews and safety guards")
