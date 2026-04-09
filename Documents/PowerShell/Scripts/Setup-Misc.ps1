# Java
Set-EnvironmentVariable -Name JAVA_TOOL_OPTIONS -Value "-Djava.net.useSystemProxies=true" -Persist
Set-EnvironmentVariable -Name _JAVA_OPTIONS -Value "-Djava.net.useSystemProxies=true" -Persist
& "$env:USERPROFILE\.local\bin\Update-JavaCacerts.ps1"

# Node & Bun
Set-EnvironmentVariable -Name NODE_USE_ENV_PROXY -Value "1" -Persist
Set-EnvironmentVariable -Name NODE_USE_SYSTEM_CA -Value "1" -Persist
