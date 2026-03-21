function Test-Command {
  param (
    [Parameter(Mandatory = $true)]
    [string]$Name
  )
  return Get-Command $Name -ErrorAction SilentlyContinue
}

# Run screen reader fix if available
if (Test-Command -Name "Fix-ScreenReader") {
  Fix-ScreenReader
}

# Import Modules and External Profiles
if (-not (Get-Module -ListAvailable -Name PSReadLine)) {
  Install-Module -Name PSReadLine -Scope CurrentUser -Force -AllowClobber -ErrorAction SilentlyContinue
}
Import-Module PSReadLine -ErrorAction SilentlyContinue

if (-not (Get-Module -ListAvailable -Name Terminal-Icons)) {
  Install-Module -Name Terminal-Icons -Scope CurrentUser -Force -AllowClobber -ErrorAction SilentlyContinue
}
Import-Module Terminal-Icons -ErrorAction SilentlyContinue

if (-not (Get-Module -ListAvailable -Name PowerShell-Yaml)) {
  Install-Module -Name PowerShell-Yaml -Scope CurrentUser -Force -AllowClobber -ErrorAction SilentlyContinue
}
Import-Module PowerShell-Yaml -ErrorAction SilentlyContinue

Import-Module gsudoModule -ErrorAction SilentlyContinue

if (-not (Test-Command -Name Refresh-EnvironmentVariables)) {
  Install-Script -Name Refresh-EnvironmentVariables -Force -Scope CurrentUser -ErrorAction SilentlyContinue
}

function Write-Log {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [ValidateSet("Info", "Debug", "Success", "Warning", "Error")]
    [string]$Level = "Info"
  )
  
  if ($Level -eq "Debug" -and -not $env:PS_DEBUG) {
    return
  }

  $color = switch ($Level) {
    "Info" {
      "Cyan" 
    }
    "Success" {
      "Green" 
    }
    "Warning" {
      "Yellow" 
    }
    "Error" {
      "Red" 
    }
    "Debug" {
      "Blue" 
    }
  }
  
  $prefix = switch ($Level) {
    "Info" {
      "[INFO]" 
    }
    "Success" {
      "[SUCCESS]" 
    }
    "Warning" {
      "[WARNING]" 
    }
    "Error" {
      "[ERROR]" 
    }
    "Debug" {
      "[DEBUG]" 
    }
  }
  
  Write-Host "$prefix $Message" -ForegroundColor $color
}

function Invoke-WithErrorHandling {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$ScriptBlock,
    [Parameter(Mandatory = $true)]
    [string]$ErrorMessage,
    [switch]$ContinueOnError = $false
  )
  
  try {
    & $ScriptBlock
    return $true
  } catch {
    Write-Log -Message "$ErrorMessage : $_" -Level Error
    if (-not $ContinueOnError) {
      throw
    }
    return $false
  }
}

