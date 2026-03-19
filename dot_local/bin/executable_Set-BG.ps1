<#
.SYNOPSIS
  Sets the desktop background to the next image in the backgrounds directory or to a specified index.
.DESCRIPTION
  This script cycles through background images stored in the user's .config\theme\backgrounds directory.
  It creates a symbolic link to the current background and updates the desktop wallpaper accordingly.
.PARAMETER BackgroundIndex
  Optional. The index of the background image to set (1-based). If not provided, the script cycles to the next image.
#>
param(
  [Parameter(Mandatory = $false)]
  [int]$BackgroundIndex
)

$BACKGROUNDS_DIR = "$env:CURRENT_THEME_DIR\backgrounds"
$CURRENT_BACKGROUND_LINK = "$env:XDG_CONFIG_HOME\background"

$BACKGROUNDS = Get-ChildItem -Path $BACKGROUNDS_DIR -File -Recurse | Sort-Object FullName
$TOTAL = $BACKGROUNDS.Count

if ($TOTAL -eq 0) {
  Write-Error "No backgrounds found in $BACKGROUNDS_DIR"
  exit 1
}

if ($PSBoundParameters.ContainsKey('BackgroundIndex')) {
  if ($BackgroundIndex -lt 1 -or $BackgroundIndex -gt $TOTAL) {
    Write-Error "Invalid index. Please provide a number between 1 and $TOTAL"
    exit 1
  }
  $NEW_BACKGROUND = $BACKGROUNDS[$BackgroundIndex - 1].FullName
} else {
  if (Test-Path $CURRENT_BACKGROUND_LINK) {
    $CURRENT_BACKGROUND = (Get-Item $CURRENT_BACKGROUND_LINK).Target
  } else {
    $CURRENT_BACKGROUND = $null
  }

  $INDEX = -1
  for ($i = 0; $i -lt $BACKGROUNDS.Count; $i++) {
    if ($BACKGROUNDS[$i].FullName -eq $CURRENT_BACKGROUND) {
      $INDEX = $i
      break
    }
  }

  if ($INDEX -eq -1) {
    $NEW_BACKGROUND = $BACKGROUNDS[0].FullName
  } else {
    $NEXT_INDEX = ($INDEX + 1) % $TOTAL
    $NEW_BACKGROUND = $BACKGROUNDS[$NEXT_INDEX].FullName
  }
}

New-Symlink -Target $NEW_BACKGROUND -Link $CURRENT_BACKGROUND_LINK -Force

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Wallpaper {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@

$SPI_SETDESKWALLPAPER = 0x0014
$SPIF_UPDATEINIFILE = 0x01
$SPIF_SENDCHANGE = 0x02

[Wallpaper]::SystemParametersInfo($SPI_SETDESKWALLPAPER, 0, $NEW_BACKGROUND, $SPIF_UPDATEINIFILE -bor $SPIF_SENDCHANGE) | Out-Null

Write-Log -Message "Set background to: $NEW_BACKGROUND" -Level Success
