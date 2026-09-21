$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$ScriptPath = Join-Path $PSScriptRoot 'bootstrap.py'
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $ScriptPath @args
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python $ScriptPath @args
} else {
    throw 'Python 3.10+ is required.'
}
exit $LASTEXITCODE
