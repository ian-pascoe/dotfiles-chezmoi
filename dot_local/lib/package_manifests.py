"""Shared package inventory parsing and native command dispatch (Python 3.9+)."""

import json
import os
import re
import shlex
import shutil
import subprocess
from pathlib import Path

MANAGERS = {
    "apt": ("apt.txt", "apt-get", ["sudo", "apt-get", "install", "-y"]),
    "npm": ("npm-global.txt", "npm", ["npm", "install", "-g"]),
    "bun": ("bun-global.txt", "bun", ["bun", "add", "-g"]),
    "pnpm": ("pnpm-global.txt", "pnpm", ["pnpm", "add", "-g", "--yes"]),
    "uv": ("uv-tools.txt", "uv", ["uv", "tool", "install"]),
    "cargo": ("cargo-install.txt", "cargo", ["cargo", "install"]),
    "pipx": ("pipx.txt", "pipx", ["pipx", "install"]),
}


def find_executable(name):
    path = shutil.which(name)
    if os.name == "nt":
        if path and Path(path).suffix.lower() in {".cmd", ".bat"}:
            script = Path(path).with_suffix(".ps1")
            if script.is_file():
                return str(script)
        if not path:
            for directory in os.get_exec_path():
                script = Path(directory) / (name + ".ps1")
                if script.is_file():
                    return str(script)
    return path


def native_command(command):
    path = find_executable(command[0])
    if os.name == "nt" and path:
        if Path(path).suffix.lower() == ".ps1":
            quote = lambda value: "'" + value.replace("'", "''") + "'"
            invocation = " ".join(quote(value) for value in [path, *command[1:]])
            return ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                    "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); & "
                    + invocation + "; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }"]
        if Path(path).suffix.lower() in {".cmd", ".bat"} and any(re.search(r'[&|<>^%!"\r\n]', arg) for arg in command[1:]):
            raise ValueError("Unsafe batch-shim argument; use a PowerShell shim or native executable")
        return [path, *command[1:]]
    return command


class InventoryUnavailable(RuntimeError):
    """A manager cannot report inventory; not evidence of an empty installation."""


def capture(*command, stderr=None):
    return subprocess.check_output(
        native_command(command), text=True, encoding="utf-8", stderr=stderr,
        env={**os.environ, "LC_ALL": "C"}
    )


def run(command, dry_run=False):
    print("+ " + shlex.join(command), flush=True)
    if not dry_run:
        subprocess.run(native_command(command), check=True)


def confirm(message, yes):
    if not yes and input(message + " [y/N] ").lower() not in {"y", "yes"}:
        raise RuntimeError("Aborted.")


def name_of(manager, spec):
    # Ambiguous sources cannot safely establish ownership for destructive pruning.
    patterns = {
        "apt": r"([a-z0-9][a-z0-9+.-]*(?::[a-z0-9-]+)?)(?:=[^\s]+)?",
        "npm": r"(@[\w.-]+/[\w.-]+|[\w.-]+)(?:@[^\s]+)?",
        "bun": r"(@[\w.-]+/[\w.-]+|[\w.-]+)(?:@[^\s]+)?",
        "pnpm": r"(@[\w.-]+/[\w.-]+|[\w.-]+)(?:@[^\s]+)?",
        "cargo": r"([A-Za-z0-9_-]+)(?:@[^\s]+)?",
        "uv": r"([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[\w,.-]+\])?(?:[<>=!~].+|\s+@\s+\S+)?",
        "pipx": r"([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[\w,.-]+\])?(?:[<>=!~].+|\s+@\s+\S+)?",
    }
    match = re.fullmatch(patterns[manager], spec)
    if not match or spec.startswith("-"):
        raise ValueError(f"Cannot safely identify {manager} package: {spec!r}")
    name = match[1]
    return re.sub(r"[-_.]+", "-", name).lower() if manager in {"uv", "pipx"} else name


def mise_installs():
    data = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share")))
    if os.name == "nt":
        data = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData/Local")))
    return (Path(os.environ.get("MISE_DATA_DIR", str(data / "mise"))) / "installs").resolve()


def check_root(root, node_globals=False, for_pruning=True):
    if not str(root).strip():
        raise ValueError("Empty package-manager prefix")
    root = Path(root).resolve()
    installs = mise_installs()
    if for_pruning and root.is_relative_to(installs):
        relative = root.relative_to(installs).parts
        if not (node_globals and relative and relative[0] == "node"):
            raise RuntimeError(f"Refusing to prune a Mise-managed prefix: {root}")
    return root


def cargo_root(for_pruning=True):
    return check_root(os.environ.get("CARGO_INSTALL_ROOT", os.environ.get("CARGO_HOME", str(Path.home() / ".cargo"))), for_pruning=for_pruning)


