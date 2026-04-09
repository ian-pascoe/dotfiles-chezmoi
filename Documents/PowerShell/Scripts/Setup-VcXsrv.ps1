#Requires -RunAsAdministrator

try {
  $taskName = "VcXsrv"
  $cmd = "$env:SCOOP\apps\vcxsrv\current\xlaunch.exe"
  if (-not (Test-Path $cmd)) {
    throw "VcXsrv command not found"
  }
  $cmdArgs = "-run `"$env:XDG_CONFIG_HOME\vcxsrv\config.xlaunch`""
  
  # Check if task needs to be created or updated
  if (Test-ScheduledTaskNeedsUpdate -TaskName $taskName -ExecutablePath $cmd -Arguments $cmdArgs) {
    Write-Log -Message "Creating/updating scheduled task: $taskName" -Level Info
    
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
      if ($existingTask.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
      }
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    
    Stop-Process -Name vcxsrv -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    $action = New-ScheduledTaskAction -Execute $cmd -Argument $cmdArgs
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
      
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "VcXsrv X Server Startup" | Out-Null
      
    Write-Log -Message "Created scheduled task: $taskName" -Level Success
  } else {
    Write-Log -Message "Scheduled task $taskName is up to date" -Level Info
  }
} catch {
  Write-Log -Message "Failed to setup VcXsrv: $_" -Level Error
  throw
}
