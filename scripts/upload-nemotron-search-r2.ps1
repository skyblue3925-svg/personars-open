param(
  [Parameter(Mandatory = $true)][string]$IndexDir,
  [string]$Bucket = "persona-nemotron-search"
)

$ErrorActionPreference = "Stop"

$manifest = Join-Path $IndexDir "manifest.json"
$shardDir = Join-Path $IndexDir "shards"

if (-not (Test-Path -LiteralPath $manifest)) {
  throw "Missing manifest: $manifest"
}

if (-not (Test-Path -LiteralPath $shardDir)) {
  throw "Missing shard directory: $shardDir"
}

$shards = Get-ChildItem -LiteralPath $shardDir -File | Sort-Object Name
$total = $shards.Count
$index = 0

Write-Host "Uploading $total shards to R2 bucket '$Bucket'..."

foreach ($file in $shards) {
  $index += 1
  $key = "shards/$($file.Name)"
  if ($index % 100 -eq 0 -or $index -eq 1 -or $index -eq $total) {
    Write-Host "[$index/$total] $key"
  }
  npx wrangler r2 object put "$Bucket/$key" --file "$($file.FullName)" --remote
}

Write-Host "Uploading manifest last..."
npx wrangler r2 object put "$Bucket/manifest.json" --file "$manifest" --remote

Write-Host "R2 upload complete."
