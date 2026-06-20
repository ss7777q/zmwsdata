param(
  [string]$ProjectName = "datazmws",
  [string]$Branch = "main",
  [string]$AccountId = "26f1159c115d0dcd910b4adba0b4188d",
  [string]$StaticDataBase = "/data",
  [string]$DataApiBase = "https://api.zmwsrank.top",
  [string]$VisitorApiBase = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root "frontend"

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -le 0) {
      continue
    }

    $name = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if ($name) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

Import-DotEnv (Join-Path $Root ".env")

if (-not $env:CLOUDFLARE_API_TOKEN -and $env:CLOUDFLARE_PAGES_API_TOKEN) {
  $env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_PAGES_API_TOKEN
}
if ($env:CLOUDFLARE_PROJECT_NAME) {
  $ProjectName = $env:CLOUDFLARE_PROJECT_NAME
}
if ($env:CLOUDFLARE_ACCOUNT_ID) {
  $AccountId = $env:CLOUDFLARE_ACCOUNT_ID
}

if (-not $env:CLOUDFLARE_API_TOKEN) {
  throw "Missing CLOUDFLARE_API_TOKEN. Set it in this PowerShell session before deploying."
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CommandArguments
  )

  $process = Start-Process -FilePath $FilePath -ArgumentList $CommandArguments -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Command failed with exit code $($process.ExitCode): $FilePath $($CommandArguments -join ' ')"
  }
}

$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$npxCommand = (Get-Command npx.cmd -ErrorAction Stop).Source

Push-Location $Frontend
try {
  Invoke-NativeCommand $npmCommand run build:cf-data

  $previousStaticDataBase = $env:VITE_STATIC_DATA_BASE
  $previousServerApiBase = $env:VITE_SERVER_API_BASE
  $previousDataApiBase = $env:VITE_DATA_API_BASE
  $previousVisitorApiBase = $env:VITE_VISITOR_API_BASE
  try {
    $env:VITE_STATIC_DATA_BASE = $StaticDataBase
    $env:VITE_SERVER_API_BASE = $DataApiBase
    $env:VITE_DATA_API_BASE = $DataApiBase
    $env:VITE_VISITOR_API_BASE = $VisitorApiBase
    Invoke-NativeCommand $npmCommand run build
  } finally {
    if ($null -eq $previousStaticDataBase) {
      Remove-Item Env:VITE_STATIC_DATA_BASE -ErrorAction SilentlyContinue
    } else {
      $env:VITE_STATIC_DATA_BASE = $previousStaticDataBase
    }

    if ($null -eq $previousServerApiBase) {
      Remove-Item Env:VITE_SERVER_API_BASE -ErrorAction SilentlyContinue
    } else {
      $env:VITE_SERVER_API_BASE = $previousServerApiBase
    }

    if ($null -eq $previousDataApiBase) {
      Remove-Item Env:VITE_DATA_API_BASE -ErrorAction SilentlyContinue
    } else {
      $env:VITE_DATA_API_BASE = $previousDataApiBase
    }

    if ($null -eq $previousVisitorApiBase) {
      Remove-Item Env:VITE_VISITOR_API_BASE -ErrorAction SilentlyContinue
    } else {
      $env:VITE_VISITOR_API_BASE = $previousVisitorApiBase
    }
  }
} finally {
  Pop-Location
}

$previousAccountId = $env:CLOUDFLARE_ACCOUNT_ID
$previousApiToken = $env:CLOUDFLARE_API_TOKEN
try {
  if ($AccountId) {
    $env:CLOUDFLARE_ACCOUNT_ID = $AccountId
  }
  if ($env:CLOUDFLARE_PAGES_API_TOKEN) {
    $env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_PAGES_API_TOKEN
  }
  Push-Location $Frontend
  try {
    Invoke-NativeCommand $npxCommand wrangler pages deploy "dist" --project-name $ProjectName --branch $Branch --commit-dirty=true
  } finally {
    Pop-Location
  }
} finally {
  if ($null -eq $previousAccountId) {
    Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
  } else {
    $env:CLOUDFLARE_ACCOUNT_ID = $previousAccountId
  }
  if ($null -eq $previousApiToken) {
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:CLOUDFLARE_API_TOKEN = $previousApiToken
  }
}