function Test-ScheduledTaskNeedsUpdate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TaskName,
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath,
    [string]$Arguments = ""
  )
  
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    return $true
  }
  
  $action = $task.Actions | Select-Object -First 1
  if (-not $action) {
    return $true
  }
  
  # Normalize paths for comparison
  $currentExe = $action.Execute.TrimEnd('\', '/').Replace('/', '\')
  $newExe = $ExecutablePath.TrimEnd('\', '/').Replace('/', '\')
  
  if ($currentExe -ne $newExe) {
    return $true
  }
  
  if ($action.Arguments -ne $Arguments) {
    return $true
  }
  
  return $false
}

function Update-PowerShell {
  Invoke-WithErrorHandling -ErrorMessage "Failed to update Powershell" -ScriptBlock {
    Write-Log -Message "Checking for PowerShell updates..." -Level Info
    $updateNeeded = $false
    $currentVersion = $PSVersionTable.PSVersion.ToString()
    $gitHubApiUrl = "https://api.github.com/repos/PowerShell/PowerShell/releases/latest"
    
    try {
      $latestReleaseInfo = Invoke-RestMethod -Uri $gitHubApiUrl -TimeoutSec 10 -ErrorAction Stop
      $latestVersion = $latestReleaseInfo.tag_name.Trim('v')
      if ($currentVersion -lt $latestVersion) {
        $updateNeeded = $true
      }
    } catch {
      Write-Log -Message "Failed to check for PowerShell updates (network timeout or API error)" -Level Warning
      return
    }

    if ($updateNeeded) {
      Write-Log -Message "Updating PowerShell..." -Level Info
      # Check if PowerShell is installed via winget
      $wingetList = winget list --id Microsoft.PowerShell --exact 2>&1
      $isInstalled = $wingetList -match "Microsoft\.PowerShell"
      
      if ($isInstalled) {
        Start-Process powershell.exe -ArgumentList "-NoProfile -Command winget upgrade Microsoft.PowerShell --accept-source-agreements --accept-package-agreements" -Wait -NoNewWindow
      } else {
        Start-Process powershell.exe -ArgumentList "-NoProfile -Command winget install Microsoft.PowerShell --accept-source-agreements --accept-package-agreements" -Wait -NoNewWindow
      }
      Write-Log -Message "PowerShell has been updated. Please restart your shell to reflect changes" -Level Success
    } else {
      Write-Log -Message "Your PowerShell is up to date." -Level Info
    }
  }
}

# starship init
if (Test-Command -Name "starship") {
  Invoke-Expression (& { (starship init powershell --print-full-init | Out-String) })
}

# zoxide
if (Test-Command -Name "zoxide") {
  Invoke-Expression (& { (zoxide init powershell | Out-String) })
  
  function zd {
    if ($args.Count -eq 0) {
      Set-Location $HOME
    } elseif (Test-Path -Path $args[0] -PathType Container) {
      Set-Location $args[0]
    } else {
      z @args
      if ($LASTEXITCODE -eq 0 -or $?) {
        Write-Host -NoNewline "`u{F17A9} "
        Write-Host (Get-Location).Path
      } else {
        Write-Error "Error: Directory not found"
      }
    }
  }
  
  Set-Alias -Name cd -Value zd -Option AllScope
}

# lsd
if (Test-Command -Name "lsd") {
  Set-Alias -Name ls -Value lsd -Option AllScope
  function ll {
    lsd -l $args
  }
  function lla {
    lsd -lA $args
  }
}

# bat
if (Test-Command -Name "bat") {
  function Get-FileList {
    bat --paging=never $args
  }
  Set-Alias -Name cat -Value Get-FileList -Option AllScope
}

# fd-find
if (Test-Command -Name "fd") {
  Set-Alias -Name find -Value fd -Option AllScope
}

# ripgrep
if (Test-Command -Name "rg") {
  Set-Alias -Name grep -Value rg -Option AllScope
}

if (Test-Command -Name "yazi") {
  function y {
    $tmp = (New-TemporaryFile).FullName
    yazi $args --cwd-file="$tmp"
    $cwd = Get-Content -Path $tmp -Encoding UTF8
    if (-not [String]::IsNullOrEmpty($cwd) -and $cwd -ne $PWD.Path) {
      Set-Location -LiteralPath (Resolve-Path -LiteralPath $cwd).Path
    }
    Remove-Item -Path $tmp
  }
}

## Utility functions

# File System Utilities
function touch {
  <#
  .SYNOPSIS
    Creates an empty file or updates the timestamp of an existing file.
  
  .DESCRIPTION
    Similar to Unix touch command. Creates a new empty file if it doesn't exist,
    or updates the last write time if it does exist.
  
  .PARAMETER file
    Path to the file to create or touch.
  
  .EXAMPLE
    touch myfile.txt
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$file
  )
  "" | Out-File -FilePath $file -Encoding ASCII
}

