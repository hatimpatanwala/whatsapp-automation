"""SFA E2E against staging: create salesman -> webview flows -> collect + promise."""
import json, sys, urllib.request, http.cookiejar

BASE = 'https://staging-whatsappdemo.duckdns.org/api'
SCHEMA = 'tenant_hatim_backup_c84a3b56'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(method, path, body=None, token=None, raw=False):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with opener.open(req) as r:
            out = json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        print(f'!! {method} {path} -> {e.code}: {e.read().decode()[:300]}')
        raise
    return out.get('data', out) if isinstance(out, dict) and not raw else out

# 1. Admin login (session cookie)
login = call('POST', '/auth/login', {'email': 'backup.hatim@gmail.com', 'password': 'Hatim@1234'})
assert login.get('user'), f'login failed: {login}'
print('1. admin login OK (session cookie)')
tok = None

# 2. Create salesman
s = call('POST', '/sfa/salesmen', {'name': 'Ramesh Kumar', 'phone': '919876500001', 'route': 'Route-1', 'area': 'Fort'}, tok)
print('2. salesman:', s)
stoken = s['accessToken']
q = f'?t={SCHEMA}&token={stoken}'

# 3. Webview: me/home
me = call('GET', f'/sfa/m/me{q}')
print('3. me:', me['salesman']['name'], '| pending', me['pendingTotal'], 'bills', me['pendingBills'])

# 4. Customers with outstanding
custs = call('GET', f'/sfa/m/customers{q}&q=')
assert isinstance(custs, list) and custs, f'no customers: {custs}'
target = next((c for c in custs if float(c['outstanding'] or 0) > 0), custs[0])
print('4. customer:', target['name'], 'outstanding', target['outstanding'])

# 5. Customer detail
det = call('GET', f"/sfa/m/customers/{target['id']}{q}")
print('5. detail bills:', [(b['invoiceNumber'], b['balanceDue']) for b in det['bills']][:3])

# 6. Products + order on behalf
prods = call('GET', f'/sfa/m/products{q}&q=')
assert prods, 'no products'
p = prods[0]
order = call('POST', f'/sfa/m/orders{q}', {'customerId': target['id'], 'items': [
    {'productId': p['id'], 'productName': p['name'], 'quantity': 2, 'unitPrice': float(p.get('salePrice') or p.get('basePrice') or 100)}]})
print('6. order placed:', order)

# 7. Pending run
pending = call('GET', f'/sfa/m/pending{q}')
print('7. pending bills:', len(pending))
bill = next((b for b in pending if b['customerId'] == target['id']), pending[0] if pending else None)

# 8. Promise-to-pay on that bill
pr = call('POST', f'/sfa/m/promises{q}', {'customerId': bill['customerId'], 'invoiceId': bill['id'],
    'amount': 50, 'promiseDate': '2026-07-07', 'note': 'after market day'})
print('8. promise:', pr)

# 9. Collect Rs.50 by cheque with instrument details + promiseId -> auto-kept
col = call('POST', f'/sfa/m/collect{q}', {'invoiceId': bill['id'], 'amount': 50, 'method': 'cheque',
    'instrumentNo': '004521', 'instrumentDate': '2026-07-07', 'note': 'HDFC chq', 'promiseId': pr['id']})
print('9. collect:', col)

# 10. Promise auto-marked kept?
allp = call('GET', f'/sfa/m/promises{q}&scope=all')
mine = next((x for x in allp if x['id'] == pr['id']), None)
print('10. promise status:', mine and mine['status'])
assert mine and mine['status'] == 'kept', 'promise not auto-kept'

# 11. Cheque validation: collect without instrumentNo must 400
try:
    call('POST', f'/sfa/m/collect{q}', {'invoiceId': bill['id'], 'amount': 1, 'method': 'cheque'})
    print('11. FAIL — cheque without number accepted')
    sys.exit(1)
except urllib.error.HTTPError:
    print('11. cheque-without-number correctly rejected')

# 12. Bad token rejected
try:
    call('GET', f'/sfa/m/me?t={SCHEMA}&token=deadbeef')
    print('12. FAIL — bad token accepted'); sys.exit(1)
except urllib.error.HTTPError:
    print('12. bad token correctly rejected')

# 13. Admin follow-ups view
fu = call('GET', '/sfa/promises?scope=all', token=tok)
print('13. admin follow-ups:', len(fu))
print('\nALL SFA E2E CHECKS PASSED')
