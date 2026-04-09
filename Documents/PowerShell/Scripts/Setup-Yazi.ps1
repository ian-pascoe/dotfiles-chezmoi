#Requires -RunAsAdministrator

try {
  if (-not (Test-Command -Name ya)) {
    throw "Yazi command not found"
  }

  Set-EnvironmentVariable -Name YAZI_CONFIG_HOME -Value "$env:XDG_CONFIG_HOME\yazi" -Persist
  
  Write-Log -Message "Installing Yazi packages..." -Level Info
  ya pkg install
  
  $yaziAppDataPath = "$env:USERPROFILE\AppData\Roaming\yazi"
  if (Test-Path $yaziAppDataPath) {
    Write-Log -Message "Setting ownership for Yazi AppData..." -Level Info
    & icacls $yaziAppDataPath /setowner $env:USERNAME /T /C | Out-Null
  }
  
  Write-Log -Message "Yazi setup completed" -Level Success
} catch {
  Write-Log -Message "Failed to setup Yazi: $_" -Level Error
  throw
}
