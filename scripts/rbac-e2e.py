"""RBAC + salesman-order-attribution E2E against staging."""
import json, sys, time, urllib.request, http.cookiejar
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = 'https://staging-whatsappdemo.duckdns.org/api'
SCHEMA = 'tenant_hatim_backup_c84a3b56'

def client():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(op, method, path, body=None, expect_err=False):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with op.open(req) as r:
            out = json.loads(r.read().decode() or '{}')
        return out.get('data', out) if isinstance(out, dict) else out
    except urllib.error.HTTPError as e:
        if expect_err: return {'_code': e.code}
        raise RuntimeError(f'{method} {path} -> {e.code}: {e.read().decode()[:160]}')

results = []
def check(name, fn):
    try:
        d = fn(); results.append(('PASS', name)); print(f'PASS  {name}' + (f'  [{d}]' if d else ''))
    except Exception as e:
        results.append(('FAIL', name)); print(f'FAIL  {name}  !! {str(e)[:200]}')

owner = client()
call(owner, 'POST', '/auth/login', {'email': 'backup.hatim@gmail.com', 'password': 'Hatim@1234'})
print('owner login OK')

EMP_EMAIL = f'e2e.viewer.{int(time.time())}@test.local'
EMP_PASS = 'viewer1234'
ctx = {}

def a1():
    f = call(owner, 'GET', '/access/features')
    assert isinstance(f, list) and any(x['key'] == 'invoices' for x in f)
    return f'{len(f)} features'
check('features catalog', a1)

def a2():
    roles = call(owner, 'GET', '/access/roles')
    names = [r['name'] for r in roles]
    assert 'Owner' in names and 'Viewer' in names and 'Salesman' in names, names
    ctx['viewer_id'] = next(r['id'] for r in roles if r['name'] == 'Viewer')
    return ', '.join(names)
check('seeded roles present', a2)

def a3():
    mp = call(owner, 'GET', '/access/my-permissions')
    assert mp['owner'] is True
    return 'owner=true'
check('owner has full access', a3)

def a4():
    e = call(owner, 'POST', '/access/employees', {'name': 'E2E Viewer', 'email': EMP_EMAIL, 'password': EMP_PASS, 'roleId': ctx['viewer_id']})
    ctx['emp_id'] = e['id']
    return e['id'][:8]
check('create Viewer employee', a4)

# ── Employee session ──
emp = client()
def a5():
    r = call(emp, 'POST', '/auth/login', {'email': EMP_EMAIL, 'password': EMP_PASS})
    assert r.get('user'), r
    return 'logged in'
check('employee can log in', a5)

def a6():
    mp = call(emp, 'GET', '/access/my-permissions')
    p = mp['permissions']
    assert mp['owner'] is False and p.get('orders') == 'read' and p.get('invoices') == 'read', mp
    return 'viewer: all read, owner=false'
check('employee resolves Viewer permissions', a6)

def a7():
    r = call(emp, 'GET', '/orders?limit=5', expect_err=True)
    assert not isinstance(r, dict) or r.get('_code') != 403, 'read should be allowed'
    return 'orders read allowed'
check('viewer can READ orders', a7)

def a8():
    r = call(emp, 'POST', '/orders', {'customerId': '00000000-0000-0000-0000-000000000000', 'items': [{'productName': 'X', 'quantity': 1, 'unitPrice': 1}]}, expect_err=True)
    assert r.get('_code') == 403, r
    return 'orders write -> 403'
check('viewer CANNOT write orders (403)', a8)

def a9():
    r = call(emp, 'POST', '/products', {'name': 'RBAC-TEST', 'price': 1}, expect_err=True)
    assert r.get('_code') == 403, r
    return 'products write -> 403'
check('viewer CANNOT create products (403)', a9)

# ── Give the employee a custom role that CAN write orders ──
def a10():
    role = call(owner, 'POST', '/access/roles', {'name': f'E2E Writer {int(time.time())}',
        'permissions': {'orders': 'write', 'customers': 'write', 'products': 'read', 'dashboard': 'read'}})
    ctx['role_id'] = role['id']
    call(owner, 'PATCH', f"/access/employees/{ctx['emp_id']}", {'roleId': role['id']})
    return 'assigned custom writer role'
check('owner creates writer role + assigns it', a10)

def a11():
    emp2 = client()
    call(emp2, 'POST', '/auth/login', {'email': EMP_EMAIL, 'password': EMP_PASS})
    mp = call(emp2, 'GET', '/access/my-permissions')
    assert mp['permissions'].get('orders') == 'write', mp
    # now a real order write should pass the guard (use a real customer + product)
    cust = call(emp2, 'GET', '/customers?limit=1')
    rows = cust if isinstance(cust, list) else (cust.get('data') or [])
    cid = rows[0]['id']
    prods = call(emp2, 'GET', '/products?limit=1')
    prows = prods if isinstance(prods, list) else (prods.get('data') or [])
    p = prows[0]
    r = call(emp2, 'POST', '/orders', {'customerId': cid, 'items': [{'productId': p['id'], 'productName': p.get('name','Item'), 'quantity': 1, 'unitPrice': float(p.get('price') or 10)}]}, expect_err=True)
    assert r.get('_code') != 403, r
    return 'order write now ALLOWED'
check('writer role unlocks order write', a11)

# ── Salesman order attribution ──
def a12():
    s = next(x for x in call(owner, 'GET', '/sfa/salesmen') if x['name'] == 'Ramesh Kumar')
    q = f"?t={SCHEMA}&token={s['accessToken']}"
    custs = call(owner, 'GET', f'/sfa/m/customers{q}')
    prods = call(owner, 'GET', f'/sfa/m/products{q}&q=')
    p = next(x for x in prods if float(x.get('price') or 0) > 0)
    order = call(owner, 'POST', f'/sfa/m/orders{q}', {'customerId': custs[0]['id'], 'items': [{'productId': p['id'], 'productName': p['name'], 'quantity': 1, 'unitPrice': float(p['price'])}]})
    ctx['sfa_order'] = order['orderNumber']
    # now find it in the portal orders list, tagged salesman
    lst = call(owner, 'GET', '/orders?limit=10')
    rows = lst if isinstance(lst, list) else (lst.get('data') or [])
    match = next((o for o in rows if o.get('orderNumber') == order['orderNumber']), None)
    assert match and match.get('source') == 'salesman' and match.get('placedByName') == 'Ramesh Kumar', match
    return f"{order['orderNumber']} source=salesman placedBy=Ramesh Kumar"
check('SFA order tagged salesman in portal list', a12)

# ── cleanup ──
def a13():
    call(owner, 'PATCH', f"/access/employees/{ctx['emp_id']}", {'isActive': False})
    # reassign employee off the custom role so it can be deleted
    call(owner, 'PATCH', f"/access/employees/{ctx['emp_id']}", {'roleId': ctx['viewer_id']})
    call(owner, 'DELETE', f"/access/roles/{ctx['role_id']}")
    return 'employee deactivated + custom role removed'
check('cleanup', a13)

print('\n' + '=' * 64)
fails = [r for r in results if r[0] == 'FAIL']
print(f'RBAC + ATTRIBUTION: {len(results)-len(fails)}/{len(results)} passed')
for _, n in fails: print('  FAIL', n)
sys.exit(1 if fails else 0)
