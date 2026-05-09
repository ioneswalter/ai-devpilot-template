#!/usr/bin/env bash
#
# FR-165 J3 — Extract DevPilot subtree into a sibling staging clone.
#
# Reads the path list from docs/repo-split-plan.md, derives
# scripts/devpilot-split-paths.txt (regenerated each run), then runs
# `git filter-repo --paths-from-file` against a fresh clone to produce
# `../ai-devpilot-staging/` with full git history preserved.
#
# Usage:
#   ./scripts/extract-devpilot-repo.sh [target-dir]
#       target-dir defaults to ../ai-devpilot-staging
#
# This script does NOT push the resulting clone anywhere — that's a manual
# operator step gated by the cutover entrance criteria in repo-split-plan.md.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TARGET="${1:-${REPO_ROOT}/../ai-devpilot-staging}"
PLAN="${REPO_ROOT}/docs/repo-split-plan.md"
PATHS_FILE="${REPO_ROOT}/scripts/devpilot-split-paths.txt"

# 1. Pre-flight: git filter-repo installed?
if ! command -v git-filter-repo >/dev/null 2>&1; then
  cat <<'EOF' >&2
ERROR: git-filter-repo is not installed.

Install via Homebrew:
  brew install git-filter-repo

Or via pip:
  pip install git-filter-repo

Then re-run this script.
EOF
  exit 2
fi

# 2. Pre-flight: plan doc exists?
if [[ ! -f "$PLAN" ]]; then
  echo "ERROR: $PLAN not found." >&2
  exit 2
fi

# 3. Pre-flight: target dir doesn't already exist?
if [[ -e "$TARGET" ]]; then
  echo "ERROR: Target directory already exists: $TARGET" >&2
  echo "Remove it first (rm -rf \"$TARGET\") or pass a different target dir." >&2
  exit 2
fi

# 4. Derive the path list from the markdown table.
#    Table format: | `path/to/thing` | rationale |
#    Awk extracts column 1's backticked path.
echo "Deriving path list from $PLAN..."
grep -E '^\| `' "$PLAN" \
  | sed -E 's/^\| `([^`]+)`.*/\1/' \
  > "$PATHS_FILE"
PATH_COUNT=$(wc -l < "$PATHS_FILE" | tr -d ' ')
echo "  → ${PATH_COUNT} paths in ${PATHS_FILE}"

# 5. Fresh clone (file:// preserves history; git-filter-repo refuses to mutate the source repo).
echo "Cloning to $TARGET..."
git clone --no-local "file://${REPO_ROOT}" "$TARGET" >/dev/null 2>&1

# 6. Run filter-repo against the clone.
echo "Running git filter-repo..."
cd "$TARGET"
git filter-repo --paths-from-file "$PATHS_FILE" --force

# 7. Smoke check: at least 5 expected DevPilot files exist in the result.
echo "Smoke checking..."
EXPECTED=(
  "supabase/functions/_shared/api-gateway.ts"
  "supabase/functions/promote-memory-row/index.ts"
  "specs/164-devpilot-memory-isolation/spec.md"
  "scripts/lib/constitution-merger.ts"
  "LICENSE-DEVPILOT"
)
for f in "${EXPECTED[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "  ✗ MISSING: $f" >&2
    exit 1
  fi
  echo "  ✓ $f"
done

# 8. Report.
COMMIT_COUNT=$(git log --oneline | wc -l | tr -d ' ')
echo ""
echo "✓ Extraction complete: $TARGET"
echo "  ${PATH_COUNT} paths in scope, ${COMMIT_COUNT} commits preserved"
echo ""
echo "NEXT STEPS (NOT PERFORMED BY THIS SCRIPT):"
echo "  - Review the resulting tree before any push."
echo "  - cd \"$TARGET\" && git remote add origin <new-repo-url> ; git push -u origin main"
echo "  - Pushing is gated by the cutover entrance criteria in docs/repo-split-plan.md."
