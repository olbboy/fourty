#!/usr/bin/env bash
# One-command benchmark driver (Gate B5). Brings up a stack from clean, seeds it
# via API, runs the k6 scenario matrix, snapshots resource use, and regenerates
# BENCHMARK.md from bench/results/*.json.
#
#   bench/run.sh fourty            # seed + benchmark Fourty (default SIZE=10000)
#   SIZE=100000 bench/run.sh fourty
#   bench/run.sh twenty            # same for Twenty (requires the pinned images)
#   bench/run.sh report            # regenerate BENCHMARK.md from existing results
#
# Env: SIZE, VUS, DURATION, SCENARIOS, FOURTY_PORT, TWENTY_PORT, KEEP=1 (don't
# tear down the stack afterwards).
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
COMPOSE="docker compose -f bench/docker-compose.bench.yml"

SIZE="${SIZE:-10000}"
VUS="${VUS:-20}"
DURATION="${DURATION:-20s}"
SCENARIOS="${SCENARIOS:-list filter sort search create update}"
FOURTY_PORT="${FOURTY_PORT:-3200}"
TWENTY_PORT="${TWENTY_PORT:-3201}"
RESULTS="bench/results"
mkdir -p "$RESULTS"

log() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

wait_http() { # url, timeout_s
  local url="$1" deadline=$(( $(date +%s) + ${2:-120} ))
  until curl -fsS "$url" >/dev/null 2>&1; do
    [ "$(date +%s)" -lt "$deadline" ] || { echo "timeout waiting for $url"; return 1; }
    sleep 2
  done
}

capture_stats() { # label, prefix, base, key -> results/<label>-stats.json (UNDER LOAD)
  local label="$1" prefix="$2" base="$3" key="$4"
  local raw; raw="$(mktemp)"
  # Drive sustained load in the background, then sample docker stats a few times
  # while it runs so CPU reflects load — not a post-run idle snapshot.
  BASE_URL="$base" API_KEY="$key" SCENARIO=list VUS="$VUS" DURATION=24s \
    RESULT_FILE=/dev/null k6 run bench/k6/api.js >/dev/null 2>&1 &
  local k6pid=$!
  sleep 8 # past warm-up, into steady state
  for _ in 1 2 3 4; do
    # Pipe-delimited (not JSON) — robust to spaces/slashes in MemUsage.
    docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' \
      | grep "$prefix" >> "$raw" || true
    sleep 3
  done
  wait "$k6pid" 2>/dev/null || true
  # Reduce to PEAK cpu% and PEAK mem (MiB) per container across samples.
  node -e '
    const fs=require("fs");
    const [raw,outPath,lbl]=process.argv.slice(1);
    const lines=fs.readFileSync(raw,"utf8").trim().split("\n").filter(Boolean);
    const mem=s=>{const m=/([\d.]+)\s*([KMG]i?B)/.exec(s);if(!m)return 0;const u={KiB:1/1024,MiB:1,GiB:1024,KB:1/1024,MB:1,GB:1024}[m[2]]||1;return parseFloat(m[1])*u;};
    const byName={};
    for(const line of lines){const [name,cpu,memUsage]=line.split("|");if(!name)continue;
      const c=parseFloat(cpu)||0;const mMiB=mem((memUsage||"").split("/")[0].trim());
      byName[name]=byName[name]||{name,_cpu:0,_mem:0};
      byName[name]._cpu=Math.max(byName[name]._cpu,c);
      byName[name]._mem=Math.max(byName[name]._mem,mMiB);}
    const containers=Object.values(byName).map(x=>({name:x.name,cpu_peak:x._cpu.toFixed(1)+"%",mem_peak_mib:Math.round(x._mem)}));
    fs.writeFileSync(outPath,JSON.stringify({label:lbl,note:"peak under sustained list load",containers},null,2));
  ' "$raw" "$RESULTS/${label}-stats.json" "$label" || true
  rm -f "$raw"
}

run_k6_matrix() { # label, base_url, api_key  (writes results/<label>-<scenario>.json)
  local label="$1" base="$2" key="$3"
  for s in $SCENARIOS; do
    log "k6: $label / $s (vus=$VUS dur=$DURATION)"
    BASE_URL="$base" API_KEY="$key" SCENARIO="$s" VUS="$VUS" DURATION="$DURATION" \
      RESULT_FILE="$RESULTS/${label}-${s}.json" \
      k6 run bench/k6/api.js || echo "  (scenario $s reported threshold breach)"
  done
}

bench_fourty() {
  local base="http://localhost:${FOURTY_PORT}"
  log "Fourty: clean bring-up (SIZE=$SIZE)"
  $COMPOSE --profile fourty down -v --remove-orphans 2>/dev/null || true
  FOURTY_PORT="$FOURTY_PORT" $COMPOSE --profile fourty up -d --build
  wait_http "${base}/api/health" 180

  log "Fourty: bootstrap admin + API key"
  local jar; jar="$(mktemp)"
  curl -fsS -c "$jar" -X POST "${base}/api/auth/setup" \
    -H 'content-type: application/json' \
    -d '{"name":"Bench","email":"bench@fourty.test","password":"benchbench"}' >/dev/null
  local key
  key="$(curl -fsS -b "$jar" -X POST "${base}/api/api-keys" \
    -H 'content-type: application/json' -d '{"name":"bench","role":"admin"}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).secret))')"
  [ -n "$key" ] || { echo "failed to mint API key"; exit 1; }

  log "Fourty: seed via API"
  TARGET=fourty BASE_URL="$base" API_KEY="$key" SIZE="$SIZE" \
    npx tsx bench/seed.ts > "$RESULTS/fourty-${SIZE}-seed.json"
  cat "$RESULTS/fourty-${SIZE}-seed.json"

  local label="fourty-${SIZE}"
  run_k6_matrix "$label" "$base" "$key"
  # Match only this compose project's containers (bench-bench-*), not any stray
  # host container that happens to contain "fourty".
  capture_stats "$label" "bench-bench" "$base" "$key"

  [ "${KEEP:-0}" = "1" ] || $COMPOSE --profile fourty down -v --remove-orphans
}

bench_twenty() {
  local base="http://localhost:${TWENTY_PORT}"
  log "Twenty: clean bring-up (SIZE=$SIZE) — requires pinned images + a token"
  $COMPOSE --profile twenty down -v --remove-orphans 2>/dev/null || true
  TWENTY_PORT="$TWENTY_PORT" $COMPOSE --profile twenty up -d
  wait_http "${base}/healthz" 300 || wait_http "${base}" 300
  echo "Twenty requires a workspace + API token to seed via GraphQL."
  echo "Set TWENTY_TOKEN, then seed (bench/seed.ts TARGET=twenty) and run the k6"
  echo "matrix + capture_stats exactly as the Fourty path does."
  [ "${KEEP:-0}" = "1" ] || $COMPOSE --profile twenty down -v --remove-orphans
}

case "${1:-fourty}" in
  fourty) bench_fourty; npx tsx bench/report.ts ;;
  twenty) bench_twenty; npx tsx bench/report.ts ;;
  report) npx tsx bench/report.ts ;;
  all) bench_fourty; bench_twenty; npx tsx bench/report.ts ;;
  *) echo "usage: bench/run.sh [fourty|twenty|all|report]"; exit 2 ;;
esac

log "done — see BENCHMARK.md and $RESULTS/"
