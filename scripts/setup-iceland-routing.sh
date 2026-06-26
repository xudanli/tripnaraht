#!/usr/bin/env bash
# Download Iceland OSM PBF and preprocess for OSRM (MLD).
# GraphHopper reads the raw PBF on first start (no separate preprocess step).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${ROOT}/data/routing"
PBF="${DATA_DIR}/iceland-latest.osm.pbf"
OSRM_BASE="${DATA_DIR}/iceland-latest.osrm"
GEOFABRIK_URL="https://download.geofabrik.de/europe/iceland-latest.osm.pbf"
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:latest"

mkdir -p "${DATA_DIR}"

if [[ ! -f "${PBF}" ]]; then
  echo "==> Downloading Iceland OSM PBF from Geofabrik..."
  curl -fL --progress-bar -o "${PBF}.part" "${GEOFABRIK_URL}"
  mv "${PBF}.part" "${PBF}"
  echo "    Saved: ${PBF} ($(du -h "${PBF}" | cut -f1))"
else
  echo "==> PBF already exists: ${PBF} ($(du -h "${PBF}" | cut -f1))"
fi

if [[ ! -f "${OSRM_BASE}.mldgr" && ! -f "${OSRM_BASE}.hsgr" ]]; then
  echo "==> OSRM extract (this may take a few minutes)..."
  docker run --rm -t -v "${DATA_DIR}:/data" "${OSRM_IMAGE}" \
    osrm-extract -p /opt/car.lua /data/iceland-latest.osm.pbf

  echo "==> OSRM partition..."
  docker run --rm -t -v "${DATA_DIR}:/data" "${OSRM_IMAGE}" \
    osrm-partition /data/iceland-latest.osrm

  echo "==> OSRM customize..."
  docker run --rm -t -v "${DATA_DIR}:/data" "${OSRM_IMAGE}" \
    osrm-customize /data/iceland-latest.osrm

  echo "    OSRM graph ready: ${OSRM_BASE}.*"
else
  echo "==> OSRM graph already preprocessed, skipping."
fi

echo ""
echo "Done. Start routing services:"
echo "  OSRM only:        docker compose -f docker/docker-compose.routing.yml up -d osrm"
echo "  OSRM + GraphHopper: docker compose -f docker/docker-compose.routing.yml --profile graphhopper up -d"
echo ""
echo "Tripnara .env (already configured for OSRM):"
echo "  OSRM_BASE_URL=http://localhost:5001"
echo "  GRAPHHOPPER_BASE_URL=http://localhost:8989  # optional fallback"
