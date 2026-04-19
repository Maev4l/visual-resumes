#!/usr/bin/env bash
# One-shot: build all three functions and push the two container images.
# Usage: bootstrap.sh <account-id> <region> [tag]
set -euo pipefail

ACCOUNT_ID="${1:?usage: bootstrap.sh <account-id> <region> [tag]}"
REGION="${2:?usage: bootstrap.sh <account-id> <region> [tag]}"
TAG="${3:-latest}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"$ROOT/api/scripts/build.sh"

"$ROOT/renderer/scripts/build.sh"       "$TAG"
"$ROOT/renderer/scripts/push.sh"        "$ACCOUNT_ID" "$REGION" "$TAG"

"$ROOT/image-resizer/scripts/build.sh"  "$TAG"
"$ROOT/image-resizer/scripts/push.sh"   "$ACCOUNT_ID" "$REGION" "$TAG"

echo "bootstrap complete with tag $TAG"