function New-Link {
  <#
  .SYNOPSIS
    Creates a hard link or symbolic link.
  
  .DESCRIPTION
    Creates a file system link (hard link or symbolic link) from a target to a link location.
  
  .PARAMETER Target
    The target file or directory path.
  
  .PARAMETER Link
    The link path to create.
  
  .PARAMETER Force
    If specified, removes existing link before creating new one.
  
  .PARAMETER LinkType
    Type of link to create: HardLink or SymbolicLink.
  
  .EXAMPLE
    New-Link -Target "C:\source.txt" -Link "C:\link.txt"
  
  .EXAMPLE
    New-Link -Target "C:\source" -Link "C:\link" -LinkType SymbolicLink -Force
  #>
  param(
    [string]$Target,
    [string]$Link,
    [switch]$Force = $false,
    [ValidateSet("HardLink", "SymbolicLink")]
    [string]$LinkType = "HardLink"
  )
  if ($Force -and (Test-Path $Link)) {
    Remove-Item $Link -Recurse -Force
  }
  New-Item -Path $Link -ItemType $LinkType -Value $Target
}
function New-Symlink {
  <#
  .SYNOPSIS
    Creates a symbolic link.
  
  .DESCRIPTION
    Wrapper around New-Link specifically for creating symbolic links.
  
  .PARAMETER Target
    The target file or directory path.
  
  .PARAMETER Link
    The symbolic link path to create.
  
  .PARAMETER Force
    If specified, removes existing link before creating new one.
  
  .EXAMPLE
    New-Symlink -Target "C:\source" -Link "C:\link"
  #>
  param(
    [string]$Target,
    [string]$Link,
    [switch]$Force = $false
  )
  New-Link -Target $Target -Link $Link -LinkType SymbolicLink -Force:$Force
}
function ln {
  <#
  .SYNOPSIS
    Unix-style ln command for creating links.
  
  .DESCRIPTION
    Creates hard links or symbolic links using Unix-style syntax.
  
  .PARAMETER target
    The target file or directory path.
  
  .PARAMETER link
    The link path to create.
  
  .PARAMETER f
    Force - removes existing link before creating new one.
  
  .PARAMETER s
    Symbolic - creates a symbolic link instead of a hard link.
  
  .EXAMPLE
    ln source.txt link.txt
  
  .EXAMPLE
    ln -s source link -f
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$target,
    [Parameter(Mandatory=$true)]
    [string]$link,
    [switch]$f,
    [switch]$s=$false
  )
  if ($s) {
    New-Link -Target $target -Link $link -LinkType SymbolicLink -Force:$f
  } else {
    New-Link -Target $target -Link $link -LinkType HardLink -Force:$f
  }
}

function rm {
  <#
  .SYNOPSIS
    Unix-style rm command for removing files and directories.
  
  .DESCRIPTION
    Removes files and directories with Unix-style flags.
  
  .PARAMETER Path
    Path(s) to remove.
  
  .PARAMETER r
    Recursive - removes directories and their contents.
  
  .PARAMETER f
    Force - suppresses confirmation prompts and errors.
  
  .PARAMETER rf
    Combined recursive and force flags.
  
  .PARAMETER fr
    Combined force and recursive flags (same as -rf).
  
  .EXAMPLE
    rm file.txt
  
  .EXAMPLE
    rm -rf directory/
  #>
  param(
    [Parameter(Mandatory=$true, Position=0)]
    [string[]]$Path,
    [switch]$r,
    [switch]$f,
    [switch]$rf,
    [switch]$fr
  )
  if ($rf -or $fr) {
    $r = $true
    $f = $true
  }
  foreach ($p in $Path) {
    Remove-Item -LiteralPath $p -Recurse:$r -Force:$f
  }
}

function df {
  <#
  .SYNOPSIS
    Displays disk space usage information.
  
  .DESCRIPTION
    Shows information about all mounted volumes, similar to Unix df command.
  
  .EXAMPLE
    df
  #>
  Get-Volume
}

function unzip {
  <#
  .SYNOPSIS
    Extracts a zip archive to the current directory.
  
  .DESCRIPTION
    Extracts the contents of a zip file to the current working directory.
  
  .PARAMETER file
    Name of the zip file to extract.
  
  .EXAMPLE
    unzip archive.zip
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$file
  )
  Write-Output("Extracting", $file, "to", $pwd)
  $fullFile = Get-ChildItem -Path $pwd -Filter $file | ForEach-Object { $_.FullName }
  Expand-Archive -Path $fullFile -DestinationPath $pwd
}

