"""SFA customer-wise schemes + customer-cart editing E2E against staging."""
import json, sys, urllib.request, http.cookiejar
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = 'https://staging-whatsappdemo.duckdns.org/api'
SCHEMA = 'tenant_hatim_backup_c84a3b56'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with opener.open(req) as r:
            out = json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        print(f'!! {method} {path} -> {e.code}: {e.read().decode()[:300]}')
        raise
    return out.get('data', out) if isinstance(out, dict) else out

call('POST', '/auth/login', {'email': 'backup.hatim@gmail.com', 'password': 'Hatim@1234'})
s = next(x for x in call('GET', '/sfa/salesmen') if x['name'] == 'Ramesh Kumar')
q = f"?t={SCHEMA}&token={s['accessToken']}"
print('1. login + token OK')

custs = call('GET', f'/sfa/m/customers{q}&q=')
cust = custs[0]
prods = call('GET', f'/sfa/m/products{q}&q=')
p1 = next(x for x in prods if float(x.get('price') or 0) > 0)
p2 = next(x for x in prods if x['id'] != p1['id'] and float(x.get('price') or 0) > 0)

# 2. Customer-specific scheme: audience 'specific' targeted at this customer only
sch = call('POST', '/schemes', {'name': 'VIP 5% for E2E', 'action': 'discount', 'scope': 'all',
    'conditions': {'discountType': 'percent', 'discountValue': 5}, 'audience': 'specific',
    'customerIds': [cust['id']], 'combinable': True, 'weight': 1})
print('2. targeted scheme created')

try:
    # 3. customers/:id/schemes shows it flagged exclusive for the target...
    mine = call('GET', f"/sfa/m/customers/{cust['id']}/schemes{q}")
    vip = next((x for x in mine if x['name'] == 'VIP 5% for E2E'), None)
    assert vip and vip['exclusive'], f'targeted scheme missing/not exclusive: {mine}'
    print('3. exclusive scheme visible for target customer:', vip['benefit'])

    # 4. ...and NOT for another customer
    other = next(c for c in custs if c['id'] != cust['id'])
    others = call('GET', f"/sfa/m/customers/{other['id']}/schemes{q}")
    assert not any(x['name'] == 'VIP 5% for E2E' for x in others), 'targeted scheme leaked to another customer'
    print('4. hidden from other customers OK')

    # 5. Per-product offers on catalog cards
    prods2 = call('GET', f'/sfa/m/products{q}&q=')
    withoffers = [x for x in prods2 if x.get('offers')]
    print('5. products carrying offers:', [(x['name'], [o['benefit'] for o in x['offers']]) for x in withoffers[:3]])

    # 6. Customer cart: clear -> add 2 items -> qty edit -> read back
    call('POST', f"/sfa/m/customers/{cust['id']}/cart/clear{q}", {})
    c1 = call('POST', f"/sfa/m/customers/{cust['id']}/cart/items{q}", {'productId': p1['id'], 'quantity': 2})
    c2 = call('POST', f"/sfa/m/customers/{cust['id']}/cart/items{q}", {'productId': p2['id'], 'quantity': 1})
    assert len(c2['items']) == 2, f'expected 2 cart lines: {c2}'
    item1 = next(i for i in c2['items'] if i['productId'] == p1['id'])
    c3 = call('PATCH', f"/sfa/m/customers/{cust['id']}/cart/items/{item1['id']}{q}", {'quantity': 5})
    got = next(i for i in c3['items'] if i['productId'] == p1['id'])
    assert int(got['quantity']) == 5, f'qty edit failed: {got}'
    print('6. cart add + qty edit OK, total ₹', c3['total'])

    # 7. qty 0 removes the line
    c4 = call('PATCH', f"/sfa/m/customers/{cust['id']}/cart/items/{item1['id']}{q}", {'quantity': 0})
    assert not any(i['productId'] == p1['id'] for i in c4['items']), 'qty-0 did not remove line'
    print('7. qty-0 removes line OK')

    # 8. read endpoint agrees
    c5 = call('GET', f"/sfa/m/customers/{cust['id']}/cart{q}")
    assert len(c5['items']) == 1 and c5['items'][0]['productId'] == p2['id']
    print('8. cart read-back OK')

    # 9. clear
    call('POST', f"/sfa/m/customers/{cust['id']}/cart/clear{q}", {})
    c6 = call('GET', f"/sfa/m/customers/{cust['id']}/cart{q}")
    assert not c6['items'], 'clear failed'
    print('9. cart cleared OK')
finally:
    call('PATCH', f"/schemes/{sch['id']}/status", {'status': 'inactive'})
    print('10. test scheme deactivated')

print('\nALL CUSTOMER-CART + CUSTOMER-SCHEME E2E CHECKS PASSED')
