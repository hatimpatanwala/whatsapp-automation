"""Full portal + ERP E2E against staging — pass/fail matrix across every major flow."""
import json, sys, urllib.request, http.cookiejar, datetime, time
RUN = datetime.datetime.now().strftime('%H%M%S')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = 'https://staging-whatsappdemo.duckdns.org/api'
SCHEMA = 'tenant_hatim_backup_c84a3b56'
TODAY = datetime.date.today().isoformat()
M_FROM, M_TO = TODAY[:8] + '01', TODAY

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with opener.open(req) as r:
            out = json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path} -> {e.code}: {e.read().decode()[:250]}')
    return out.get('data', out) if isinstance(out, dict) else out

results = []
ctx = {}
def check(name, fn):
    try:
        detail = fn()
        results.append(('PASS', name, str(detail or '')))
        print(f'PASS  {name}' + (f'  [{detail}]' if detail else ''))
    except Exception as e:
        results.append(('FAIL', name, str(e)[:250]))
        print(f'FAIL  {name}  !! {str(e)[:250]}')

def listy(r):
    if isinstance(r, list): return r
    if isinstance(r, dict): return r.get('data') or r.get('items') or r.get('rows') or []
    return []

# ═══ A. AUTH ═══
def a1():
    r = call('POST', '/auth/login', {'email': 'backup.hatim@gmail.com', 'password': 'Hatim@1234'})
    assert r.get('user', {}).get('email') == 'backup.hatim@gmail.com'
    return r['user']['role']
check('A1 login (session)', a1)

def a2():
    try:
        call('POST', '/auth/login', {'email': 'backup.hatim@gmail.com', 'password': 'wrong'})
    except RuntimeError as e:
        assert '401' in str(e) or '400' in str(e); return 'rejected'
    raise AssertionError('wrong password accepted')
check('A2 wrong password rejected', a2)

# ═══ B. PORTAL MASTERS ═══
def b1():
    p = call('POST', '/products', {
        'name': f'E2E-TEST Widget {RUN}', 'price': 100, 'gstRate': 18, 'hsnCode': '8471', 'uom': 'pcs',
        'itemType': 'product', 'mrp': 120, 'purchasePrice': 70, 'wholesalePrice': 90, 'wholesaleMinQty': 10,
        'saleDiscountPct': 0, 'trackingMode': 'none', 'rackLocation': 'T-1', 'uqc': 'PCS',
        'initialStock': 50, 'stockQuantity': 50, 'trackInventory': True,
    })
    assert p.get('id'); ctx['prodId'] = p['id']
    return p['id'][:8]
check('B1 portal: create product (parity fields)', b1)

def b2():
    p = call('GET', f"/products/{ctx['prodId']}")
    assert float(p['mrp']) == 120 and float(p['purchasePrice']) == 70 and p['rackLocation'] == 'T-1' and p['uqc'] == 'PCS', p
    return 'mrp/purchase/rack/uqc round-trip'
check('B2 portal: product field round-trip', b2)

def b3():
    call('PATCH', f"/products/{ctx['prodId']}", {'wholesalePrice': 95})
    p = call('GET', f"/products/{ctx['prodId']}")
    assert float(p['wholesalePrice']) == 95
    return 'PATCH persists'
check('B3 portal: product update', b3)

def b4():
    cats = listy(call('GET', '/categories')); brands = listy(call('GET', '/brands')); taxes = listy(call('GET', '/tax-rates'))
    return f'{len(cats)} cats, {len(brands)} brands, {len(taxes)} tax rates'
check('B4 portal: categories/brands/tax-rates', b4)

def b5():
    c = call('POST', '/customers', {'name': f'E2E-TEST Kirana {RUN}', 'phone': f'91{RUN}00112'})
    ctx['custId'] = c.get('id') or c.get('customer', {}).get('id')
    assert ctx['custId']
    found = listy(call('GET', '/customers?search=E2E-TEST'))
    assert any(str(x.get('whatsappName') or x.get('displayName') or x.get('name') or '').startswith('E2E-TEST') for x in found)
    return 'created + searchable'
check('B5 portal: customer create + search', b5)

