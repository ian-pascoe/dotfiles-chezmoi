<#
.SYNOPSIS
  Sets the current theme by creating symbolic links to the selected theme's resources.
.DESCRIPTION
  This script links the specified theme from the user's .themes directory to the current theme configuration directory.
  It also updates themes for various applications including bat, btop, Flow Launcher, k9s, lsd, and yazi.
.PARAMETER ThemeName
  The name of the theme to set. HTML tags and spaces will be sanitized.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ThemeName
)

$CURRENT_THEME_DIR = "$env:XDG_CONFIG_HOME\theme"
Set-EnvironmentVariable -Name CURRENT_THEME_DIR -Value $CURRENT_THEME_DIR -Persist

$THEME_NAME = $ThemeName -replace '<[^>]+>', '' -replace ' ', '-'
$THEME_NAME = $THEME_NAME.ToLower()
$THEME_PATH = Join-Path $env:THEMES_DIR $THEME_NAME

if (-not (Test-Path $THEME_PATH -PathType Container)) {
  Write-Error "Theme '$THEME_NAME' does not exist in $env:THEMES_DIR"
  exit 1
}

Write-Log -Message "Linking new theme: $THEME_NAME" -Level Info
New-Symlink -Target $THEME_PATH -Link $CURRENT_THEME_DIR -Force

# bat
$BatThemesDir = "$env:BAT_CONFIG_DIR\themes"
if (-not (Test-Path $BatThemesDir)) {
  New-Item -ItemType Directory -Path $BatThemesDir | Out-Null
}
$BatTheme = Join-Path $CURRENT_THEME_DIR "bat.tmTheme"
$BatLink = Join-Path $BatThemesDir "current.tmTheme"
New-Symlink -Target $BatTheme -Link $BatLink -Force
bat cache --build

# btop
$BtopThemesDir = "$env:SCOOP\apps\btop\current\themes"
if (-not (Test-Path $BtopThemesDir)) {
  New-Item -ItemType Directory -Path $BtopThemesDir | Out-Null
}
$BtopTheme = Join-Path $CURRENT_THEME_DIR "btop.theme"
$BtopLink = Join-Path $BtopThemesDir "current.theme"
New-Symlink -Target $BtopTheme -Link $BtopLink -Force

$BtopPersistedThemesDir = "$env:SCOOP\persist\btop\themes"
$BtopPersistedLink = Join-Path $BtopPersistedThemesDir "current.theme"
New-Symlink -Target $BtopTheme -Link $BtopPersistedLink -Force

# flow launcher
$FlowLauncherThemesDir = "$env:SCOOP\persist\flow-launcher\UserData\Themes"
if (-not (Test-Path $FlowLauncherThemesDir)) {
  New-Item -ItemType Directory -Path $FlowLauncherThemesDir | Out-Null
}
$FlowLauncherTheme = Join-Path $CURRENT_THEME_DIR "flow-launcher.xaml"
if (Test-Path $FlowLauncherTheme) {
  $FlowLauncherLink = Join-Path $FlowLauncherThemesDir "current.xaml"
  New-Symlink -Target $FlowLauncherTheme -Link $FlowLauncherLink -Force

  # Restart Flow Launcher scheduled task
  Stop-Process -Name Flow.Launcher -Force -ErrorAction SilentlyContinue
  $taskName = "FlowLauncher"
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $taskName
    Write-Log -Message "Restarted Flow Launcher" -Level Info
  }
}

# glazewm
$glazewmSettingsFile = Join-Path $env:HOME ".glzr\glazewm\config.yaml"
$glazewmSettingsContent = Get-Content $glazewmSettingsFile -Raw | ConvertFrom-Yaml
$glazewmThemeFile = Join-Path $CURRENT_THEME_DIR "glazewm.yaml"
$glazewmThemeContent = Get-Content $glazewmThemeFile -Raw | ConvertFrom-Yaml
$glazewmSettingsContent.window_effects.focused_window.border.color = $glazewmThemeContent.window_effects.focused_window.border.color
$glazewmSettingsContent.window_effects.other_windows.border.color = $glazewmThemeContent.window_effects.other_windows.border.color
$glazewmUpdatedSettingsContent = $glazewmSettingsContent | ConvertTo-Yaml
$glazewmUpdatedSettingsContent -replace "`r`n", "`n" | Set-Content $glazewmSettingsFile -NoNewline
glazewm command wm-reload-config

# k9s
$K9sSkinsDir = "$env:LOCALAPPDATA\k9s\skins"
if (-not (Test-Path $K9sSkinsDir)) {
  New-Item -ItemType Directory -Path $K9sSkinsDir | Out-Null
}
$K9sTheme = Join-Path $CURRENT_THEME_DIR "k9s.yaml"
$K9sLink = Join-Path $K9sSkinsDir "current.yaml"
New-Symlink -Target $K9sTheme -Link $K9sLink -Force

# lsd
$LsdColors = Join-Path $CURRENT_THEME_DIR "lsd.yaml"
$LsdLink = "$env:XDG_CONFIG_HOME\lsd\colors.yaml"
New-Symlink -Target $LsdColors -Link $LsdLink -Force

# windows terminal
$wtSettingsFile = Join-Path $env:SCOOP "persist\windows-terminal\settings\settings.json"
$wtSettingsContent = Get-Content $wtSettingsFile -Raw | ConvertFrom-Json
# change profiles.default.colorScheme to the new theme name
$wtSettingsContent.profiles.defaults.colorScheme = $THEME_NAME
# change theme to the new theme name
$wtSettingsContent.theme = $THEME_NAME
# Write back the updated settings
$wtUpdatedSettingsContent = $wtSettingsContent | ConvertTo-Json -Depth 99
$wtUpdatedSettingsContent -replace "`r`n", "`n" | Set-Content $wtSettingsFile -NoNewline

# yazi
$YaziTheme = Join-Path $CURRENT_THEME_DIR "yazi\theme.toml"
$YaziLink = "$env:YAZI_CONFIG_HOME\theme.toml"
New-Symlink -Target $YaziTheme -Link $YaziLink -Force

$YaziFlavorsDir = Join-Path $CURRENT_THEME_DIR "yazi\flavors"
if (Test-Path $YaziFlavorsDir -PathType Container) {
  $YaziConfigFlavors = "$env:YAZI_CONFIG_HOME\flavors"
  if (-not (Test-Path $YaziConfigFlavors)) {
    New-Item -ItemType Directory -Path $YaziConfigFlavors | Out-Null
  }
  Get-ChildItem -Path $YaziFlavorsDir | ForEach-Object {
    $FlavorLink = Join-Path $YaziConfigFlavors $_.Name
    New-Symlink -Target $_.FullName -Link $FlavorLink -Force
  }
}

# Reload YASB to apply the new theme
yasbc reload

& "$PSScriptRoot\Set-BG.ps1" -BackgroundIndex 1

wsl -d NixOS -- zsh -c "set-theme '$ThemeName'"
