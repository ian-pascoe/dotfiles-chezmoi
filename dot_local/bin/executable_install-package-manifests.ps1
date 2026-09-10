# Native Windows entry point for the shared Python installer.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$installer = Join-Path $PSScriptRoot 'install-package-manifests'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    [Console]::Error.WriteLine("Installer payload not found: $installer")
    exit 1
}

foreach ($name in @('python3', 'python', 'py')) {
    $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command -or $command.Source -match '[\\/]WindowsApps[\\/]') {
        continue
    }
    $prefix = @()
    if ($name -eq 'py') { $prefix = @('-3') }
    try {
        & $command.Source @prefix -c 'import sys; sys.exit(sys.version_info < (3, 9))' *> $null
        if ($LASTEXITCODE -ne 0) { continue }
    } catch {
        continue
    }
    & $command.Source @prefix $installer @args
    exit $LASTEXITCODE
}

[Console]::Error.WriteLine('Python 3.9+ is required. Install it with Mise and ensure python3, python, or py is on PATH.')
exit 1
