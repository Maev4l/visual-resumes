#!/usr/bin/env bash
# Ships packages/editor/index.html to the editor bucket + invalidates CF.
# Plan 6 replaces this with a real Vite build + deploy.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$(cd "$DIR/../infrastructure" && pwd)"

BUCKET=$(terraform -chdir="$INFRA" output -raw editor_bucket)
DIST_ID=$(terraform -chdir="$INFRA" output -raw cloudfront_distribution_id)

aws s3 cp "$DIR/index.html" "s3://$BUCKET/index.html" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html"
