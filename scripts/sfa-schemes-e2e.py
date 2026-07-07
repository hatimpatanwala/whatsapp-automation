"""SFA schemes + catalog + portal-parity E2E against staging."""
import json, sys, urllib.request, http.cookiejar

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

# 1. Admin login
login = call('POST', '/auth/login', {'email': 'backup.hatim@gmail.com', 'password': 'Hatim@1234'})
assert login.get('user'), 'login failed'
print('1. admin login OK')

# 2. Reuse the E2E salesman
sm = call('GET', '/sfa/salesmen')
s = next(x for x in sm if x['name'] == 'Ramesh Kumar')
q = f"?t={SCHEMA}&token={s['accessToken']}"
print('2. salesman token OK')

# 3. Create schemes: 10% off everything + buy 2 get 1 free on one product
prods = call('GET', f'/sfa/m/products{q}&q=')
assert prods, 'no products'
p = next(x for x in prods if float(x.get('price') or 0) > 0)
sch1 = call('POST', '/schemes', {'name': 'Monsoon 10% Off', 'action': 'discount', 'scope': 'all',
    'conditions': {'discountType': 'percent', 'discountValue': 10}, 'combinable': False, 'weight': 5})
sch2 = call('POST', '/schemes', {'name': f"B2G1 {p['name'][:20]}", 'action': 'buy_x_get_x_free', 'scope': 'product',
    'scopeIds': [p['id']], 'conditions': {'buyQty': 2, 'getQty': 1}, 'combinable': False, 'weight': 10})
print('3. schemes created:', sch1['id'][:8], sch2['id'][:8])

try:
    # 4. Catalog shows a badge now
    prods2 = call('GET', f'/sfa/m/products{q}&q=')
    tagged = next((x for x in prods2 if x['id'] == p['id']), {})
    print('4. product badge:', tagged.get('badge'))
    assert tagged.get('badge'), 'no scheme badge on product'

    # 5. Salesman offers list
    offers = call('GET', f'/sfa/m/schemes{q}')
    print('5. offers:', [(o['name'], o['benefit'], o['appliesTo']) for o in offers][:3])
    assert any('10% off' in o['benefit'] for o in offers)

    # 6. Cart evaluation: 2 of the product -> B2G1 wins (weight 10) -> 1 free
    custs = call('GET', f'/sfa/m/customers{q}&q=')
    cust = custs[0]
    cart = {'customerId': cust['id'], 'items': [{'productId': p['id'], 'quantity': 2, 'unitPrice': float(p['price'])}]}
    ev = call('POST', f'/sfa/m/cart{q}', cart)
    print('6. evaluate:', 'discount', ev['discountTotal'], 'free', [(f['name'], f['quantity']) for f in ev['freeItems']])
    assert ev['freeItems'], 'expected a free item from B2G1'

    # 7. Order applies the scheme: free line + note
    order = call('POST', f'/sfa/m/orders{q}', cart)
    print('7. order:', order['orderNumber'], 'discount', order['schemeDiscount'], 'free', order['freeItems'], 'schemes', order['appliedSchemes'])
    assert order['freeItems'] or order['schemeDiscount'], 'scheme not applied to order'

    # 8. Portal parity: update product with item-master fields, read back
    upd = call('PATCH', f"/products/{p['id']}", {'wholesalePrice': 111.5, 'wholesaleMinQty': 12, 'rackLocation': 'A-7',
        'trackingMode': 'none', 'priceIncludesTax': False, 'saleDiscountPct': 2.5, 'uqc': 'PCS'})
    got = call('GET', f"/products/{p['id']}")
    print('8. parity round-trip:', got.get('wholesalePrice'), got.get('wholesaleMinQty'), got.get('rackLocation'), got.get('uqc'), got.get('saleDiscountPct'))
    assert float(got.get('wholesalePrice') or 0) == 111.5 and got.get('rackLocation') == 'A-7'
finally:
    # 9. Deactivate test schemes so staging data stays clean
    for sc in (sch1, sch2):
        try:
            call('PATCH', f"/schemes/{sc['id']}/status", {'status': 'inactive'})
        except Exception as e:
            print('cleanup warn:', e)
    print('9. schemes deactivated')

print('\nALL SCHEME + PARITY E2E CHECKS PASSED')
