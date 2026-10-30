#!/usr/bin/env bash
# Is the Tracely server up, is it the production one, and can it reach OpenAI?
# Read-only, safe to run any time by either developer:
#
#   server/scripts/healthcheck.sh                      # api.jointracely.com
#   server/scripts/healthcheck.sh http://localhost:4477 --mock   # a local mock
#   server/scripts/healthcheck.sh https://api.jointracely.com --commit <sha>
#   server/scripts/healthcheck.sh https://api.jointracely.com --demo  # insist on the try-out
#
# The one thing that spends: /api/status?probe=1 makes the server send OpenAI
# one tiny real call (about 0.002 cents, at most once a minute), because no
# free route says whether the key works and the account has credit. It fails
# when there is none or the key is refused, and WARNs when OpenAI can't be asked.
#
# The checks are the ones server/DEPLOY.md runs after every deploy: status
# shape, OpenAI answering, a bad token answers as free, the extension's CORS allow and deny, the
# prefs route refused, (when the server reports it) that the live commit is
# the one you expect, and — while the try-out is configured, which /api/status
# shows as `demoBudget` (TRACELY_DEMO_SECRET set) — that /try answers 200 with
# its frame rule and /ext-content.js answers 200 (the deploy copies
# extension/content.js there). Exits non-zero on the first failure.
# Needs bash, curl and node — nothing else.
set -u
BASE=${1:-https://api.jointracely.com}; shift || true
MOCK=0; WANT=""; DEMO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --mock) MOCK=1 ;;
    --commit) shift; WANT=${1:-} ;;
    --demo) DEMO=1 ;;
    *) echo "healthcheck: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
# Our two Web Store listings: Merrick's (since 2.21.69) and the old one, whose
# installs still call the server. TRACELY_EXTENSION_ID must admit both.
EXT_IDS="pkaihmliboboiafoodfaoflflcpipcnd dffmoeebkkghhgcklkbmaibfhgiegmdm"
fail() { printf 'FAIL  %s\n' "$1"; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

status=$(curl -sS --max-time 15 "$BASE/api/status?probe=1") || fail "GET /api/status did not answer"
read -r hasKey mock enforced paid release demo demoOn probeOk probeReason upstream <<<"$(printf '%s' "$status" | node -e '
  let s=""; process.stdin.on("data", d => s += d).on("end", () => {
    let j; try { j = JSON.parse(s) } catch { console.log("parse parse parse parse parse parse parse"); return }
    console.log(String(j.hasKey), String(j.mock), String(j.budget && j.budget.enforced), String("paidBudget" in j), j.release && j.release.commit ? j.release.commit : "-", String("demoBudget" in j), String(Boolean(j.demoBudget && j.demoBudget.enforced)), j.probe ? String(j.probe.ok) : "-", (j.probe && j.probe.reason) || "-", (j.upstream && j.upstream.outOfCreditAt) || "-")
  })')"
[ "$hasKey" = "parse" ] && fail "/api/status is not JSON — not a Tracely server"
if [ "$MOCK" = 1 ]; then
  [ "$mock" = "true" ] || fail "/api/status mock=$mock but --mock was asked for"
  ok "/api/status answers (mock mode)"
else
  [ "$hasKey" = "true" ] || fail "/api/status hasKey=$hasKey (no OpenAI key, or not production)"
  [ "$mock" = "true" ] && fail "/api/status mock=true — this is a mock server, not production"
  [ "$enforced" = "true" ] || fail "/api/status budget.enforced=$enforced (spend cap off)"
  [ "$paid" = "true" ] || fail "/api/status has no paidBudget"
  ok "/api/status: hasKey, enforced, paidBudget"
  # hasKey only says a key is set. The probe is the newest word; "upstream" is
  # a real call refused for lack of credit in the last 15 minutes.
  if [ "$probeOk" = "true" ]; then
    ok "OpenAI answered a real call: the key works and the account has credit"
  elif [ "$probeReason" = "out_of_credit" ] || { [ "$probeOk" != "false" ] && [ "$upstream" != "-" ]; }; then
    fail "OpenAI is OUT OF CREDIT: every check answers 503 budget. Add credit at platform.openai.com/settings/organization/billing"
  elif [ "$probeOk" = "false" ]; then
    fail "OpenAI REJECTS the API key ($probeReason): every check answers 503 no_key"
  elif [ "$probeOk" = "null" ]; then
    printf 'WARN  OpenAI could not be asked (%s): credit and key unverified\n' "$probeReason"
  else
    printf 'WARN  this server has no probe (a build before it): credit and key unverified\n'
  fi
fi

code=$(curl -sS -o /tmp/hc.$$ -w '%{http_code}' --max-time 15 -H "Authorization: Bearer not-a-token" "$BASE/api/entitlement") || fail "GET /api/entitlement did not answer"
plan=$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).plan) } catch { console.log("?") }' /tmp/hc.$$); rm -f /tmp/hc.$$
[ "$code" = "200" ] && [ "$plan" = "free" ] || fail "bad token → $code plan=$plan (want 200 free)"
ok "/api/entitlement: a bad token is served as free"