def inventory(manager, for_pruning=True):
    """Return direct global packages and their uninstall command; failures propagate."""
    protected = set()
    if manager in {"npm", "pnpm"}:
        root = check_root(capture(manager, "root", "-g").strip(), node_globals=True, for_pruning=for_pruning)
        data = json.loads(capture(manager, "list", "-g", "--depth=0", "--json"))
        records = [data] if manager == "npm" else data
        names = set()
        if not isinstance(records, list):
            raise ValueError(f"Invalid {manager} inventory")
        for record in records:
            if not isinstance(record, dict) or not isinstance(
                record.get("dependencies", {}), dict
            ):
                raise TypeError(f"Invalid {manager} inventory")
            names.update(record.get("dependencies", {}))
        command = [manager, "uninstall" if manager == "npm" else "remove", "-g"]
        if manager == "npm":
            protected.update({"npm", "corepack"})
    elif manager == "bun":
        try:
            output = capture("bun", "pm", "ls", "-g", stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as error:
            if error.returncode == 1 and not error.output and error.stderr.strip() == (
                "error: missing lockfile, nothing to list\nnote: run 'bun install' first"
            ):
                raise InventoryUnavailable("Bun global lockfile is missing") from error
            if error.stderr:
                raise RuntimeError(error.stderr.strip()) from error
            raise
        lines = output.splitlines()
        # Bun's first line is its global node_modules path, followed by a flat tree.
        if not lines or not Path(re.sub(r"\s+\(.*\)$", "", lines[0])).is_absolute():
            raise ValueError("Unrecognized Bun inventory; refusing to prune")
        root = check_root(re.sub(r"\s+\(.*\)$", "", lines[0]), for_pruning=for_pruning)
        names = set()
        for line in lines[1:]:
            if not line.strip():
                continue
            match = re.fullmatch(r"[├└]── (.+)", line)
            if not match:
                raise ValueError(f"Unrecognized Bun package: {line!r}")
            names.add(name_of("bun", match[1]))
        command = ["bun", "remove", "-g"]
    elif manager in {"uv", "cargo"}:
        if manager == "uv":
            root = check_root(capture("uv", "tool", "dir").strip(), for_pruning=for_pruning)
            output = capture("uv", "tool", "list")
            command = ["uv", "tool", "uninstall"]
        else:
            root = cargo_root(for_pruning=for_pruning)
            output = capture("cargo", "install", "--list", "--root", str(root))
            command = ["cargo", "uninstall", "--root", str(root)]
        names = set()
        for line in output.splitlines():
            if not line.strip() or line.startswith((" ", "\t", "-")):
                continue
            match = re.fullmatch(r"([\w.-]+) v\S+(?: .*)?:?", line)
            if not match:
                raise ValueError(f"Unrecognized {manager} inventory: {line!r}")
            names.add(name_of(manager, match[1]))
    else:
        root = check_root(
            capture("pipx", "environment", "--value", "PIPX_HOME").strip(), for_pruning=for_pruning
        )
        data = json.loads(capture("pipx", "list", "--json"))
        if not isinstance(data, dict) or not isinstance(data.get("venvs"), dict):
            raise ValueError("Invalid pipx inventory")
        names = {name_of("pipx", name) for name in data["venvs"]}
        command = ["pipx", "uninstall"]
    # Keep a manager if this very invocation still relies on its legacy global copy.
    for executable, owners in {
        "pnpm": {"pnpm", "@pnpm/exe"},
        "bun": {"bun"},
        "uv": {"uv"},
        "pipx": {"pipx"},
        "cargo": {"cargo", "rustup"},
    }.items():
        path = find_executable(executable)
        # Shell launchers need not be symlinks into the package root. Only retire
        # bootstrap copies when the active executable is demonstrably separate in Mise.
        if path:
            active = Path(path).resolve()
            if not (
                active.is_relative_to(mise_installs())
                and not active.is_relative_to(root)
            ):
                protected.update(owners)
    for name in names:
        if name_of(manager, name) != name:
            raise ValueError(f"Invalid installed package name: {name!r}")
    if for_pruning and names & protected:
        print(
            f"Keeping {manager} bootstrap packages: {', '.join(sorted(names & protected))}"
        )
    return names, command, protected


def scoop_apps(data):
    if not isinstance(data, dict) or not isinstance(data.get("apps"), list):
        raise ValueError("Scoop config/inventory must contain an apps array")
    apps = {}
    for record in data["apps"]:
        if not isinstance(record, dict):
            raise ValueError("Invalid Scoop app record")
        record = {key.lower(): value for key, value in record.items()}
        name, info = record.get("name"), record.get("info", "")
        if not isinstance(name, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]*", name) or not isinstance(info, str):
            raise ValueError("Invalid Scoop app name or Info field")
        key = (name.lower(), "global install" in info.lower())
        if key in apps:
            raise ValueError(f"Duplicate Scoop app: {key}")
        apps[key] = record
    return apps


