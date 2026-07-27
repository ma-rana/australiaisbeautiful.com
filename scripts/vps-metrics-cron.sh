#!/usr/bin/env bash
# scripts/vps-metrics-cron.sh — the on-box metrics feed for /admin/cost.
#
# WHY THIS EXISTS: the app must never hold a Hostinger API token. That token can
# reboot and restore-backup the VPS, so putting it in an internet-facing app's
# env means a single app compromise = total infrastructure compromise. Instead,
# THIS script runs on the box (as a cron), holds the token in ITS OWN env, pulls
# the metric, and writes a tiny JSON file. The app only READS that file.
#
# It writes:  { "updatedAt": "<ISO8601>", "bandwidthTB": <number> }
# to $VPS_METRICS_FILE — the same path the app reads (lib/cost-guards.ts).
#
# ── Install (on the VPS, as the deploy user) ─────────────────────────────────
#   1. chmod +x scripts/vps-metrics-cron.sh
#   2. Make sure the output dir exists and is app-readable:
#        mkdir -p /var/www/australiaisbeautiful.com/tmp
#   3. Add a crontab entry (every 30 min is plenty; the app treats >6h as stale):
#        crontab -e
#        # put the token here, in the CRON's env — NOT in the app's .env:
#        HOSTINGER_API_TOKEN=xxxxxxxxxxxx
#        VPS_METRICS_FILE=/var/www/australiaisbeautiful.com/tmp/vps-metrics.json
#        */30 * * * * /var/www/australiaisbeautiful.com/scripts/vps-metrics-cron.sh >> /var/log/aib-vps-metrics.log 2>&1
#
# ── Two ways to get bandwidth (pick one; the script tries API then vnstat) ────
#   A) Hostinger API  — needs HOSTINGER_API_TOKEN and the right endpoint/field.
#      The exact endpoint + JSON path for monthly bandwidth is in Hostinger's API
#      docs; confirm it and fill in HOSTINGER_BW_URL / the jq path below.
#   B) vnstat (local) — measures bandwidth on the box itself, no token at all.
#      `sudo apt install vnstat` once; this reads its monthly total. Simpler and
#      token-free, at the cost of counting the NIC rather than the plan's meter
#      (close enough for a headroom warning).
#
# If neither works, the script writes nothing and the app keeps showing
# "awaiting feed" (no false alarm). If the feed later goes stale, the app flips
# to "unknown" and the cost-guard alarm fires — a dead feed is a real signal.

set -euo pipefail

OUT="${VPS_METRICS_FILE:-/var/www/australiaisbeautiful.com/tmp/vps-metrics.json}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BW_TB=""

# ── A) Hostinger API ─────────────────────────────────────────────────────────
# Fill HOSTINGER_BW_URL with the real monthly-bandwidth endpoint from the docs,
# and adjust the jq path to the field that holds bytes (or GB/TB) used this month.
# Left blank by default so the script falls through to vnstat until you wire it.
HOSTINGER_BW_URL="${HOSTINGER_BW_URL:-}"
if [[ -n "${HOSTINGER_API_TOKEN:-}" && -n "$HOSTINGER_BW_URL" ]]; then
  if RESP="$(curl -fsS -H "Authorization: Bearer ${HOSTINGER_API_TOKEN}" "$HOSTINGER_BW_URL" 2>/dev/null)"; then
    # EXAMPLE parse — adjust `.data.bandwidth_bytes` to the real field. This
    # assumes bytes and converts to TB. If the API returns GB, divide by 1024.
    BYTES="$(printf '%s' "$RESP" | jq -r '.data.bandwidth_bytes // empty' 2>/dev/null || true)"
    if [[ -n "$BYTES" && "$BYTES" != "null" ]]; then
      BW_TB="$(awk "BEGIN { printf \"%.6f\", $BYTES / (1024*1024*1024*1024) }")"
    fi
  fi
fi

# ── B) vnstat fallback (token-free) ──────────────────────────────────────────
# Monthly total (rx+tx) for the default interface, in bytes → TB. vnstat's JSON
# shape varies by version; this targets v2 (`--json m`).
if [[ -z "$BW_TB" ]] && command -v vnstat >/dev/null 2>&1; then
  if VN="$(vnstat --json m 2>/dev/null)"; then
    BYTES="$(printf '%s' "$VN" | jq -r '
      .interfaces[0].traffic.month[-1] as $m
      | (($m.rx // 0) + ($m.tx // 0))
    ' 2>/dev/null || true)"
    if [[ -n "$BYTES" && "$BYTES" != "null" && "$BYTES" != "0" ]]; then
      BW_TB="$(awk "BEGIN { printf \"%.6f\", $BYTES / (1024*1024*1024*1024) }")"
    fi
  fi
fi

# ── Write the file (only if we actually measured something) ──────────────────
# Writing nothing on failure is deliberate: the app then shows "awaiting" (if
# never written) or "stale/unknown" (if previously written and now old) — both
# honest. A zero we invented would be a lie that hides a real limit.
if [[ -n "$BW_TB" ]]; then
  TMP="$(mktemp)"
  printf '{ "updatedAt": "%s", "bandwidthTB": %s }\n' "$NOW" "$BW_TB" > "$TMP"
  # Atomic move so the app never reads a half-written file.
  mv "$TMP" "$OUT"
  # Make sure the app (a different user, possibly) can read it.
  chmod 0644 "$OUT"
  echo "[$NOW] wrote bandwidthTB=$BW_TB to $OUT"
else
  echo "[$NOW] no bandwidth measurement available (no API endpoint set, vnstat missing/empty) — leaving feed untouched"
fi
