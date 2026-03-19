<#
.SYNOPSIS
Exports all valid (not expired) certificates from the LocalMachine Certificate Store to individual files and creates a CA bundle.
.DESCRIPTION
This script recursively scans the LocalMachine certificate store for all valid (not expired) X509 certificates and exports each certificate to an individual file in PEM format. The output files are named using the certificate's thumbprint and subject, ensuring uniqueness. Additionally, all certificates are concatenated into a single ca-bundle.crt file. The script also logs metadata about each certificate to the console. This script requires administrator privileges.
.PARAMETER OutputDir
Specifies the directory where the exported certificate files will be saved. Defaults to a temporary directory.
.PARAMETER CertExtension
CertExtension
Specifies the file extension for the exported certificate files. Defaults to "pem". Use "crt" for usage on Windows systems.
.PARAMETER InsertLineBreaks
Specifies whether to insert line breaks in the Base64 encoded certificate data. Defaults to $true.
.EXAMPLE
.\Get-AllCertificates.ps1 -OutputDir "C:\Certificates" -CertExtension "crt" -InsertLineBreaks $false
Exports all valid certificates from LocalMachine store to the specified directory with .crt extension without line breaks in the Base64 data.
.NOTES
Requires administrator privileges to access the LocalMachine certificate store.
#>
#Requires -RunAsAdministrator
param(
  [string]$OutputDir="$env:TEMP\AllCertificates",
  [string]$CertExtension="pem",# use "crt" for usage on windows systems
  [bool]$InsertLineBreaks=$true
)

If (Test-Path $OutputDir) {
  Remove-Item $OutputDir -Recurse -Force
}
New-Item $OutputDir -ItemType directory

# Initialize CA bundle file
$caBundlePath = "{0}\ca-bundle.crt" -f $OutputDir
if (Test-Path $caBundlePath) {
  Remove-Item $caBundlePath -Force
}

# Get all certificates from LocalMachine store
$certCount = 0
$certs = Get-ChildItem -Recurse -Path Cert:\LocalMachine | Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509Certificate2] }
foreach ($cert in $certs) {
  $certCount++

  # append "Thumbprint" of Cert for unique file names
  $name = "$($cert.Thumbprint)--$($cert.Subject)" -replace '[\W]', '_'
  $max = $name.Length

  # reduce length to prevent filesystem errors
  if ($max -gt 150) {
    $max = 150 
  }
  $name = $name.Substring(0, $max)

  # build path
  $path = "{0}\{1}.{2}" -f $OutputDir,$name,$CertExtension
  if (Test-Path $path) {
    Write-Log -Message "Skipping existing cert file: $path" -Level Debug
    continue 
  } # next if cert was already written

  $oPem=New-Object System.Text.StringBuilder
  [void]$oPem.AppendLine("-----BEGIN CERTIFICATE-----")
  $base64Options = if ($InsertLineBreaks) {
    1 
  } else {
    0 
  }
  [void]$oPem.AppendLine([System.Convert]::ToBase64String($cert.RawData, $base64Options))
  [void]$oPem.AppendLine("-----END CERTIFICATE-----")

  $pemContent = $oPem.toString()
  $pemContent | Add-Content $path
  
  # Append to CA bundle with a comment header
  Add-Content -Path $caBundlePath -Value "# Subject: $($cert.Subject)"
  Add-Content -Path $caBundlePath -Value "# Issuer: $($cert.Issuer)"
  Add-Content -Path $caBundlePath -Value "# Thumbprint: $($cert.Thumbprint)"
  Add-Content -Path $caBundlePath -Value $pemContent
}

Write-Log -Message "`nProcessed $certCount certificates" -Level Info
Write-Log -Message "CA bundle created at: $caBundlePath" -Level Success