def b6():
    s = call('POST', '/erp/suppliers', {'company': f'E2E-TEST Supplies {RUN}', 'phone': f'91{RUN}00334'})
    ctx['suppId'] = s.get('id'); assert ctx['suppId']
    ws = listy(call('GET', '/erp/warehouses'))
    ctx['whId'] = ws[0]['id'] if ws else None
    return f"supplier ok, {len(ws)} warehouse(s)"
check('B6 erp: supplier create + warehouses', b6)

# ═══ C. ENTRY MASTERS (keyboard ERP) ═══
def c1():
    try:
        call('POST', '/entry/party', {'group': 'debtor', 'partyName': 'E2E-TEST Bad GST', 'gstRegistrationType': 'regular', 'gstin': '27AAACR5055K1Z9'})
    except RuntimeError as e:
        assert '400' in str(e); return 'bad checksum rejected'
    raise AssertionError('invalid GSTIN accepted')
check('C1 party: invalid GSTIN rejected', c1)

def c2():
    existing = [x for x in listy(call('GET', '/entry/party?q=E2E-TEST%20Traders'))]
    if existing:
        ctx['partyId'] = existing[0]['id']
        return 'reused existing party'
    p = call('POST', '/entry/party', {'group': 'debtor', 'partyName': 'E2E-TEST Traders', 'gstRegistrationType': 'regular',
        'gstin': '27AAACR5055K1Z7', 'stateCode': '27', 'state': 'Maharashtra', 'mobile': '919000055566',
        'billingAddress': '12 MG Road, Mumbai', 'creditDays': 15, 'openingBalance': 0})
    ctx['partyId'] = p['id']; assert p.get('accountGroup') == 'debtor'
    found = call('GET', '/entry/party?q=E2E-TEST')
    assert any('E2E-TEST Traders' in (x.get('partyName') or x.get('name') or '') for x in listy(found))
    return 'valid GSTIN + ledger + searchable'
check('C2 party: create debtor w/ GSTIN', c2)

def c3():
    r = call('GET', '/entry/party/gstin-lookup?gstin=27AAACR5055K1Z7')
    assert r.get('stateCode') == '27' and r.get('pan') == 'AAACR5055K'
    return f"state {r.get('state')}, PAN derived"
check('C3 party: GSTIN lookup', c3)

def c4():
    items = listy(call('GET', '/entry/items?q=E2E-TEST'))
    it = next((x for x in items if x.get('name') == f'E2E-TEST Widget {RUN}'), None)
    assert it, f'widget not in item master: {len(items)} items'
    ctx['stock0'] = float(it.get('stock') or 0)
    return f"stock={ctx['stock0']}"
check('C4 item master: portal product visible w/ stock', c4)

def c5():
    call('POST', f"/entry/items/{ctx['prodId']}/add-stock", {'qty': 10})
    items = listy(call('GET', '/entry/items?q=E2E-TEST'))
    it = next(x for x in items if x['name'] == f'E2E-TEST Widget {RUN}')
    assert float(it['stock']) == ctx['stock0'] + 10, f"{it['stock']} != {ctx['stock0']}+10"
    ctx['stock0'] = float(it['stock'])
    return f"stock={it['stock']}"
check('C5 item master: add stock', c5)

# ═══ D. SALES ═══
def d1():
    inv = call('POST', '/erp/invoices', {
        'customerId': ctx['partyId'],
        'items': [{'productId': ctx['prodId'], 'description': f'E2E-TEST Widget {RUN}', 'quantity': 10, 'unitPrice': 90,
                   'gstRate': 18, 'hsn': '8471', 'freeQty': 2, 'd1': 10, 'mrpRate': 100}],
        'charges': [{'label': 'Freight', 'amount': 100, 'gstRate': 18}],
        'tcsPct': 1, 'dueDays': 15, 'isInterstate': False,
        'billTo': {'name': 'E2E-TEST Traders', 'state': 'Maharashtra', 'stateCode': '27', 'gstin': '27AAACR5055K1Z7'},
    })
    ctx['invId'] = inv['id']; ctx['invNo'] = inv['invoiceNumber']
    taxable, cgst, sgst = float(inv['taxableValue']), float(inv['cgst']), float(inv['sgst'])
    tcs, total = float(inv.get('tcsAmount') or 0), float(inv['total'])
    assert abs(taxable - 1000) < 0.01, f'taxable {taxable} != 1000'
    assert abs(cgst - 90) < 0.01 and abs(sgst - 90) < 0.01, f'cgst {cgst} sgst {sgst}'
    assert abs(tcs - 11.8) < 0.01, f'tcs {tcs} != 11.8'
    assert abs(total - 1192) < 0.01, f'total {total} != 1192'
    return f"{ctx['invNo']} taxable 1000, GST 90+90, TCS 11.8, total 1192"
