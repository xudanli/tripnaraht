#!/bin/bash

# Script to apply MCP Capability migration manually
# Usage: ./scripts/apply-mcp-capability-migration.sh

set -e

echo "🚀 Applying MCP Capability migration..."

# Load .env file if it exists
if [ -f .env ]; then
    echo "📝 Loading environment variables from .env file..."
    set -a
    source .env
    set +a
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo "💡 Please set DATABASE_URL or ensure .env file exists with DATABASE_URL"
    exit 1
fi

echo "✅ DATABASE_URL found"

# Apply SQL migration
echo "📝 Executing SQL migration..."
psql "$DATABASE_URL" -f prisma/migrations/manual_add_mcp_capability.sql

echo "✅ Migration applied successfully!"
echo ""
echo "Verifying migration..."
psql "$DATABASE_URL" -c "SELECT service_name, enabled FROM mcp_capabilities ORDER BY service_name;"

echo ""
echo "🎉 Done! MCP Capability management is now ready."