function trash {
  <#
  .SYNOPSIS
    Moves a file or directory to the Recycle Bin.
  
  .DESCRIPTION
    Safely deletes items by moving them to the Recycle Bin instead of permanently removing them.
  
  .PARAMETER path
    Path to the file or directory to move to Recycle Bin.
  
  .EXAMPLE
    trash oldfile.txt
  
  .EXAMPLE
    trash C:\temp\olddir
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$path
  )
  $fullPath = (Resolve-Path -Path $path).Path

  if (Test-Path $fullPath) {
    $item = Get-Item $fullPath

    if ($item.PSIsContainer) {
      # Handle directory
      $parentPath = $item.Parent.FullName
    } else {
      # Handle file
      $parentPath = $item.DirectoryName
    }

    $shell = New-Object -ComObject 'Shell.Application'
    $shellItem = $shell.NameSpace($parentPath).ParseName($item.Name)

    if ($shellItem) {
      $shellItem.InvokeVerb('delete')
      Write-Log -Message "Item '$fullPath' has been moved to the Recycle Bin." -Level Success
    } else {
      Write-Log -Message "Error: Could not find the item '$fullPath' to trash." -Level Error
    }
  } else {
    Write-Log -Message "Error: Item '$fullPath' does not exist." -Level Error
  }
}

function Get-WSLPath {
  <#
  .SYNOPSIS
    Converts a Windows path to a WSL path.
  
  .DESCRIPTION
    Translates Windows-style paths to WSL/Unix-style paths using the specified
    WSL distribution. Distribution can be set via WSL_NIXOS_DISTRO environment variable.
  
  .PARAMETER windowsPath
    The Windows path to convert.
  
  .EXAMPLE
    Get-WSLPath "C:\Users\username\Documents"
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$windowsPath
  )
  $distro = if ($env:WSL_NIXOS_DISTRO) {
    $env:WSL_NIXOS_DISTRO 
  } else {
    "NixOS" 
  }
  $escapedPath = $windowsPath.Replace('\', '\\')
  $wslPath = wsl -d $distro -- wslpath -a "$escapedPath"
  return $wslPath
}

