# Stages project changes (gitignore excludes secrets), commits, and pushes to origin.
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Message
)

$ErrorActionPreference = "Continue"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$message = $Message.Trim()
if (-not $message) {
  Write-Error "Commit-Message darf nicht leer sein."
  exit 1
}

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Get-GitConfigValue {
  param([string]$Key)
  $value = (& git config --get $Key 2>$null)
  if ($LASTEXITCODE -eq 0 -and $value) {
    return $value.Trim()
  }
  return $null
}

function Resolve-CommitIdentity {
  $name = Get-GitConfigValue "user.name"
  $email = Get-GitConfigValue "user.email"

  if (-not $name) { $name = $env:GIT_AUTHOR_NAME }
  if (-not $email) { $email = $env:GIT_AUTHOR_EMAIL }
  if (-not $name) { $name = $env:GIT_COMMITTER_NAME }
  if (-not $email) { $email = $env:GIT_COMMITTER_EMAIL }

  if (-not $name -or -not $email) {
    $lastName = (& git log -1 --format="%an" 2>$null)
    $lastEmail = (& git log -1 --format="%ae" 2>$null)
    if ($LASTEXITCODE -eq 0) {
      if (-not $name -and $lastName) { $name = $lastName.Trim() }
      if (-not $email -and $lastEmail) { $email = $lastEmail.Trim() }
    }
  }

  if (-not $name -or -not $email) {
    throw @"
Git-Autor fehlt (user.name / user.email).
Setze einmalig z.B.:
  git config --global user.name "Dein Name"
  git config --global user.email "dein@email.de"
"@
  }

  return @{ Name = $name; Email = $email }
}

try {
  Write-Host ">> git status"
  Invoke-Git status --short

  Write-Host ">> git add -A  (Secrets bleiben durch .gitignore draussen)"
  Invoke-Git add -A

  $staged = @(git diff --cached --name-only)
  if ($staged.Count -eq 0) {
    Write-Host "Nichts zu committen (Staging-Area leer)."
    exit 0
  }

  $identity = Resolve-CommitIdentity
  Write-Host ">> git commit (als $($identity.Name) <$($identity.Email)>)"
  Invoke-Git -c "user.name=$($identity.Name)" -c "user.email=$($identity.Email)" commit -m $message

  Write-Host ">> git push origin HEAD"
  Invoke-Git push -u origin HEAD

  Write-Host ""
  Write-Host "Fertig:"
  Invoke-Git status -sb
  Invoke-Git log -1 --oneline
  exit 0
} catch {
  Write-Error $_
  exit 1
}