check('D1 sales: invoice math (D1%, free, charges, TCS, round-off)', d1)

def d2():
    items = listy(call('GET', '/entry/items?q=E2E-TEST'))
    it = next(x for x in items if x['name'] == f'E2E-TEST Widget {RUN}')
    expect = ctx['stock0'] - 12  # 10 sold + 2 free
    assert float(it['stock']) == expect, f"{it['stock']} != {expect}"
    ctx['stock0'] = float(it['stock'])
    return f"stock={it['stock']} (10 sold + 2 free deducted)"
check('D2 sales: stock deducted incl free qty', d2)

def d3():
    vs = listy(call('GET', '/accounting/vouchers?limit=10'))
    v = next((x for x in vs if x.get('sourceId') == ctx['invId'] or (x.get('voucherType') == 'sales' and abs(float(x.get('amount') or 0) - 1192) < 0.01)), None)
    assert v, f'no sales voucher for {ctx["invNo"]}'
    return f"{v.get('number')} amount {v.get('amount')}"
check('D3 sales: voucher auto-posted', d3)

def d4():
    r = call('POST', f"/erp/invoices/{ctx['invId']}/payments", {'amount': 500, 'method': 'cash'})
    inv = r.get('invoice') or r
    assert abs(float(inv['balanceDue']) - 692) < 0.01, f"balance {inv['balanceDue']} != 692"
    assert inv['paymentStatus'] == 'partial'
    return 'partial 500 -> balance 692'
check('D4 sales: record part payment', d4)

def d5():
    p = call('GET', f"/gst/einvoice/{ctx['invId']}/payload")
    payload = p.get('payload') or p
    buyer = payload.get('BuyerDtls') or {}
    assert buyer.get('Gstin') == '27AAACR5055K1Z7', buyer
    return 'IRP payload w/ BuyerDtls'
check('D5 gst: e-invoice payload', d5)

# ═══ E. PURCHASE ═══
def e1():
    po = call('POST', '/erp/supplier-orders', {
        'supplierId': ctx['suppId'], 'supplierInvoiceNo': 'E2E-BILL-77',
        'items': [{'productId': ctx['prodId'], 'description': f'E2E-TEST Widget {RUN}', 'quantity': 20, 'unitPrice': 70, 'gstRate': 18}],
    })
    ctx['poId'] = po['id']
    total = float(po['total'])
    assert abs(total - (1400 * 1.18)) < 1.01, f'total {total}'
    return f"{po.get('orderNumber')} total {total}"
check('E1 purchase: create w/ supplier bill no', e1)

def e2():
    items = listy(call('GET', '/entry/items?q=E2E-TEST'))
    it = next(x for x in items if x['name'] == f'E2E-TEST Widget {RUN}')
    expect = ctx['stock0'] + 20
    assert float(it['stock']) == expect, f"{it['stock']} != {expect}"
    ctx['stock0'] = float(it['stock'])
    return f"stock={it['stock']}"
check('E2 purchase: stock added', e2)

def e3():
    r = call('POST', f"/erp/supplier-orders/{ctx['poId']}/payments", {'amount': 1000, 'method': 'bank'})
    return 'supplier payment recorded'
check('E3 purchase: supplier payment', e3)

# ═══ F. QUOTE / ORDER / RETURNS ═══
def f1():
    q = call('POST', '/quotes', {'customerId': ctx['custId'], 'items': [
        {'productId': ctx['prodId'], 'description': f'E2E-TEST Widget {RUN}', 'quantity': 5, 'unitPrice': 100, 'discount': 0}],
        'taxAmount': 90, 'notes': 'E2E quote'})
    ctx['quoteId'] = q['id']
    return q.get('quoteNumber') or q['id'][:8]