# Network Utilities
function Get-PubIP {
  <#
  .SYNOPSIS
    Gets the public IP address of the current machine.
  
  .DESCRIPTION
    Queries an external service to determine the public IP address.
    Includes timeout and error handling for network issues.
  
  .EXAMPLE
    Get-PubIP
  #>
  try {
    (Invoke-WebRequest -Uri http://ifconfig.me/ip -TimeoutSec 10 -ErrorAction Stop).Content
  } catch {
    Write-Log -Message "Failed to retrieve public IP address (network timeout or service unavailable)" -Level Error
    return $null
  }
}

function flushdns {
  <#
  .SYNOPSIS
    Clears the DNS client cache.
  
  .DESCRIPTION
    Flushes the DNS resolver cache, useful when DNS changes aren't being picked up.
  
  .EXAMPLE
    flushdns
  #>
  Clear-DnsClientCache
  Write-Log -Message "DNS has been flushed" -Level Success
}

# Environment Utilities
function Get-EffectiveEnvironmentValue {
  <#
  .SYNOPSIS
    Gets the effective value of an environment variable by merging Machine, User, and Process scopes.
  
  .DESCRIPTION
    For list-style variables (like PATH), merges values from all three scopes with deduplication.
    For scalar variables, returns the most specific scope (Process > User > Machine).
  
  .PARAMETER Name
    The name of the environment variable.
  
  .PARAMETER ExplicitMergeNames
    Array of variable names that should always be treated as lists and merged.
  
  .PARAMETER Separator
    Separator to detect in list-style variables.
  
  .PARAMETER ForceMerge
    Forces merge mode even if variable doesn't appear to be a list.
  
  .EXAMPLE
    Get-EffectiveEnvironmentValue -Name 'PATH'
  
  .EXAMPLE
    Get-EffectiveEnvironmentValue -Name 'JAVA_HOME'
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)]
    [string]$Name,

    [string[]]
    $ExplicitMergeNames = @('PATH','PATHEXT','PSMODULEPATH'),

    [string]
    $Separator = ';',

    [switch]$ForceMerge
  )

  try {
    $nameUpper = $Name.ToUpperInvariant()

    # Read 3 scopes
    $proc  = [Environment]::GetEnvironmentVariable($Name, 'Process')
    $user  = [Environment]::GetEnvironmentVariable($Name, 'User')
    $mach  = [Environment]::GetEnvironmentVariable($Name, 'Machine')

    # Decide merge vs scalar
    $explicitMergeUpper = $ExplicitMergeNames | ForEach-Object { $_.ToUpperInvariant() }
    
    if ($nameUpper -in $explicitMergeUpper) {
      $shouldMerge = $true
    } elseif ($ForceMerge) {
      $shouldMerge = $true
    } else {
      # Auto-detect separator / multi-value
      $containsList = $false
      foreach ($val in @($proc,$user,$mach) | Where-Object { $_ }) {
        $split = $val -split [Regex]::Escape($Separator) |
          Where-Object { $_.Trim() }

        if ($split.Count -gt 1) {
          $containsList = $true
          break
        }
        if ($containsList) {
          break 
        }
      }
      $shouldMerge = $containsList
    }

    # SCALAR MODE
    if (-not $shouldMerge) {
      if ($proc) {
        return $proc 
      }
      if ($user) {
        return $user 
      }
      return $mach
    }

    # Use ArrayList for better performance (O(1) add vs O(n) for array +=)
    $pieces = [System.Collections.ArrayList]::new()
    # Use HashSet for O(1) duplicate detection
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    $add = {
      param($val)
      if (-not $val) {
        return 
      }
      $val -split [Regex]::Escape($Separator) |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ } |
        ForEach-Object {
          if ($seen.Add($_)) {
            [void]$pieces.Add($_)
          }
        }
    }

    # Machine -> User -> Process order (Process takes precedence in position)
    $add.Invoke($mach)
    $add.Invoke($user)
    $add.Invoke($proc)

    if ($pieces.Count -eq 0) {
      return $null 
    }
    return ($pieces -join $Separator)
  } catch {
    Write-Log -Message "Error getting environment variable '$Name': $_" -Level Error
    throw
  }
}

function Set-EnvironmentVariable {
  <#
  .SYNOPSIS
    Sets an environment variable with optional persistence.
  
  .DESCRIPTION
    Sets an environment variable at the specified scope. When persisting,
    automatically updates the Process scope with the effective merged value.
  
  .PARAMETER Name
    The name of the environment variable.
  
  .PARAMETER Value
    The value to set.
  
  .PARAMETER Persist
    If specified, persists the variable to User or Machine registry.
  
  .PARAMETER Level
    The scope to persist to (User or Machine). Only used when -Persist is specified.
  
  .EXAMPLE
    Set-EnvironmentVariable -Name 'MY_VAR' -Value 'test'
  
  .EXAMPLE
    Set-EnvironmentVariable -Name 'MY_VAR' -Value 'test' -Persist -Level User
  #>
  [CmdletBinding(SupportsShouldProcess)]
  param(
    [Parameter(Mandatory=$true)]
    [string]$Name,
    
    [Parameter(Mandatory=$true)]
    [AllowEmptyString()]
    [string]$Value,
    
    [switch]$Persist,
    
    [ValidateSet("Process", "User", "Machine")]
    [string]$Level = 'User'
  )

  try {
    if (-not $Persist -and $Level -ne 'User') {
      Write-Log -Message "Level parameter ignored when Persist is not specified" -Level Warning
    }

    if ($Persist) {
      # Check for admin rights if setting Machine level
      if ($Level -eq 'Machine') {
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if (-not $isAdmin) {
          throw "Administrator privileges required to set Machine-level environment variables"
        }
      }

      if ($PSCmdlet.ShouldProcess("$Level level", "Set environment variable '$Name' = '$Value'")) {
        # Persist to the chosen scope
        [Environment]::SetEnvironmentVariable($Name, $Value, $Level)
        Write-Log -Message "Set $Level-level '$Name' = '$Value'" -Level Info

        # Recompute the effective value
        $effective = Get-EffectiveEnvironmentValue -Name $Name

        # Update process-level immediately
        Set-Item -Force -Path "env:$Name" -Value $effective
        Write-Log -Message "Updated Process-level '$Name' with effective value" -Level Info
      }
    } else {
      if ($PSCmdlet.ShouldProcess("Process level", "Set environment variable '$Name' = '$Value'")) {
        # Only update the process-level variable
        Set-Item -Force -Path "env:$Name" -Value $Value
        Write-Log -Message "Set Process-level '$Name' = '$Value'" -Level Info
      }
    }
  } catch {
    Write-Log -Message "Error setting environment variable '$Name': $_" -Level Error
    throw
  }
}

