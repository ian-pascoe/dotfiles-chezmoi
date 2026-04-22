import os
import platform
import shutil
import sys
from pathlib import Path

from browserforge.fingerprints import Screen
from camoufox.utils import launch_options

PLAYWRIGHT_MCP_PACKAGE = "@playwright/mcp@latest"
DEFAULT_BROWSER = "firefox"


def default_user_data_dir() -> str:
    return str(Path.home() / ".camoufox" / "profile")


def host_camoufox_os() -> str:
    system = platform.system()
    if system == "Darwin":
        return "macos"
    if system == "Windows":
        return "windows"
    return "linux"


def requested_headless(args: list[str]) -> bool:
    for arg in args:
        if arg == "--headless":
            return True
        if arg.startswith("--headless="):
            value = arg.split("=", 1)[1].strip().lower()
            return value not in {"0", "false", "no", "off"}
    return False


def resolved_headless(args: list[str]) -> bool | str:
    headless = requested_headless(args)
    if not headless:
        return False
    if host_camoufox_os() == "linux" and shutil.which("Xvfb"):
        return "virtual"
    return True


def default_launch_config(args: list[str]) -> dict:
    uses_persistent_profile = _uses_persistent_profile(args)
    config = launch_options(
        headless=resolved_headless(args),
        os=host_camoufox_os(),
        screen=Screen(min_width=1280, max_width=1920, min_height=800, max_height=1080),
        enable_cache=True,
        persistent_context=True if uses_persistent_profile else None,
        user_data_dir=default_user_data_dir() if uses_persistent_profile else None,
        i_know_what_im_doing=True,
    )
    return {key: value for key, value in config.items() if value is not None}


def _arg_has_value(args: list[str], flag: str) -> bool:
    for index, arg in enumerate(args):
        if arg == flag:
            return index + 1 < len(args)
        if arg.startswith(f"{flag}="):
            return True
    return False


def _requested_browser(args: list[str]) -> str | None:
    for index, arg in enumerate(args):
        if arg.startswith("--browser="):
            return arg.split("=", 1)[1]
        if arg == "--browser" and index + 1 < len(args):
            return args[index + 1]
    return None


def _uses_persistent_profile(args: list[str]) -> bool:
    return "--isolated" not in args and "--extension" not in args


def build_mcp_command(
    args: list[str], launch_config: dict
) -> tuple[list[str], dict[str, str]]:
    env = os.environ.copy()
    env.update({key: str(value) for key, value in launch_config.get("env", {}).items()})

    browser = _requested_browser(args) or DEFAULT_BROWSER
    command = ["npx", "-y", PLAYWRIGHT_MCP_PACKAGE]

    if browser == DEFAULT_BROWSER and not _arg_has_value(args, "--browser"):
        command.append(f"--browser={DEFAULT_BROWSER}")

    if browser == DEFAULT_BROWSER and not _arg_has_value(args, "--executable-path"):
        command.append(f"--executable-path={launch_config['executable_path']}")

    if (
        browser == DEFAULT_BROWSER
        and _uses_persistent_profile(args)
        and not _arg_has_value(args, "--user-data-dir")
    ):
        command.append(f"--user-data-dir={default_user_data_dir()}")

    command.extend(args)
    return command, env


def main() -> None:
    args = sys.argv[1:]
    command, env = build_mcp_command(args, default_launch_config(args))
    os.execvpe(command[0], command, env)


if __name__ == "__main__":
    main()