for id in $EXT_IDS; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X OPTIONS -H "Origin: chrome-extension://$id" -H "Access-Control-Request-Method: POST" "$BASE/api/check")
  [ "$code" = "204" ] || fail "OPTIONS /api/check from our extension $id → $code (want 204: TRACELY_EXTENSION_ID must list it)"
done
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X OPTIONS -H "Origin: chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -H "Access-Control-Request-Method: POST" "$BASE/api/check")
[ "$code" = "403" ] || fail "OPTIONS /api/check from a foreign extension → $code (want 403)"
ok "/api/check CORS: ours 204, foreign 403"

code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X PUT "$BASE/api/prefs")
if [ "$MOCK" = 1 ]; then ok "PUT /api/prefs → $code (local servers may accept it)"; else [ "$code" = "403" ] || fail "PUT /api/prefs → $code (want 403 on a hosted server)"; ok "PUT /api/prefs refused"; fi

# The try-out (server/lib/demo.js): checked while the server reports a demo
# pool, and required with --demo. /ext-content.js is the extension engine the
# page runs; a deploy that skipped copying it leaves /try a dead page.
if [ "$demo" = "true" ] || [ "$DEMO" = 1 ]; then
  [ "$demo" = "true" ] || fail "/api/status has no demoBudget but --demo was asked for (TRACELY_DEMO_SECRET unset?)"
  # {enforced:false} is the try-out switched off: a secret under 32 characters
  # or a budget that is not a positive number (the server's boot log says which).
  [ "$DEMO" = 1 ] && [ "$demoOn" != "true" ] && fail "demoBudget says the try-out is OFF (secret under 32 characters, or a budget that is not a positive number — see the boot log)"
  hdrs=$(curl -sS -D - -o /dev/null --max-time 15 "$BASE/try") || fail "GET /try did not answer"
  code=$(printf '%s' "$hdrs" | awk 'NR==1{print $2}')
  [ "$code" = "200" ] || fail "GET /try → $code (want 200)"
  printf '%s' "$hdrs" | grep -qi '^content-security-policy: frame-ancestors https://jointracely.com https://www.jointracely.com' || fail "GET /try carries no frame-ancestors for the website"
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/ext-content.js")
  [ "$code" = "200" ] || fail "GET /ext-content.js → $code (want 200 — copy extension/content.js to app/extension/content.js, DEPLOY.md)"
  ok "try-out: /try 200 with its frame rule, /ext-content.js 200"
else
  ok "try-out not configured (no demoBudget): /try and /ext-content.js not checked"
fi

if [ -n "$WANT" ]; then
  case "$release" in "$WANT"*|"${WANT:0:7}"*) ok "release.commit $release matches $WANT" ;; "-") fail "server reports no release.commit (older build, or release.json missing) — wanted $WANT" ;; *) fail "release.commit is $release, wanted $WANT" ;; esac
elif [ "$release" != "-" ]; then ok "release.commit $release"; fi
echo "healthy: $BASE"