function Test-ValueInEnvironmentVariable {
  <#
  .SYNOPSIS
    Tests if a value exists in an environment variable.
  
  .DESCRIPTION
    Checks if a specific value exists in a list-style environment variable.
    Performs case-insensitive, normalized path comparison.
  
  .PARAMETER Value
    The value to search for.
  
  .PARAMETER Name
    The name of the environment variable.
  
  .PARAMETER Separator
    The separator used in the environment variable.
  
  .EXAMPLE
    Test-ValueInEnvironmentVariable -Value 'C:\Tools' -Name 'PATH'
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)]
    [string]$Value,
    
    [Parameter(Mandatory=$true)]
    [string]$Name,
    
    [string]$Separator = ";"
  )

  try {
    $effective = Get-EffectiveEnvironmentValue -Name $Name -Separator $Separator
    if (-not $effective) {
      return $false 
    }

    # Normalize the search value
    $normalized = $Value.TrimEnd('\','/').Replace('/', '\')

    # Create HashSet for O(1) lookup
    $valueSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    
    $effective -split [Regex]::Escape($Separator) |
      ForEach-Object {
        $_.Trim().TrimEnd('\','/').Replace('/', '\')
      } |
      Where-Object { $_ } |
      ForEach-Object {
        [void]$valueSet.Add($_)
      }

    return $valueSet.Contains($normalized)
  } catch {
    Write-Log -Message "Error testing value in environment variable '$Name': $_" -Level Error
    throw
  }
}

function Add-ToEnvironmentVariable {
  <#
  .SYNOPSIS
    Adds a value to a list-style environment variable.
  
  .DESCRIPTION
    Adds a value to an environment variable like PATH, avoiding duplicates.
    Automatically updates both the persisted scope and Process scope.
  
  .PARAMETER Value
    The value to add.
  
  .PARAMETER Name
    The name of the environment variable.
  
  .PARAMETER Prepend
    If specified, adds the value to the beginning instead of the end.
  
  .PARAMETER Level
    The scope to persist to (User or Machine).
  
  .PARAMETER Separator
    The separator to use between values.
  
  .EXAMPLE
    Add-ToEnvironmentVariable -Value 'C:\Tools' -Name 'PATH' -Level User
  
  .EXAMPLE
    Add-ToEnvironmentVariable -Value 'C:\Priority' -Name 'PATH' -Prepend -Level User
  #>
  [CmdletBinding(SupportsShouldProcess)]
  param(
    [Parameter(Mandatory=$true)]
    [string]$Value,
    
    [Parameter(Mandatory=$true)]
    [string]$Name,
    
    [switch]$Prepend,
    
    [ValidateSet("User", "Machine")]
    [string]$Level = 'User',
    
    [string]$Separator = ";"
  )

  try {
    # Check for admin rights if setting Machine level
    if ($Level -eq 'Machine') {
      $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
      if (-not $isAdmin) {
        throw "Administrator privileges required to set Machine-level environment variables"
      }
    }

    # Check if value already exists
    if (Test-ValueInEnvironmentVariable -Value $Value -Name $Name -Separator $Separator) {
      Write-Log -Message "'$Value' already exists in $Name" -Level Info
      return $false
    }

    if ($PSCmdlet.ShouldProcess("$Level level '$Name'", "Add value '$Value'")) {
      # Read persisted scope directly
      $currentPersisted = [Environment]::GetEnvironmentVariable($Name, $Level)
      
      # Build new value
      $newPersisted = if ($Prepend) {
        if ($currentPersisted) {
          "$Value$Separator$currentPersisted"
        } else {
          $Value
        }
      } else {
        if ($currentPersisted) {
          "$currentPersisted$Separator$Value"
        } else {
          $Value
        }
      }

      # Persist new value
      [Environment]::SetEnvironmentVariable($Name, $newPersisted, $Level)
      Write-Log -Message "Added '$Value' to $Level-level '$Name'" -Level Info

      # Recompute effective value
      $effective = Get-EffectiveEnvironmentValue -Name $Name

      # Update process env var immediately
      Set-Item -Force -Path "env:$Name" -Value $effective
      Write-Log -Message "Updated Process-level '$Name' with effective value" -Level Info

      return $true
    }
    
    return $false
  } catch {
    Write-Log -Message "Error adding to environment variable '$Name': $_" -Level Error
    throw
  }
}

function export {
  <#
  .SYNOPSIS
    Sets an environment variable with optional persistence.
  
  .DESCRIPTION
    Unix-style environment variable export. Sets a variable in the current session
    and optionally persists it to the user registry.
  
  .PARAMETER name
    Name of the environment variable.
  
  .PARAMETER value
    Value to set.
  
  .PARAMETER p
    Persist - saves the variable to user registry for future sessions.
  
  .EXAMPLE
    export MY_VAR "some value"
  
  .EXAMPLE
    export PATH "C:\Tools" -p
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$name,
    [Parameter(Mandatory=$true)]
    [string]$value,
    [switch]$p=$false
  )
  Set-EnvironmentVariable -Name $name -Value $value -Persist:$p
}

