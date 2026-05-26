#!/usr/bin/env bash
# esbuild src/ → bin/, copy packages/templates/ → bin/templates/, then docker build.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_ROOT="$(cd "$DIR/.." && pwd)"
REPO_ROOT="$(cd "$FUNCTIONS_ROOT/../.." && pwd)"
TAG="${1:-latest}"

rm -rf "$DIR/bin"
mkdir -p "$DIR/bin"

"$FUNCTIONS_ROOT/node_modules/.bin/esbuild" \
  "$DIR/src/server.js" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile="$DIR/bin/index.js" \
  --banner:js='import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);' \
  --external:puppeteer-core \
  --external:@sparticuz/chromium \
  --external:@aws-sdk/* \
  --legal-comments=none

cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

# Templates: copy static content next to index.js
mkdir -p "$DIR/bin/templates"
cp -R "$REPO_ROOT/packages/templates/." "$DIR/bin/templates/"

# --provenance=false + --sbom=false: AWS Lambda only accepts Docker v2 schema 2 manifests.
# Modern buildx defaults to OCI + attestations, which Lambda rejects.
docker buildx build --platform linux/arm64 --provenance=false --sbom=false --load \
  -t "visual-resumes-renderer:$TAG" "$DIR"
echo "built image visual-resumes-renderer:$TAG"
