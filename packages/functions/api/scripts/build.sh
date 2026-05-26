#!/usr/bin/env bash
# Bundle api/src/server.js → api/bin/index.js (ESM, AWS SDK externalized — Lambda Node 22 ships v3).
# Emit run.sh wrapper that AWS Lambda Web Adapter execs to start the Hono HTTP server.
# Zip bin/ → dist/api.zip for Terraform to pick up.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_ROOT="$(cd "$DIR/.." && pwd)"

rm -rf "$DIR/bin" "$DIR/dist"
mkdir -p "$DIR/bin" "$DIR/dist"

# esbuild is installed under packages/functions/node_modules
"$FUNCTIONS_ROOT/node_modules/.bin/esbuild" \
  "$DIR/src/server.js" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile="$DIR/bin/index.js" \
  --banner:js='import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);' \
  --external:@aws-sdk/* \
  --legal-comments=none \
  --minify-whitespace

cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

# run.sh is the Lambda "handler" value when AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap is set;
# the LWA wrapper execs it to start the Hono server on $PORT.
cat > "$DIR/bin/run.sh" <<'EOF'
#!/bin/sh
exec node index.js
EOF
chmod +x "$DIR/bin/run.sh"

( cd "$DIR/bin" && zip -q -r "$DIR/dist/api.zip" . )
SIZE=$(stat -f%z "$DIR/dist/api.zip" 2>/dev/null || stat -c%s "$DIR/dist/api.zip")
echo "built $DIR/dist/api.zip ($SIZE bytes)"
