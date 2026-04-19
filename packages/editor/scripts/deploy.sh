#!/usr/bin/env bash
# Deploy the editor: write /config.json from Terraform outputs, sync dist/, invalidate CloudFront.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$(cd "$DIR/../infrastructure" && pwd)"

BUCKET=$(terraform -chdir="$INFRA" output -raw editor_bucket)
DIST_ID=$(terraform -chdir="$INFRA" output -raw cloudfront_distribution_id)

# Expects `dist/` to already exist; the root `yarn frontend:deploy` chains build → deploy.
if [ ! -d "$DIR/dist" ]; then
  echo "error: $DIR/dist/ not found — run 'yarn frontend:build' first (or use 'yarn frontend:deploy' from the repo root)." >&2
  exit 1
fi

terraform -chdir="$INFRA" output -raw editor_runtime_config > /tmp/visual-resumes-config.json
aws s3 cp /tmp/visual-resumes-config.json "s3://$BUCKET/config.json" \
  --content-type "application/json" \
  --cache-control "no-cache"

aws s3 sync "$DIR/dist/assets/" "s3://$BUCKET/assets/" \
  --delete \
  --exclude "*.map" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 sync "$DIR/dist/" "s3://$BUCKET/" \
  --exclude "assets/*" \
  --exclude "config.json" \
  --cache-control "no-cache"

aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/index.html" "/config.json" "/"

rm -f /tmp/visual-resumes-config.json
echo "editor deployed to s3://$BUCKET (dist=$DIST_ID)"
