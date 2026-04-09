#Requires -RunAsAdministrator

try {
  $autohotkeyPath = "$env:XDG_CONFIG_HOME\autohotkey"
  $ahkExePath = "$env:SCOOP\apps\autohotkey\current\v2\AutoHotkey64.exe"
  if (-not (Test-Path $ahkExePath)) {
    throw "AutoHotkey command not found"
  }

  $ahkScripts = Get-ChildItem -Path $autohotkeyPath -Filter "*.ahk" -ErrorAction Stop
  foreach ($script in $ahkScripts) {
    $taskName = "AutoHotkey_$($script.BaseName)"
    $scriptPath = $script.FullName
    $arguments = "`"$scriptPath`""
    
    # Check if task needs to be created or updated
    if (Test-ScheduledTaskNeedsUpdate -TaskName $taskName -ExecutablePath $ahkExePath -Arguments $arguments) {
      Write-Log -Message "Creating/updating scheduled task: $taskName" -Level Info
      
      $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      if ($existingTask) {
        if ($existingTask.State -eq 'Running') {
          Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
          Start-Sleep -Milliseconds 500
        }
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
      }
      
      $action = New-ScheduledTaskAction -Execute $ahkExePath -Argument $arguments
      $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
      $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
      
      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "AutoHotkey script: $($script.Name)" | Out-Null
      
      Write-Log -Message "Created scheduled task: $taskName" -Level Success
    } else {
      Write-Log -Message "Scheduled task $taskName is up to date" -Level Info
    }
  }
} catch {
  Write-Log -Message "Failed to setup AutoHotkey: $_" -Level Error
  throw
}
