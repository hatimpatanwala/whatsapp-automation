#!/usr/bin/env bash
# Entitlements E2E: ERP online/offline + SFA gating (positive + negative + restore).
# Run from repo root (git-bash). Needs the staging SSH key + owner login.
set -u
BASE=https://staging-whatsappdemo.duckdns.org/api
SCHEMA=tenant_hatim_backup_c84a3b56
PLAN=dbf7a950-4f30-4012-a5d4-1f3b378a4ba9
PEM=wa-commece.pem
EC2=ubuntu@52.66.40.206
J=$(mktemp)
pass=0; fail=0
ok(){ echo "PASS  $1"; pass=$((pass+1)); }
no(){ echo "FAIL  $1"; fail=$((fail+1)); }

setfeat(){ ssh -i "$PEM" -o StrictHostKeyChecking=no "$EC2" \
  "docker exec -i wa-staging-postgres psql -U postgres -d whatsapp_commerce_staging" <<SQL >/dev/null 2>&1
UPDATE public.subscription_plans SET features = features || '{"$1": $2}'::jsonb WHERE id='$PLAN';
SQL
}
feats(){ curl -s -b "$J" "$BASE/auth/me" | python -c "import json,sys
d=json.load(sys.stdin); d=d.get('data',d)
sub=d.get('subscription') or {}
print(' '.join(sub.get('enabledFeatures',[])))" 2>/dev/null; }

curl -s -c "$J" -X POST -H "Content-Type: application/json" \
  -d '{"email":"backup.hatim@gmail.com","password":"Hatim@1234"}' "$BASE/auth/login" >/dev/null

echo "--- POSITIVE (sfa + erpOffline on) ---"
st=$(curl -s -b "$J" "$BASE/erp/status")
echo "$st" | grep -q '"sfa":true' && echo "$st" | grep -q '"erpOffline":true' && ok "erp/status exposes live sfa + erpOffline" || no "erp/status missing sfa/erpOffline"
c=$(curl -s -b "$J" -o /dev/null -w "%{http_code}" "$BASE/sfa/salesmen"); [ "$c" = 200 ] && ok "sfa admin list works" || no "sfa admin list ($c)"
feats | grep -q erpOffline && ok "desktop-gate input: /auth/me lists erpOffline (would ALLOW)" || no "auth/me missing erpOffline"
TOKEN=$(curl -s -b "$J" "$BASE/sfa/salesmen" | python -c "import json,sys;d=json.load(sys.stdin);r=d.get('data',d);print(next(x['accessToken'] for x in r if x['name']=='Ramesh Kumar'))")
c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/sfa/m/me?t=$SCHEMA&token=$TOKEN"); [ "$c" = 200 ] && ok "salesman webview link works" || no "webview link ($c)"

echo "--- NEGATIVE: sfa off ---"
setfeat sfa false
c=$(curl -s -b "$J" -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"name":"GATE-TEST","phone":"910000000099"}' "$BASE/sfa/salesmen")
[ "$c" = 403 ] && ok "sfa write blocked (403)" || no "sfa write not blocked ($c)"
c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/sfa/m/me?t=$SCHEMA&token=$TOKEN")
[ "$c" = 401 ] && ok "sfa webview blocked (401)" || no "sfa webview not blocked ($c)"
setfeat sfa true
c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/sfa/m/me?t=$SCHEMA&token=$TOKEN"); [ "$c" = 200 ] && ok "sfa works again after re-enable" || no "sfa not restored ($c)"

echo "--- NEGATIVE: erpOffline off ---"
setfeat erpOffline false
feats | grep -q erpOffline && no "erpOffline still present" || ok "erpOffline absent -> desktop gate would REFUSE"
setfeat erpOffline true
feats | grep -q erpOffline && ok "erpOffline restored" || no "erpOffline not restored"

echo "========================================"
echo "ENTITLEMENTS: $pass passed, $fail failed"
rm -f "$J"
exit $([ "$fail" = 0 ] && echo 0 || echo 1)
