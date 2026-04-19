#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-latest}"

rm -rf "$DIR/bin"
mkdir -p "$DIR/bin"
cp "$DIR/src/index.js" "$DIR/bin/index.js"
cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

# --provenance=false + --sbom=false: AWS Lambda only accepts Docker v2 schema 2 manifests.
# Modern buildx defaults to OCI + attestations, which Lambda rejects with
# "The image manifest, config or layer media type ... is not supported".
docker buildx build --platform linux/arm64 \
  --provenance=false --sbom=false \
  --load \
  -t "visual-resumes-renderer:$TAG" "$DIR"
echo "built image visual-resumes-renderer:$TAG"
