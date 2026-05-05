# Package Manifests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add store-only package manifests for non-mise, non-Homebrew package managers and keep them refreshed during `upgrade-all`.

**Architecture:** Plain text manifests live under `dot_config/packages/`, which chezmoi deploys to `~/.config/packages/`. A local `sync-package-manifests` command refreshes the source manifests from installed package-manager state, and `upgrade-all` calls it after package updates. No package installation runs during `chezmoi apply`.

**Tech Stack:** chezmoi source tree, plaintext package manifests, shell verification commands.

---

## File Structure

- Create `dot_config/packages/apt.txt`: Debian/Ubuntu apt package selections.
- Create `dot_config/packages/npm-global.txt`: npm global package selections.
- Create `dot_config/packages/bun-global.txt`: Bun global package selections.
- Create `dot_config/packages/pnpm-global.txt`: pnpm global package selections.
- Create `dot_config/packages/uv-tools.txt`: uv tool selections.
- Create `dot_config/packages/cargo-install.txt`: cargo-installed binary selections.
- Create `dot_config/packages/pipx.txt`: pipx tool selections.
- Create `dot_local/bin/executable_sync-package-manifests`: refreshes source manifests.
- Modify `dot_local/bin/executable_upgrade-all`: calls the refresh command during normal upgrades.

Each file is store-only, one package spec per line, with comments allowed.

## Tasks

### Task 1: Add Store-Only Manifests

**Files:**

- Create: `dot_config/packages/apt.txt`
- Create: `dot_config/packages/npm-global.txt`
- Create: `dot_config/packages/bun-global.txt`
- Create: `dot_config/packages/pnpm-global.txt`
- Create: `dot_config/packages/uv-tools.txt`
- Create: `dot_config/packages/cargo-install.txt`
- Create: `dot_config/packages/pipx.txt`

- [ ] **Step 1: Create manifest directory**

Run:

```bash
mkdir -p dot_config/packages
```

Expected: `dot_config/packages` exists.

- [ ] **Step 2: Add apt manifest**

Create `dot_config/packages/apt.txt`:

```text
# Debian/Ubuntu apt packages
# One package name per line.
```

- [ ] **Step 3: Add npm global manifest**

Create `dot_config/packages/npm-global.txt`:

```text
# npm global packages
# One package spec per line.
```

- [ ] **Step 4: Add Bun global manifest**

Create `dot_config/packages/bun-global.txt`:

```text
# Bun global packages
# One package spec per line.
```

- [ ] **Step 5: Add pnpm global manifest**

Create `dot_config/packages/pnpm-global.txt`:

```text
# pnpm global packages
# One package spec per line.
```

- [ ] **Step 6: Add uv tools manifest**

Create `dot_config/packages/uv-tools.txt`:

```text
# uv tools
# One tool spec per line.

camoufox[geoip]
nano-pdf
```

- [ ] **Step 7: Add cargo install manifest**

Create `dot_config/packages/cargo-install.txt`:

```text
# cargo-installed binaries
# One crate spec per line.

cargo-binstall
cargo-cache
cargo-update
```

- [ ] **Step 8: Add pipx manifest**

Create `dot_config/packages/pipx.txt`:

```text
# pipx tools
# One package spec per line.
```

### Task 2: Verify Store-Only Behavior

**Files:**

- Inspect: `dot_config/packages/*.txt`
- Inspect: repository root for `run_once_*` and `run_onchange_*` files

- [ ] **Step 1: Verify files exist**

Run:

```bash
test -f dot_config/packages/apt.txt && \
test -f dot_config/packages/npm-global.txt && \
test -f dot_config/packages/bun-global.txt && \
test -f dot_config/packages/pnpm-global.txt && \
test -f dot_config/packages/uv-tools.txt && \
test -f dot_config/packages/cargo-install.txt && \
test -f dot_config/packages/pipx.txt
```

Expected: command exits with status `0`.

- [ ] **Step 2: Verify no package install hooks were added**

Run:

```bash
find . -maxdepth 2 \( -name 'run_once_*' -o -name 'run_onchange_*' \) -print
```

Expected: no new package install hook files appear.

- [ ] **Step 3: Verify chezmoi target mapping**

Run:

```bash
chezmoi target-path dot_config/packages/apt.txt
```

Expected: output ends with `.config/packages/apt.txt`.

- [ ] **Step 4: Review git diff**

Run:

```bash
git diff -- docs/superpowers/specs/2026-05-05-package-manifests-design.md docs/superpowers/plans/2026-05-05-package-manifests.md dot_config/packages
```

Expected: diff only contains the spec, plan, and store-only manifest files.

### Task 3: Refresh Manifests During Upgrades

**Files:**

- Create: `dot_local/bin/executable_sync-package-manifests`
- Modify: `dot_local/bin/executable_upgrade-all`

- [ ] **Step 1: Add sync command**

Create `dot_local/bin/executable_sync-package-manifests` as an executable chezmoi source file. It must resolve `chezmoi source-path`, export installed package lists directly from package-manager commands, and update `dot_config/packages/*.txt` only when content changes.

- [ ] **Step 2: Wire into upgrade-all**

Add this section after package-manager updates and before the dotfiles pull in `dot_local/bin/executable_upgrade-all`:

```bash
####################################################################
# Package manifests
if has_cmd sync-package-manifests; then
  echo "Refreshing package manifests..."
  sync-package-manifests
  echo "Package manifests refreshed successfully!"
fi
```

- [ ] **Step 3: Verify sync command**

Run:

```bash
bash -n dot_local/bin/executable_sync-package-manifests dot_local/bin/executable_upgrade-all
bash dot_local/bin/executable_sync-package-manifests
```

Expected: both commands exit with status `0`.

- [ ] **Step 4: Verify manifest counts**

Compare each manifest against direct package-manager exports. Expected current counts are apt `223`, npm `22`, bun `0`, pnpm `0`, uv `4`, cargo `12`, and pipx `0`, with `0` missing and `0` extra for every manager.

## Self-Review

- Spec coverage: plan creates every requested manifest under `dot_config/packages/`, adds automatic refresh during `upgrade-all`, and keeps `chezmoi apply` store-only.
- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: no installer or apply-time package-manager mutation is included.
