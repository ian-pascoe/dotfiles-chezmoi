import { basename } from "node:path";
import { createLocalBashOperations, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function configuredShell() {
  const requested = process.env.PI_USER_BASH_SHELL || process.env.SHELL;
  if (requested) {
    const name = basename(requested);
    if (name === "zsh" || name === "bash") return requested;
  }

  return "/bin/bash";
}

function shellExecCommand(shellPath: string, command: string) {
  const shellName = basename(shellPath);

  if (shellName === "zsh") {
    // `-f` avoids sourcing ~/.zshrc, which can start prompt integrations that
    // expect a real interactive job-control terminal.
    return `exec ${shellQuote(shellPath)} -fc ${shellQuote(command)}`;
  }

  // Bash is already non-interactive here, but make the rc/profile behavior
  // explicit so BASH_ENV or profile customizations do not affect tool output.
  return `exec ${shellQuote(shellPath)} --noprofile --norc -c ${shellQuote(command)}`;
}

export default function (pi: ExtensionAPI) {
  const local = createLocalBashOperations();

  pi.on("user_bash", () => {
    return {
      operations: {
        exec(command, cwd, options) {
          const shellCommand = shellExecCommand(configuredShell(), command);
          return local.exec(shellCommand, cwd, options);
        },
      },
    };
  });
}