function which {
  <#
  .SYNOPSIS
    Locates a command and displays its path.
  
  .DESCRIPTION
    Similar to Unix which command. Shows the full path of an executable command.
  
  .PARAMETER name
    Name of the command to locate.
  
  .EXAMPLE
    which python
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$name
  )
  Get-Command $name | Select-Object -ExpandProperty Definition
}

function pkill {
  <#
  .SYNOPSIS
    Terminates processes by name.
  
  .DESCRIPTION
    Similar to Unix pkill command. Stops all processes matching the given name.
  
  .PARAMETER name
    Name of the process(es) to terminate.
  
  .EXAMPLE
    pkill notepad
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$name
  )
  Get-Process $name -ErrorAction SilentlyContinue | Stop-Process
}

function pgrep {
  <#
  .SYNOPSIS
    Lists processes by name.
  
  .DESCRIPTION
    Similar to Unix pgrep command. Displays all processes matching the given name.
  
  .PARAMETER name
    Name of the process(es) to find.
  
  .EXAMPLE
    pgrep chrome
  #>
  param(
    [Parameter(Mandatory=$true)]
    [string]$name
  )
  Get-Process $name
}

function head {
  param($Path, $n = 10)
  Get-Content $Path -Head $n
}

function tail {
  param($Path, $n = 10, [switch]$f = $false)
  Get-Content $Path -Tail $n -Wait:$f
}

function sysinfo {
  <#
  .SYNOPSIS
    Displays detailed system information.
  
  .DESCRIPTION
    Shows comprehensive information about the computer system including hardware,
    operating system, and configuration details.
  
  .EXAMPLE
    sysinfo
  #>
  Get-ComputerInfo
}

function Clear-Cache {
  <#
  .SYNOPSIS
    Clears various Windows cache directories.
  
  .DESCRIPTION
    Removes temporary files from Windows Prefetch, Windows Temp, User Temp,
    and Internet Explorer cache locations to free up disk space.
  
  .EXAMPLE
    Clear-Cache
  #>
  Write-Log -Message "Clearing cache..." -Level Info

  # Clear Windows Prefetch
  Write-Log -Message "Clearing Windows Prefetch..." -Level Info
  Remove-Item -Path "$env:SystemRoot\Prefetch\*" -Force -ErrorAction SilentlyContinue

  # Clear Windows Temp
  Write-Log -Message "Clearing Windows Temp..." -Level Info
  Remove-Item -Path "$env:SystemRoot\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue

  # Clear User Temp
  Write-Log -Message "Clearing User Temp..." -Level Info
  Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue

  # Clear Internet Explorer Cache
  Write-Log -Message "Clearing Internet Explorer Cache..." -Level Info
  Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Windows\INetCache\*" -Recurse -Force -ErrorAction SilentlyContinue

  Write-Log -Message "Cache clearing completed." -Level Success
}

