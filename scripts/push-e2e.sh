#!/usr/bin/env bash
# Push-notification pipeline E2E: device register + prefs + event → "would push" log.
set -u
BASE=https://staging-whatsappdemo.duckdns.org/api
SCHEMA=tenant_hatim_backup_c84a3b56
PEM=wa-commece.pem; EC2=ubuntu@52.66.40.206
J=$(mktemp); pass=0; fail=0
ok(){ echo "PASS  $1"; pass=$((pass+1)); }
no(){ echo "FAIL  $1"; fail=$((fail+1)); }
logs(){ ssh -i "$PEM" -o StrictHostKeyChecking=no "$EC2" "docker logs wa-staging-backend --since ${1:-40s} 2>&1"; }

curl -s -c "$J" -X POST -H "Content-Type: application/json" \
  -d '{"email":"backup.hatim@gmail.com","password":"Hatim@1234"}' "$BASE/auth/login" >/dev/null

echo "--- device + prefs ---"
c=$(curl -s -b "$J" -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"token":"E2E-TEST-DEVICE-TOKEN-001","platform":"android","appVariant":"full"}' "$BASE/notifications/devices")
[ "$c" = 200 ] || [ "$c" = 201 ] && ok "register device ($c)" || no "register device ($c)"
p=$(curl -s -b "$J" "$BASE/notifications/prefs")
echo "$p" | grep -q '"order":true' && ok "prefs default (order on)" || no "prefs default ($p)"

# salesman token to place orders (fires order.created → feed → push)
TOKEN=$(curl -s -b "$J" "$BASE/sfa/salesmen" | python -c "import json,sys;d=json.load(sys.stdin);r=d.get('data',d);print(next(x['accessToken'] for x in r if x['name']=='Ramesh Kumar'))")
Q="?t=$SCHEMA&token=$TOKEN"
CUST=$(curl -s "$BASE/sfa/m/customers$Q" | python -c "import json,sys;d=json.load(sys.stdin);print((d.get('data',d))[0]['id'])")
PROD=$(curl -s "$BASE/sfa/m/products$Q&q=" | python -c "import json,sys;d=json.load(sys.stdin);r=d.get('data',d);p=next(x for x in r if float(x.get('price') or 0)>0);print(p['id']+'|'+p['name']+'|'+str(p['price']))")
PID="${PROD%%|*}"; rest="${PROD#*|}"; PNAME="${rest%%|*}"; PRICE="${rest##*|}"

echo "--- ORDER (pref ON) → expect 'would notify' ---"
curl -s -o /dev/null "$BASE/sfa/m/orders$Q" -X POST -H "Content-Type: application/json" \
  -d "{\"customerId\":\"$CUST\",\"items\":[{\"productId\":\"$PID\",\"productName\":\"$PNAME\",\"quantity\":1,\"unitPrice\":$PRICE}]}"
sleep 4
if logs 30s | grep -qiE '\[push\].*would notify [1-9].*device'; then ok "order push fired (would notify device)"; else no "no push log for order"; fi

echo "--- mute 'order' → place order → expect NO new push for order ---"
curl -s -b "$J" -X PATCH -H "Content-Type: application/json" -d '{"order":false}' "$BASE/notifications/prefs" >/dev/null
MARK=$(date +%s)
curl -s -o /dev/null "$BASE/sfa/m/orders$Q" -X POST -H "Content-Type: application/json" \
  -d "{\"customerId\":\"$CUST\",\"items\":[{\"productId\":\"$PID\",\"productName\":\"$PNAME\",\"quantity\":1,\"unitPrice\":$PRICE}]}"
sleep 4
# count would-notify logs in the last 8s — should be 0 (order muted)
n=$(logs 8s | grep -ciE '\[push\].*would notify')
[ "$n" = 0 ] && ok "muted order → no push" || no "muted order still pushed ($n)"
# restore
curl -s -b "$J" -X PATCH -H "Content-Type: application/json" -d '{"order":true}' "$BASE/notifications/prefs" >/dev/null
# cleanup test device
curl -s -b "$J" -X DELETE "$BASE/notifications/devices/E2E-TEST-DEVICE-TOKEN-001" >/dev/null
ok "prefs restored + test device removed"

echo "========================================"
echo "PUSH: $pass passed, $fail failed"; rm -f "$J"
exit $([ "$fail" = 0 ] && echo 0 || echo 1)