check('F1 quote: create', f1)

def f2():
    o = call('POST', '/orders', {'customerId': ctx['custId'], 'items': [
        {'productId': ctx['prodId'], 'productName': f'E2E-TEST Widget {RUN}', 'quantity': 3, 'unitPrice': 100}], 'notes': 'E2E order'})
    ctx['orderId'] = o['id']
    r = call('PUT', f"/orders/{ctx['orderId']}/status", {'status': 'confirmed'})
    o2 = call('GET', f"/orders/{ctx['orderId']}")
    st = (o2.get('order') or o2).get('status')
    assert st == 'confirmed', st
    return f"{o.get('orderNumber')} -> confirmed"
check('F2 order: create + status transition', f2)

def f3():
    cn = call('POST', '/erp/credit-notes', {'customerId': ctx['partyId'], 'items': [
        {'description': 'E2E-TEST Widget return', 'quantity': 1, 'unitPrice': 90}], 'taxRate': 0.18, 'reason': 'damaged'})
    assert cn.get('noteNumber')
    return cn['noteNumber']
check('F3 returns: credit note', f3)

def f4():
    dn = call('POST', '/erp/debit-notes', {'supplierId': ctx['suppId'], 'items': [
        {'description': 'E2E-TEST Widget return to supplier', 'quantity': 1, 'unitPrice': 70}], 'taxRate': 0.18})
    assert dn.get('noteNumber')
    return dn['noteNumber']
check('F4 returns: debit note', f4)

# ═══ G. STOCK ═══
def g1():
    if not ctx.get('whId'):
        w = call('POST', '/erp/warehouses', {'name': f'E2E Godown {RUN}', 'code': f'E2E{RUN}'})
        ctx['whId'] = w.get('id')
        assert ctx['whId'], f'warehouse create failed: {w}'
    call('POST', '/erp/stock/adjust', {'warehouseId': ctx['whId'], 'productId': ctx['prodId'], 'quantity': 5, 'mode': 'delta', 'note': 'E2E adjust'})
    return 'godown +5'
check('G1 stock: godown adjust', g1)

def g2():
    rows = listy(call('GET', '/entry/stock-summary'))
    it = next((x for x in rows if (x.get('name') or '').startswith('E2E-TEST')), None)
    assert it, 'widget missing from stock summary'
    return f"qty {it.get('stock') or it.get('qty')}"
check('G2 stock: summary report', g2)

# ═══ H. ACCOUNTING REPORTS ═══
def h1():
    tb = call('GET', '/accounting/reports/trial-balance')
    rows = listy(tb) or tb.get('rows', [])
    dr = sum(float(r.get('debit') or r.get('dr') or 0) for r in rows)
    cr = sum(float(r.get('credit') or r.get('cr') or 0) for r in rows)
    assert rows and abs(dr - cr) < 0.05, f'TB not balanced: Dr {dr} vs Cr {cr}'
    return f'balanced Dr=Cr={round(dr, 2)}'
check('H1 accounting: trial balance BALANCED', h1)

def h2():
    pnl = call('GET', '/accounting/reports/pnl')
    bs = call('GET', '/accounting/reports/balance-sheet')
    assert pnl and bs
    return 'pnl + balance sheet respond'
check('H2 accounting: P&L + balance sheet', h2)

def h3():
    db = call('GET', f'/accounting/reports/day-book?date={TODAY}')
    rows = db.get('vouchers') if isinstance(db, dict) else db
    assert rows, 'day book empty despite today\'s vouchers'
    return f'{len(rows)} vouchers today'
check('H3 accounting: day book has today\'s entries', h3)

def h4():
    ag = call('GET', '/accounting/reports/ageing')
    recv = ag.get('receivables') or []
    assert isinstance(recv, list)
    return f'{len(recv)} receivable parties'
check('H4 accounting: ageing', h4)

