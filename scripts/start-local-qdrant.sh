#!/usr/bin/env bash
# 本地开发用 Qdrant（无 Docker 时）。数据目录: .local/qdrant/storage
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QDRANT_DIR="$ROOT/.local/qdrant"
QDRANT_BIN="$QDRANT_DIR/qdrant"
QDRANT_VERSION="v1.7.4"
QDRANT_TAR="qdrant-x86_64-unknown-linux-gnu.tar.gz"

mkdir -p "$QDRANT_DIR/storage"

if [ ! -x "$QDRANT_BIN" ]; then
  echo "📥 下载 Qdrant ${QDRANT_VERSION}..."
  curl -fsSL -o "/tmp/${QDRANT_TAR}" \
    "https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/${QDRANT_TAR}"
  tar -xzf "/tmp/${QDRANT_TAR}" -C "$QDRANT_DIR" qdrant
  chmod +x "$QDRANT_BIN"
fi

if curl -fsS "http://127.0.0.1:6333/collections" >/dev/null 2>&1; then
  echo "✅ Qdrant 已在 http://127.0.0.1:6333 运行"
  exit 0
fi

cat > "$QDRANT_DIR/config.yaml" <<'EOF'
storage:
  storage_path: ./storage

service:
  host: 0.0.0.0
  http_port: 6333
  grpc_port: 6334

log_level: INFO
EOF

echo "🚀 启动 Qdrant → http://127.0.0.1:6333"
cd "$QDRANT_DIR"
exec ./qdrant --config-path config.yaml
