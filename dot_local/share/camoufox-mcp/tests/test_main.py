import os
import unittest
from unittest.mock import patch

from main import (
    build_mcp_command,
    default_launch_config,
    default_user_data_dir,
    host_camoufox_os,
    requested_headless,
)


class BuildMcpCommandTests(unittest.TestCase):
    def test_injects_camoufox_defaults_when_missing(self):
        launch_config = {
            "executable_path": "/tmp/camoufox-bin",
            "env": {"CAMOUFOX_TEST": "1"},
        }

        command, env = build_mcp_command([], launch_config)

        self.assertEqual(command[:3], ["npx", "-y", "@playwright/mcp@latest"])
        self.assertIn("--browser=firefox", command)
        self.assertIn("--executable-path=/tmp/camoufox-bin", command)
        self.assertIn(f"--user-data-dir={default_user_data_dir()}", command)
        self.assertEqual(env["CAMOUFOX_TEST"], "1")
        self.assertEqual(env["PATH"], os.environ["PATH"])

    def test_preserves_user_supplied_args_and_overrides_defaults(self):
        launch_config = {
            "executable_path": "/tmp/camoufox-bin",
            "env": {"CAMOUFOX_TEST": "1"},
        }

        args = [
            "--port",
            "8123",
            "--browser=firefox",
            "--user-data-dir",
            "/tmp/profile",
            "--executable-path=/custom/firefox",
            "--headless",
        ]
        command, env = build_mcp_command(args, launch_config)

        self.assertEqual(command[-len(args) :], args)
        self.assertEqual(command.count("--browser=firefox"), 1)
        self.assertNotIn("--executable-path=/tmp/camoufox-bin", command)
        self.assertNotIn(f"--user-data-dir={default_user_data_dir()}", command)
        self.assertEqual(env["CAMOUFOX_TEST"], "1")

    def test_does_not_force_camoufox_binary_for_non_firefox_browser(self):
        launch_config = {
            "executable_path": "/tmp/camoufox-bin",
            "env": {"CAMOUFOX_TEST": "1"},
        }

        command, env = build_mcp_command(["--browser", "webkit"], launch_config)

        self.assertNotIn("--browser=firefox", command)
        self.assertNotIn("--executable-path=/tmp/camoufox-bin", command)
        self.assertNotIn(f"--user-data-dir={default_user_data_dir()}", command)
        self.assertEqual(command[-2:], ["--browser", "webkit"])
        self.assertEqual(env["CAMOUFOX_TEST"], "1")

    def test_does_not_force_persistent_profile_in_isolated_mode(self):
        launch_config = {
            "executable_path": "/tmp/camoufox-bin",
            "env": {"CAMOUFOX_TEST": "1"},
        }

        command, env = build_mcp_command(["--isolated"], launch_config)

        self.assertNotIn(f"--user-data-dir={default_user_data_dir()}", command)
        self.assertEqual(command[-1], "--isolated")
        self.assertEqual(env["CAMOUFOX_TEST"], "1")

    def test_does_not_force_persistent_profile_in_extension_mode(self):
        launch_config = {
            "executable_path": "/tmp/camoufox-bin",
            "env": {"CAMOUFOX_TEST": "1"},
        }

        command, env = build_mcp_command(["--extension"], launch_config)

        self.assertNotIn(f"--user-data-dir={default_user_data_dir()}", command)
        self.assertEqual(command[-1], "--extension")
        self.assertEqual(env["CAMOUFOX_TEST"], "1")


class HostDetectionTests(unittest.TestCase):
    def test_maps_linux_host_to_linux(self):
        with patch("platform.system", return_value="Linux"):
            self.assertEqual(host_camoufox_os(), "linux")

    def test_maps_macos_host_to_macos(self):
        with patch("platform.system", return_value="Darwin"):
            self.assertEqual(host_camoufox_os(), "macos")

    def test_maps_windows_host_to_windows(self):
        with patch("platform.system", return_value="Windows"):
            self.assertEqual(host_camoufox_os(), "windows")

    def test_default_launch_config_uses_detected_host_os(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            with patch("main.host_camoufox_os", return_value="linux"):
                default_launch_config([])

        self.assertEqual(mock_launch.call_args.kwargs["os"], "linux")

    def test_default_launch_config_defaults_headless_to_false(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            default_launch_config([])

        self.assertFalse(mock_launch.call_args.kwargs["headless"])

    def test_default_launch_config_enables_cache_for_history_navigation(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            default_launch_config([])

        self.assertTrue(mock_launch.call_args.kwargs["enable_cache"])

    def test_default_launch_config_uses_persistent_profile_by_default(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            default_launch_config([])

        self.assertTrue(mock_launch.call_args.kwargs["persistent_context"])
        self.assertEqual(
            mock_launch.call_args.kwargs["user_data_dir"], default_user_data_dir()
        )

    def test_default_launch_config_skips_persistent_profile_in_isolated_mode(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            default_launch_config(["--isolated"])

        self.assertIsNone(mock_launch.call_args.kwargs["persistent_context"])
        self.assertIsNone(mock_launch.call_args.kwargs["user_data_dir"])

    def test_default_launch_config_skips_persistent_profile_in_extension_mode(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            default_launch_config(["--extension"])

        self.assertIsNone(mock_launch.call_args.kwargs["persistent_context"])
        self.assertIsNone(mock_launch.call_args.kwargs["user_data_dir"])

    def test_default_launch_config_passes_through_headless_true(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            with patch("main.host_camoufox_os", return_value="macos"):
                default_launch_config(["--headless"])

        self.assertTrue(mock_launch.call_args.kwargs["headless"])

    def test_default_launch_config_uses_virtual_headless_with_xvfb_on_linux(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            with patch("main.host_camoufox_os", return_value="linux"):
                with patch("main.shutil.which", return_value="/usr/bin/Xvfb"):
                    default_launch_config(["--headless"])

        self.assertEqual(mock_launch.call_args.kwargs["headless"], "virtual")

    def test_default_launch_config_keeps_plain_headless_without_xvfb_on_linux(self):
        with patch(
            "main.launch_options", return_value={"executable_path": "/tmp/camoufox-bin"}
        ) as mock_launch:
            with patch("main.host_camoufox_os", return_value="linux"):
                with patch("main.shutil.which", return_value=None):
                    default_launch_config(["--headless"])

        self.assertTrue(mock_launch.call_args.kwargs["headless"])


class HeadlessParsingTests(unittest.TestCase):
    def test_requested_headless_detects_flag_form(self):
        self.assertTrue(requested_headless(["--headless"]))

    def test_requested_headless_detects_equals_form(self):
        self.assertTrue(requested_headless(["--headless=true"]))

    def test_requested_headless_defaults_to_false(self):
        self.assertFalse(requested_headless([]))


if __name__ == "__main__":
    unittest.main()