# ═══ I. GST RETURNS ═══
def i1():
    g1r = call('GET', f'/gst/gstr-1?from={M_FROM}&to={M_TO}')
    b2b = g1r.get('b2b') or []
    ours = [r for r in b2b if r.get('invoiceNumber') == ctx['invNo'] or r.get('buyerGstin') == '27AAACR5055K1Z7']
    assert ours, f'{ctx["invNo"]} not in GSTR-1 B2B ({len(b2b)} rows)'
    return f'B2B has {ctx["invNo"]}'
check('I1 gst: GSTR-1 includes invoice', i1)

def i2():
    g3 = call('GET', f'/gst/gstr-3b?from={M_FROM}&to={M_TO}')
    assert g3
    hs = call('GET', f'/gst/hsn-summary?from={M_FROM}&to={M_TO}')
    rows = listy(hs)
    assert any((r.get('hsn') or '') == '8471' for r in rows), 'HSN 8471 missing'
    return 'GSTR-3B + HSN summary (8471 present)'
check('I2 gst: GSTR-3B + HSN summary', i2)

# ═══ J. PAYMENTS MODULE (Mode A) ═══
def j1():
    ms = listy(call('GET', '/pay/methods'))
    if not ms:
        call('POST', '/pay/methods', {'type': 'upi', 'label': 'E2E UPI', 'upiId': 'e2e@upi', 'isDefault': True})
        ms = listy(call('GET', '/pay/methods'))
    assert ms
    return f'{len(ms)} method(s)'
check('J1 pay: methods', j1)

def j2():
    col = call('POST', f"/pay/invoice/{ctx['invId']}", {})
    ctx['colId'] = col['id']
    assert col.get('qrDataUrl') or col.get('qr') or col.get('upiIntent'), 'no QR/intent'
    call('POST', f"/pay/collections/{ctx['colId']}/claim", {'note': 'E2E paid'})
    call('POST', f"/pay/collections/{ctx['colId']}/confirm", {})
    inv = call('GET', f"/erp/invoices/{ctx['invId']}")
    inv = inv.get('invoice') or inv
    assert inv['paymentStatus'] == 'paid' and float(inv['balanceDue']) == 0, f"{inv['paymentStatus']} {inv['balanceDue']}"
    return 'collect -> claim -> confirm -> invoice PAID'
check('J2 pay: Mode-A collection lifecycle', j2)

# ═══ K. SFA REGRESSION ═══
def k1():
    sm = call('GET', '/sfa/salesmen')
    s = next(x for x in sm if x['name'] == 'Ramesh Kumar')
    q = f"?t={SCHEMA}&token={s['accessToken']}"
    me = call('GET', f'/sfa/m/me{q}')
    prods = call('GET', f'/sfa/m/products{q}&q=E2E-TEST')
    assert me['salesman']['name'] == 'Ramesh Kumar' and prods
    return f"home + catalog ({len(prods)} E2E items)"
check('K1 sfa: webview home + catalog', k1)

# ═══ L. PORTAL EXTRAS ═══
def l1():
    schemes = listy(call('GET', '/schemes'))
    return f'{len(schemes)} schemes'
check('L1 portal: schemes list', l1)

def l2():
    st = call('GET', '/orders/stats')
    assert st is not None
    counts = call('GET', '/orders/dashboard/counts')
    return 'stats + dashboard counts'
check('L2 portal: order stats/dashboard', l2)

def l3():
    cf = listy(call('GET', '/custom-fields?entity=product'))
    return f'{len(cf)} product custom fields'
check('L3 portal: custom fields', l3)

def l4():
    inv = listy(call('GET', '/erp/invoices?limit=5'))
    assert inv
    q = listy(call('GET', '/quotes'))
    return f'{len(inv)} invoices page, {len(q)} quotes'
check('L4 registers: invoice + quote lists', l4)

# ═══ SUMMARY ═══
print('\n' + '=' * 70)
fails = [r for r in results if r[0] == 'FAIL']
print(f'TOTAL {len(results)} checks — {len(results) - len(fails)} passed, {len(fails)} failed')
for st, name, det in fails:
    print(f'  FAIL {name}: {det}')
sys.exit(1 if fails else 0)
