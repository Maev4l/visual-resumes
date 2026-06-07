#!/usr/bin/env bash
# Bundle src → bin via esbuild (sharp + @aws-sdk/* externalized),
# then build the Docker image.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_ROOT="$(cd "$DIR/.." && pwd)"
TAG="${1:-latest}"

rm -rf "$DIR/bin"
mkdir -p "$DIR/bin"

"$FUNCTIONS_ROOT/node_modules/.bin/esbuild" \
  "$DIR/src/index.js" \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=esm \
  --outfile="$DIR/bin/index.js" \
  --banner:js='import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);' \
  --external:sharp \
  --external:@aws-sdk/* \
  --legal-comments=none

cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

# --provenance=false + --sbom=false: AWS Lambda only accepts Docker v2 schema 2 manifests.
# Modern buildx defaults to OCI + attestations, which Lambda rejects.
docker buildx build --platform linux/arm64 --provenance=false --sbom=false --load \
  -t "visual-resumes-image-resizer:$TAG" "$DIR"
echo "built image visual-resumes-image-resizer:$TAG"
