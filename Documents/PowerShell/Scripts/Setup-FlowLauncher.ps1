#Requires -RunAsAdministrator

try {
  $taskName = "FlowLauncher"
  $cmd = "$env:SCOOP\apps\flow-launcher\current\Flow.Launcher.exe"
  
  if (-not (Test-Path $cmd)) {
    throw "Flow Launcher command not found"
  }

  # Check if task needs to be created or updated
  if (Test-ScheduledTaskNeedsUpdate -TaskName $taskName -ExecutablePath $cmd) {
    Write-Log -Message "Creating/updating scheduled task: $taskName" -Level Info
    
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
      if ($existingTask.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
      }
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    
    Stop-Process -Name Flow.Launcher -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    
    $action = New-ScheduledTaskAction -Execute $cmd
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
      
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Flow Launcher Command Launcher" | Out-Null
      
    Write-Log -Message "Created scheduled task: $taskName" -Level Success
  } else {
    Write-Log -Message "Scheduled task $taskName is up to date" -Level Info
  }
} catch {
  Write-Log -Message "Failed to setup Flow Launcher: $_" -Level Error
  throw
}
