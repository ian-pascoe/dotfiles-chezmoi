#Requires -RunAsAdministrator

try {
  $taskName = "GlazeWM"
  $glazewmExe = "$env:SCOOP\apps\glazewm\current\cli\glazewm.exe"
  if (-not (Test-Path $glazewmExe)) {
    throw "GlazeWM command not found"
  }

  $cliCmd = "$glazewmExe start"
  $executor = "Powershell.exe"
  $arguments = "-NoProfile -WindowStyle Hidden -Command `"$cliCmd`""
  
  # Check if task needs to be created or updated
  if (Test-ScheduledTaskNeedsUpdate -TaskName $taskName -ExecutablePath $executor -Arguments $arguments) {
    Write-Log -Message "Creating/updating scheduled task: $taskName" -Level Info
    
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
      if ($existingTask.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
      }
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    
    Stop-Process -Name glazewm -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    $action = New-ScheduledTaskAction -Execute $executor -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
      
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Glaze Window Manager Startup" | Out-Null
      
    Write-Log -Message "Created scheduled task: $taskName" -Level Success
  } else {
    Write-Log -Message "Scheduled task $taskName is up to date" -Level Info
  }
} catch {
  Write-Log -Message "Failed to setup GlazeWM: $_" -Level Error
  throw
}
