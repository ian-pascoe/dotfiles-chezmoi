#!/usr/bin/env python3
"""Test both Windows launchers using Linux pwsh and fake executables only."""
import json
import os
import runpy
from types import SimpleNamespace
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PWSH = shutil.which("pwsh")
assert PWSH, "pwsh is required for the launcher regression check"

with tempfile.TemporaryDirectory(prefix="prune-windows-' space-") as directory:
    base = Path(directory)
    bin_dir = base / "bin"
    bin_dir.mkdir()
    wrapper = base / "install-package-manifests.ps1"
    shutil.copyfile(ROOT / "dot_local/bin/executable_install-package-manifests.ps1", wrapper)
    payload = base / "install-package-manifests"
    payload.write_text("This fixture must never be executed.\n")
    log = base / "calls.jsonl"
    env = {**os.environ, "PATH": str(bin_dir), "TEST_LOG": str(log)}
    arguments = ["--prune", "--dry-run", "--manifest-dir", str(base / "config ' $ & space"), "--yes"]

    def fake(name, parent=bin_dir):
        executable = parent / name
        executable.write_text(
            f"#!{sys.executable}\n"
            "import json, os, pathlib, sys\n"
            "name = pathlib.Path(sys.argv[0]).name\n"
            "with open(os.environ['TEST_LOG'], 'a') as log:\n"
            "    log.write(json.dumps([name, *sys.argv[1:]]) + '\\n')\n"
            "if '-c' in sys.argv:\n"
            "    sys.exit(1 if name in os.environ.get('OLD_PYTHONS', '').split(',') else 0)\n"
            "sys.exit(int(os.environ.get('INSTALLER_EXIT', '0')))\n"
        )
        executable.chmod(0o755)

    def run(expected=0, **overrides):
        log.write_text("")
        result = subprocess.run(
            [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-File", str(wrapper), *arguments],
            env={**env, **overrides}, capture_output=True, text=True, timeout=30,
        )
        assert result.returncode == expected, (result.returncode, result.stdout, result.stderr)
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        return result, calls

    for name in ("python3", "python", "py"):
        fake(name)
    _, calls = run()
    assert calls[0][0:2] == ["python3", "-c"]
    assert calls[-1] == ["python3", str(payload), *arguments]
    assert len(calls) == 2

    _, calls = run(37, INSTALLER_EXIT="37")
    assert calls[-1] == ["python3", str(payload), *arguments]
    _, calls = run(OLD_PYTHONS="python3")
    assert calls[-1] == ["python", str(payload), *arguments]
    _, calls = run(OLD_PYTHONS="python3,python")
    assert calls[-2][0:3] == ["py", "-3", "-c"]
    assert calls[-1] == ["py", "-3", str(payload), *arguments]
    result, calls = run(1, OLD_PYTHONS="python3,python,py")
    assert "Python 3.9+ is required" in result.stderr
    assert all("-c" in call for call in calls)

    for name in ("python3", "python", "py"):
        (bin_dir / name).unlink()
    result, calls = run(1)
    assert "Python 3.9+ is required" in result.stderr and not calls

    # Store execution aliases are never probed (probing could open the Store).
    aliases = base / "Microsoft/WindowsApps"
    aliases.mkdir(parents=True)
    fake("python3", aliases)
    fake("python")
    _, calls = run(PATH=str(aliases) + os.pathsep + str(bin_dir))
    assert all(call[0] == "python" for call in calls)

    # Exercise the shared installer's Windows PowerShell-shim invocation as well.
    shim = base / "scoop.ps1"
    shim.write_text("ConvertTo-Json -InputObject @($args) -Compress | Set-Content -LiteralPath $env:TEST_LOG -Encoding utf8\nexit 29\n")
    namespace = runpy.run_path(str(ROOT / "dot_local/lib/package_manifests.py"))
    native = namespace["native_command"]
    original_os = native.__globals__["os"]
    original_find = native.__globals__["find_executable"]
    try:
        native.__globals__["os"] = SimpleNamespace(name="nt")
        native.__globals__["find_executable"] = lambda name: str(shim)
        forwarded = ["uninstall", "literal'; throw 'not-code", "$env:HOME", "quoted space"]
        command = native(["scoop", *forwarded])
        result = subprocess.run([PWSH, *command[1:]], env=env, capture_output=True, text=True, timeout=30)
        assert result.returncode == 29, result.stderr
        assert json.loads(log.read_text(encoding="utf-8-sig")) == forwarded
    finally:
        native.__globals__["os"] = original_os
        native.__globals__["find_executable"] = original_find

    payload.unlink()
    result, calls = run(1)
    assert "Installer payload not found" in result.stderr and not calls

    wrapper = base / "sync-package-manifests.ps1"
    shutil.copyfile(ROOT / "dot_local/bin/executable_sync-package-manifests.ps1", wrapper)
    payload = base / "sync-package-manifests"
    payload.write_text("This fixture must never be executed.\n")
    arguments = ["--output-dir", str(base / "inventory ' $ & space")]
    fake("python3")
    _, calls = run()
    assert calls[-1] == ["python3", str(payload), *arguments]
    _, calls = run(37, INSTALLER_EXIT="37")
    assert calls[-1] == ["python3", str(payload), *arguments]
    _, calls = run(OLD_PYTHONS="python3")
    assert calls[-1] == ["python", str(payload), *arguments]
    arguments = ["--help"]
    _, calls = run()
    assert calls[-1] == ["python3", str(payload), "--help"]
    payload.unlink()
    result, calls = run(1)
    assert "Exporter payload not found" in result.stderr and not calls

ignore = (ROOT / ".chezmoiignore").read_text()
windows = ignore.split('{{ if eq .chezmoi.os "windows" }}', 1)[1].split("{{ end }}", 1)[0]
assert "!.local/bin/install-package-manifests\n" in windows
assert "!.local/bin/sync-package-manifests\n" in windows
print("PASS: install/sync Windows launchers and Scoop shim, argument quoting, exit codes, Store/missing guards")
