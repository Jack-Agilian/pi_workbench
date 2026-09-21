#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || { echo 'Python 3.10+ is required.' >&2; exit 1; }
export PYTHONUTF8=1
exec "$PYTHON_BIN" "$SCRIPT_DIR/bootstrap.py" "$@"
