#!/usr/bin/env bash
# Build a Multisphere .mcpb bundle for Cowork / Claude-Desktop-style installs.
#
# Output: .build/dist/multisphere-<version>.mcpb
#
# Requires Node 20+ and npm. Pulls @anthropic-ai/mcpb via npx at pack time.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAGE="$ROOT/.build/mcpb-stage"
DIST="$ROOT/.build/dist"

VERSION="$(node -p "require('./mcp-server/package.json').version")"
OUT="$DIST/multisphere-${VERSION}.mcpb"

echo "==> Building mcp-server"
( cd mcp-server && npm install && npm run build )

echo "==> Staging at $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE/mcp-server"
cp mcpb/manifest.json "$STAGE/manifest.json"
cp -R mcp-server/dist "$STAGE/mcp-server/dist"
cp mcp-server/package.json "$STAGE/mcp-server/package.json"
cp mcp-server/package-lock.json "$STAGE/mcp-server/package-lock.json"

echo "==> Installing production deps in stage"
( cd "$STAGE/mcp-server" && npm ci --omit=dev --ignore-scripts )

echo "==> Packing"
mkdir -p "$DIST"
npx -y @anthropic-ai/mcpb pack "$STAGE" "$OUT"

echo ""
echo "✅ Built: $OUT"
echo "   Install in Cowork / Claude Desktop: Settings → Extensions → Install Extension → select this .mcpb"
