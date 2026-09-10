#!/usr/bin/env python3
"""Exercise real chezmoi scheduling with fake tools and a disposable home."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
CHEZMOI = shutil.which("chezmoi")
PWSH = shutil.which("pwsh")
assert CHEZMOI and PWSH, "chezmoi and PowerShell 7 (pwsh) are required"

with tempfile.TemporaryDirectory(prefix="chezmoi-hooks-' space-") as directory:
    base = Path(directory)
    source, home, tools = (base / name for name in ("source", "home", "bin"))
    for path in (source, home, tools, home / "runtime"):
        path.mkdir(parents=True, exist_ok=True)
    (base / "config.toml").write_text(
        '[interpreters.ps1]\ncommand = "' + PWSH + '"\n'
        'args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-File"]\n'
    )
    shutil.copytree(ROOT / ".chezmoiscripts", source / ".chezmoiscripts")
    for name in (
        "dot_config/mise/config.toml",
        "dot_pi/agent/package.json",
        "dot_config/bat/config",
        "dot_config/systemd/user/syncthing.service",
        "dot_config/systemd/user/vncserver@.service",
        "dot_themes/dracula/bat.tmTheme",
    ):
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)

    log = base / "calls"
    env = {
        **os.environ,
        "HOME": str(home),
        "PATH": f"{tools}:/usr/bin:/bin",
        "XDG_CONFIG_HOME": str(home / ".config"),
        "XDG_DATA_HOME": str(home / ".local/share"),
        "XDG_CACHE_HOME": str(home / ".cache"),
        "XDG_STATE_HOME": str(home / ".local/state"),
        "XDG_RUNTIME_DIR": str(home / "runtime"),
        "DBUS_SESSION_BUS_ADDRESS": f"unix:path={home}/runtime/bus",
        "HOOK_TEST_LOG": str(log),
    }
    stubs = {
        "mise": '''test "$MISE_GLOBAL_CONFIG_FILE" = "$HOME/.config/mise/config.toml"
test "$1" = --cd
test "$2" = "$HOME/.config/mise"
shift 2
if [ "$1" = install ]; then
  test -f "$HOME/.config/mise/config.toml"
  echo mise >> "$HOOK_TEST_LOG"
  test "${FAIL_TOOL:-}" != mise
else
  test "$1" = exec
  shift
  while [ "$1" != -- ]; do shift; done
  shift
  exec "$@"
fi
''',
        "pnpm": '''test "$*" = "--dir $HOME/.pi/agent install --ignore-scripts"
test -f "$HOME/.pi/agent/package.json"
echo pi >> "$HOOK_TEST_LOG"
test "${FAIL_TOOL:-}" != pi
''',
        "bat": '''test "$*" = 'cache --build'
test -f "${BAT_CONFIG_DIR:-$HOME/.config/bat}/themes/current.tmTheme"
echo bat >> "$HOOK_TEST_LOG"
test "${FAIL_TOOL:-}" != bat
''',
        "systemctl": '''test "$*" = '--user daemon-reload'
test -f "$HOME/.config/systemd/user/syncthing.service"
echo systemd >> "$HOOK_TEST_LOG"
''',
    }
    for name, body in stubs.items():
        executable = tools / name
        executable.write_text("#!/bin/sh\nset -eu\n" + body)
        executable.chmod(0o755)

    command = [
        CHEZMOI, "--config", str(base / "config.toml"),
        "--source", str(source), "--destination", str(home),
        "--persistent-state", str(base / "state.db"),
        "--cache", str(base / "cache"), "--no-tty", "--force",
        "--override-data", '{"chezmoi":{"os":"linux"}}',
    ]

    def apply(expected, *, fail=False, dry_run=False, fail_tool="pi"):
        log.write_text("")
        result = subprocess.run(
            command + (["--dry-run"] if dry_run else []) + ["apply"],
            env={**env, "FAIL_TOOL": fail_tool if fail else ""},
            text=True, capture_output=True,
        )
        assert (result.returncode != 0) == fail, result.stdout + result.stderr
        assert log.read_text().splitlines() == expected, result.stdout + result.stderr + log.read_text()

    # A missing user session and unselected theme must not become successful runs.
    apply([], dry_run=True)
    apply(["mise", "pi"])
    apply([])
    (home / ".config/theme").symlink_to(home / ".themes/dracula", target_is_directory=True)
    with socket.socket(socket.AF_UNIX) as bus:
        bus.bind(str(home / "runtime/bus"))
        apply(["bat", "systemd"])
        apply([])

        for name, expected in (
            ("dot_config/mise/config.toml", ["mise"]),
            ("dot_config/bat/config", ["bat"]),
            ("dot_themes/dracula/bat.tmTheme", ["bat"]),
            ("dot_config/systemd/user/syncthing.service", ["systemd"]),
        ):
            path = source / name
            path.write_text(path.read_text() + "\n")
            apply(expected)
            apply([])

        manifest = source / "dot_pi/agent/package.json"
        manifest.write_text(manifest.read_text() + "\n")
        apply(["pi"], fail=True)
        apply(["pi"])
        apply([])

    # No Unix shell hooks should be emitted on Windows; no systemd hook on macOS.
    for platform in ("windows", "darwin"):
        platform_command = command[:-2] + ["--override-data", f'{{"chezmoi":{{"os":"{platform}"}}}}']
        for hook in sorted((source / ".chezmoiscripts").glob("*.tmpl")):
            result = subprocess.run(platform_command + ["execute-template", "--file", str(hook)],
                                    env=env, text=True, capture_output=True, check=True)
            if (platform == "windows" and ".sh." in hook.name) or (platform == "darwin" and ("systemd" in hook.name or ".ps1." in hook.name)):
                assert not result.stdout.strip(), result.stdout
            elif ".sh." in hook.name:
                subprocess.run(["sh", "-n"], input=result.stdout, text=True, check=True)

    # Execute Windows-rendered scripts in profile-free PowerShell, not just a parser.
    command = command[:-2] + ["--override-data", '{"chezmoi":{"os":"windows"}}']
    env["BAT_CONFIG_DIR"] = str(home / "custom bat")
    env["XDG_CONFIG_HOME"] = str(home / "custom config")
    apply([], dry_run=True)
    apply(["mise", "pi"])
    apply([])
    selected_theme = Path(env["XDG_CONFIG_HOME"]) / "theme/bat.tmTheme"
    selected_theme.parent.mkdir(parents=True)
    shutil.copyfile(source / "dot_themes/dracula/bat.tmTheme", selected_theme)
    apply(["bat"])
    current_theme = Path(env["BAT_CONFIG_DIR"]) / "themes/current.tmTheme"
    assert current_theme.read_bytes() == selected_theme.read_bytes()
    assert not current_theme.is_symlink(), "Windows must not require symlink privileges"
    apply([])

    for name, tool in (
        ("dot_config/mise/config.toml", "mise"),
        ("dot_pi/agent/package.json", "pi"),
        ("dot_config/bat/config", "bat"),
    ):
        path = source / name
        path.write_text(path.read_text() + "\n")
        apply([tool], fail=True, fail_tool=tool)
        apply([tool])
        apply([])

    # Updating a theme must not write through an existing link into the source theme.
    current_theme.unlink()
    protected_theme = home / "old-theme.tmTheme"
    protected_theme.write_text("do not overwrite")
    current_theme.symlink_to(protected_theme)
    source_theme = source / "dot_themes/dracula/bat.tmTheme"
    source_theme.write_text(source_theme.read_text() + "\n")
    apply(["bat"])
    assert protected_theme.read_text() == "do not overwrite"
    assert current_theme.read_bytes() == selected_theme.read_bytes()
    apply([])

    current_theme.unlink()
    missing_target = home / "missing-theme.tmTheme"
    current_theme.symlink_to(missing_target)
    selected_theme.write_text(selected_theme.read_text() + "\n")
    apply(["bat"])
    assert not missing_target.exists(), "must not copy through dangling symlinks"
    assert not current_theme.is_symlink()
    apply([])

    # A new destination is a new trigger, including the no-environment fallback.
    del env["BAT_CONFIG_DIR"]
    apply(["bat"])
    assert (Path(env["XDG_CONFIG_HOME"]) / "bat/themes/current.tmTheme").is_file()
    apply([])
    del env["XDG_CONFIG_HOME"]
    apply(["bat"])
    assert (home / ".config/bat/themes/current.tmTheme").is_file()
    apply([])

print("PASS: Unix + PowerShell execution, scheduling, retries, path quoting, custom Windows paths, safe theme copy and OS guards")
