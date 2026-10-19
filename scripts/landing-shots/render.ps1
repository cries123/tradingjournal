# Re-renders the landing page's screenshots of the app (public/landing/*.webp) from the real components
# on the landing page's sample journal. See "The landing page" in CLAUDE.md.
#
# Run from the root of a clean checkout or worktree of the commit whose app you want to show:
#   powershell -File scripts/landing-shots/render.ps1
# It builds the CSS, drops the harness into src/components only while vitest runs it, then crops and
# encodes each shot. Review the WebPs before copying them into public/landing.
param([string]$Out = "$PWD\dist\landing-shots")
$ErrorActionPreference = 'Continue'
# node_modules lives in the main checkout; worktrees under .claude/worktrees resolve it by walking up.
$root = 'C:\Users\disco\Desktop\blackbook CRM\tradingjournal'
$cssDir = 'C:\Users\disco\bc-shots'

$env:SKIP_PRERENDER = '1'
node "$root\node_modules\vite\bin\vite.js" build --outDir $cssDir --emptyOutDir *> $null
$cssFile = (Get-ChildItem "$cssDir\assets\index-*.css" | Select-Object -First 1).Name

Copy-Item "$PSScriptRoot\harness.test.ts.txt" 'src\components\__landingShots.test.ts' -Force
$env:PREVIEW_CSS_DIR = "$cssDir/assets".Replace('\', '/')
$env:PREVIEW_CSS = $cssFile
$env:PREVIEW_OUT = "$Out\html".Replace('\', '/')
try {
  node "$root\node_modules\vitest\vitest.mjs" run src/components/__landingShots.test.ts
} finally {
  # Never left behind: vitest would run it with the suite, and it writes files.
  Remove-Item 'src\components\__landingShots.test.ts' -Force
}

node "$PSScriptRoot\shots.mjs" "$Out\html" "$Out\webp"
"Review $Out\webp, copy into public\landing, and fix src\components\landing\landingShots.ts if landingShots.test.ts reports a size change."