# Quick Access to Editing the Profile
function Edit-Profile {
  nvim $PROFILE.CurrentUserAllHosts
}
Set-Alias -Name ep -Value Edit-Profile

function Update-Scoop {
  <#
  .SYNOPSIS
    Updates and cleans up all Scoop packages.
  
  .DESCRIPTION
    Updates all installed Scoop packages to their latest versions and removes
    old versions to free up disk space.
  
  .EXAMPLE
    Update-Scoop
  #>
  scoop update -a
  scoop cleanup -a
}

function Update-AllPackages {
  <#
  .SYNOPSIS
    Updates all packages from winget and Scoop.
  
  .DESCRIPTION
    Performs a full system update by upgrading all packages from both
    winget and Scoop package managers.
  
  .EXAMPLE
    Update-AllPackages
  #>
  winget upgrade --all
  Update-Scoop
}

function winutil {
  <#
  .SYNOPSIS
    Opens Chris Titus Tech's Windows Utility tool.
  
  .DESCRIPTION
    Downloads and executes the Windows Utility script from christitus.com.
    This tool provides various Windows optimization and customization options.
  
  .EXAMPLE
    winutil
  #>
  Invoke-RestMethod https://christitus.com/win | Invoke-Expression
}

function nix {
  <#
  .SYNOPSIS
    Opens NixOS WSL distribution.
  
  .DESCRIPTION
    Launches the NixOS WSL distribution and changes to the home directory.
    The distribution name can be customized via WSL_NIXOS_DISTRO environment variable.
  
  .EXAMPLE
    nix
  #>
  $distro = if ($env:WSL_NIXOS_DISTRO) {
    $env:WSL_NIXOS_DISTRO 
  } else {
    "NixOS" 
  }
  wsl -d $distro --cd ~
}

# Enhanced PowerShell Experience
# Enhanced PSReadLine Configuration
$PSReadLineOptions = @{
  BellStyle = 'None'
  EditMode = 'Windows'
  HistoryNoDuplicates = $true
  HistorySearchCursorMovesToEnd = $true
  MaximumHistoryCount = 10000
  PredictionSource = 'History'
  PredictionViewStyle = 'InlineView'
}
Set-PSReadLineOption @PSReadLineOptions

# Custom key handlers
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
Set-PSReadLineKeyHandler -Chord 'Ctrl+d' -Function DeleteChar
Set-PSReadLineKeyHandler -Chord 'Ctrl+w' -Function BackwardDeleteWord
Set-PSReadLineKeyHandler -Chord 'Alt+d' -Function DeleteWord
Set-PSReadLineKeyHandler -Chord 'Ctrl+LeftArrow' -Function BackwardWord
Set-PSReadLineKeyHandler -Chord 'Ctrl+RightArrow' -Function ForwardWord
Set-PSReadLineKeyHandler -Chord 'Ctrl+z' -Function Undo
Set-PSReadLineKeyHandler -Chord 'Ctrl+y' -Function Redo

# Custom functions for PSReadLine
Set-PSReadLineOption -AddToHistoryHandler {
  param($line)
  $sensitive = @('password', 'secret', 'token', 'apikey', 'connectionstring')
  $hasSensitive = $sensitive | Where-Object { $line -match $_ }
  return ($null -eq $hasSensitive)
}

# Dotnet CLI Autocompletion
$scriptblock = {
  param($wordToComplete, $commandAst, $cursorPosition)
  dotnet complete --position $cursorPosition $commandAst.ToString() |
    ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
Register-ArgumentCompleter -Native -CommandName dotnet -ScriptBlock $scriptblock
