/* =====================================================================
   shared.js  —  ใช้ร่วมกันทั้ง index.html / kitchen.html / admin.html
   ต้องอัปโหลดไฟล์นี้ไว้ในโฟลเดอร์เดียวกับ 3 หน้าเสมอ
   ===================================================================== */

/* ---------- ตั้งค่าที่เจ้าของร้านแก้ได้ ---------- */
const APP_CONFIG = {
    // false = เปิดใช้ได้เลยเหมือนเดิม (ไม่ต้องล็อกอิน)
    // true  = ต้องล็อกอินด้วยอีเมล/รหัสผ่านก่อนใช้งาน (ทำตามไฟล์ SETUP-คู่มือ.md ก่อนเปิด!)
    REQUIRE_LOGIN: false,
    // อีเมลเจ้าของร้าน (ใช้เมื่อ REQUIRE_LOGIN = true) เฉพาะอีเมลนี้เข้า Admin ได้
    OWNER_EMAIL: '',
    // เตือนเมื่อแก้วเหลือน้อยกว่าจำนวนนี้
    LOW_CUP_ALERT: 50,
    // รหัสประเทศสำหรับ WhatsApp (ลาว = 856) ใช้เติมหน้าเบอร์ที่ขึ้นต้นด้วย 0
    COUNTRY_CODE: '856'
};

const firebaseConfig = {
    apiKey: "AIzaSyDAJUEFUwkieMGFxRIZ6vRwzLbXF31c_BM",
    authDomain: "augx-d75c2.firebaseapp.com",
    databaseURL: "https://augx-d75c2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "augx-d75c2",
    storageBucket: "augx-d75c2.firebasestorage.app"
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();

/* ---------- ฟังก์ชันช่วยทั่วไป ---------- */
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function money(n) { return Number(n || 0).toLocaleString() + ' ₭'; }
function pad2(n) { return String(n).padStart(2, '0'); }
function dayKey(ts) {
    const d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function timeHHMM(ts) {
    const d = new Date(ts || Date.now());
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
// 'YYYY-MM-DD' -> {start,end} เป็น timestamp (เวลาท้องถิ่น)
function dayRange(dateStr) {
    const start = new Date(dateStr + 'T00:00:00').getTime();
    return { start: start, end: start + 86400000 - 1 };
}
// "S|30000, M|35000"  หรือ "35000"  ->  [{label, price}]
function parsePrices(raw) {
    raw = String(raw == null ? '' : raw).trim();
    if (!raw) return [];
    if (raw.indexOf('|') === -1) {
        const p = parseFloat(raw.replace(/,/g, ''));
        return isNaN(p) ? [] : [{ label: '', price: p }];
    }
    return raw.split(',').map(function (part) {
        const i = part.lastIndexOf('|');
        if (i < 0) return null;
        const label = part.slice(0, i).trim();
        const price = parseFloat(part.slice(i + 1));
        if (isNaN(price)) return null;
        return { label: label, price: price };
    }).filter(Boolean);
}
// "หวาน 50%|0, Extra shot|10000" -> [{name, price}]
function parseOptions(text) {
    return String(text || '').split(/[,\n]+/).map(function (part) {
        part = part.trim();
        if (!part) return null;
        const i = part.lastIndexOf('|');
        if (i < 0) return { name: part, price: 0 };
        const name = part.slice(0, i).trim();
        const price = parseFloat(part.slice(i + 1)) || 0;
        return name ? { name: name, price: price } : null;
    }).filter(Boolean);
}
function normalizeModifier(m) {
    // รองรับทั้งแบบใหม่ (รายการ {name, price}) และแบบเก่าที่เก็บเป็นข้อความ "หวาน 0%, หวาน 50%"
    let opts = m.options;
    if (typeof opts === 'string') opts = parseOptions(opts);
    else if (opts && typeof opts === 'object') opts = Array.isArray(opts) ? opts : Object.values(opts);
    else opts = [];
    m.options = opts.map(function (o) {
        if (typeof o === 'string') return parseOptions(o)[0] || null;
        if (o && typeof o === 'object') {
            const name = String(o.name || o.option || o.label || o.value || o.title || '').trim();
            return name ? { name: name, price: Number(o.price || 0) || 0 } : null;
        }
        return null;
    }).filter(Boolean);
    return m;
}

/* ---------- ข้อความแจ้งเตือนมุมจอ (แทน alert) ---------- */
function toast(msg, ok) {
    let box = document.getElementById('toast-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toast-box';
        box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
        document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'background:' + (ok === false ? '#ef4444' : '#1a365d') + ';color:#fff;padding:10px 18px;border-radius:8px;font-weight:bold;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:90vw;text-align:center;';
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
}

/* ---------- แจ้งเตือนเมื่ออินเทอร์เน็ตหลุด ---------- */
function watchConnection() {
    const bar = document.createElement('div');
    bar.id = 'conn-banner';
    bar.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:3000;background:#ef4444;color:#fff;text-align:center;padding:6px 10px;font-weight:bold;font-size:13px;';
    bar.textContent = '⚠️ อินเทอร์เน็ตหลุด — ออร์เดอร์ที่กดตอนนี้จะส่งเมื่อกลับมาออนไลน์ (อย่ารีเฟรชหรือปิดหน้านี้)';
    document.body.appendChild(bar);
    let timer = null;
    database.ref('.info/connected').on('value', function (s) {
        if (s.val() === true) { clearTimeout(timer); bar.style.display = 'none'; }
        else { clearTimeout(timer); timer = setTimeout(function () { bar.style.display = 'block'; }, 4000); }
    });
}

/* ---------- ระบบล็อกอิน (เปิดด้วย REQUIRE_LOGIN) ---------- */
function logoutApp() {
    if (APP_CONFIG.REQUIRE_LOGIN) { firebase.auth().signOut().then(function () { location.reload(); }); }
}
function startApp(role, init) {
    if (!APP_CONFIG.REQUIRE_LOGIN) { watchConnection(); init(); return; }

    const ov = document.createElement('div');
    ov.id = 'login-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:#1a365d;z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML =
        '<div style="background:#fff;border-radius:12px;padding:26px;width:100%;max-width:340px;box-shadow:0 10px 30px rgba(0,0,0,.3);">' +
        '<div style="font-size:1.3rem;font-weight:bold;color:#1a365d;text-align:center;margin-bottom:4px;">AUGUSTX POS</div>' +
        '<div style="text-align:center;color:#64748b;font-size:13px;margin-bottom:16px;">' + (role === 'admin' ? 'เข้าสู่ระบบเจ้าของร้าน (Admin)' : 'เข้าสู่ระบบพนักงาน') + '</div>' +
        '<div id="login-form">' +
        '<input id="login-email" type="email" placeholder="อีเมล" style="width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:10px;font-size:14px;">' +
        '<input id="login-pass" type="password" placeholder="รหัสผ่าน" style="width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:10px;font-size:14px;">' +
        '<button id="login-btn" style="width:100%;padding:12px;background:#689f38;color:#fff;border:none;border-radius:6px;font-weight:bold;font-size:15px;cursor:pointer;">เข้าสู่ระบบ</button>' +
        '</div>' +
        '<div id="login-msg" style="color:#ef4444;font-size:13px;text-align:center;margin-top:10px;min-height:18px;"></div>' +
        '<button id="login-logout" style="display:none;width:100%;margin-top:8px;padding:10px;background:#1a365d;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">ออกจากระบบ / ใช้บัญชีอื่น</button>' +
        '</div>';
    document.body.appendChild(ov);

    const msg = document.getElementById('login-msg');
    const form = document.getElementById('login-form');
    const logoutBtn = document.getElementById('login-logout');
    function doLogin() {
        msg.textContent = '';
        firebase.auth().signInWithEmailAndPassword(
            document.getElementById('login-email').value.trim(),
            document.getElementById('login-pass').value
        ).catch(function () { msg.textContent = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'; });
    }
    document.getElementById('login-btn').onclick = doLogin;
    document.getElementById('login-pass').onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    logoutBtn.onclick = function () { firebase.auth().signOut(); };

    let started = false;
    firebase.auth().onAuthStateChanged(function (user) {
        if (!user) { ov.style.display = 'flex'; form.style.display = 'block'; logoutBtn.style.display = 'none'; return; }
        const owner = String(APP_CONFIG.OWNER_EMAIL || '').toLowerCase();
        if (role === 'admin' && owner && String(user.email || '').toLowerCase() !== owner) {
            ov.style.display = 'flex'; form.style.display = 'none';
            msg.textContent = 'บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Admin';
            logoutBtn.style.display = 'block';
            return;
        }
        ov.style.display = 'none';
        if (!started) { started = true; watchConnection(); init(); }
    });
}

/* =====================================================================
   ส่วนที่ 2: บิล / ใบสั่งครัว / ยกเลิก / ใบเสร็จ / PDF / ส่งให้ลูกค้า
   - "บิล" เก็บที่ orders/{id}  (status: open = ยังไม่จ่าย, paid = จ่ายแล้ว, void = ยกเลิก)
   - "ใบสั่งครัว" เก็บที่ tickets/{id} (ครัวอ่านเฉพาะส่วนนี้) 1 บิลมีได้หลายใบ (สั่งเพิ่ม/ยกเลิกรายการ)
   ===================================================================== */

const VOID_REASONS = ['ลูกค้ายกเลิก', 'คีย์ผิด', 'ออร์เดอร์ซ้ำ', 'ของหมด', 'ลูกค้าไม่พอใจ', 'อื่นๆ'];

function arr(x) { return Array.isArray(x) ? x.filter(Boolean) : (x && typeof x === 'object' ? Object.values(x) : []); }
function fmtDate(ts) { const d = new Date(ts || Date.now()); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
function fmtDateTime(ts) { return fmtDate(ts) + ' ' + timeHHMM(ts); }
function newLid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function lineDetails(c) { return [c.variant].concat(arr(c.modifiers).map(function (m) { return m.option; })).filter(Boolean).join(' | '); }
function itemsSubtotal(items) { return arr(items).reduce(function (s, c) { return s + Number(c.price || 0) * Number(c.quantity || 0); }, 0); }

// บิลที่ยังไม่จ่าย (รวมบิลเก่าที่เคยบันทึกเป็น paid:false)
function isOpenBill(o) { return !!o && (o.status === 'open' || (o.paid === false && o.status !== 'void' && o.status !== 'paid')); }

function billCups(o) {
    const items = arr(o.items);
    if (items.some(function (i) { return i.cup !== undefined; })) {
        return items.reduce(function (s, i) { return s + (i.cup === false ? 0 : Number(i.quantity || 0)); }, 0);
    }
    return Number(o.cups || 0);
}
function billName(o) {
    if (o.source && o.source !== 'store' && o.source !== 'online') return o.source + (o.appOrderNo ? ' ' + o.appOrderNo : '');
    if (o.table) return 'โต๊ะ ' + o.table;
    if (o.customerName) return o.customerName;
    if (o.customer && String(o.customer).indexOf('โต๊ะ') === 0) return o.customer;
    return '';
}
function adjustCups(delta) {
    if (!delta) return;
    database.ref('inventory/cups').transaction(function (c) { return Math.max(0, (c || 0) + delta); });
}
function nextOrderNo(dk) {
    const tx = database.ref('counters/orders/' + dk).transaction(function (n) { return (n || 0) + 1; }).then(function (r) { return r.snapshot.val(); });
    const timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 3000); });
    return Promise.race([tx, timeout]).then(function (v) { return v != null ? v : 'T' + String(Date.now()).slice(-5); });
}

/* ---------- ใบสั่งครัว ---------- */
// kind: 'new' = ใบแรก, 'add' = สั่งเพิ่ม, 'cancel' = ยกเลิกรายการ/ยกเลิกบิล
function pushTicket(billId, bill, kind, items, round, note) {
    const ts = Date.now();
    const t = {
        billId: billId, orderNo: bill.orderNo || '', kind: kind, round: round || 1, note: note || '',
        items: arr(items).map(function (c) {
            return { name: c.name || '', variant: c.variant || '', modifiers: arr(c.modifiers), note: c.note || '', quantity: Number(c.quantity || 0) };
        }),
        name: billName(bill), source: bill.source || 'store', orderType: bill.orderType || '',
        status: 'pending', timestamp: ts, dayKey: dayKey(ts)
    };
    const r = database.ref('tickets').push(t);
    database.ref('orders/' + billId + '/tickets/' + r.key).set(true);
    return r.key;
}

/* ---------- สร้างบิลใหม่ + ใบสั่งครัวใบแรก ---------- */
async function createBill(d) {
    const now = Date.now(), dk = dayKey(now);
    const orderNo = await nextOrderNo(dk);
    const items = d.items.map(function (c) {
        return { lid: newLid(), itemId: c.itemId || '', name: c.name, variant: c.variant || '', price: Number(c.price || 0), quantity: c.quantity, modifiers: c.modifiers || [], note: c.note || '', cup: c.cup !== false, round: 1 };
    });
    const sub = itemsSubtotal(items);
    const bill = {
        orderNo: orderNo, customerName: d.customerName || '', customerPhone: d.customerPhone || '', customerEmail: d.customerEmail || '', customerId: d.customerId || '',
        table: d.table || '', appOrderNo: d.appOrderNo || '', items: items, subtotal: sub, discount: 0, total: sub,
        status: d.paidByApp ? 'paid' : 'open', paid: !!d.paidByApp, paymentMethod: d.paidByApp ? 'delivery' : '', cashReceived: 0, change: 0,
        source: d.source || 'store', orderType: d.orderType || '', rounds: 1,
        date: fmtDate(now), dayKey: dk, openedAt: now, timestamp: now
    };
    bill.cups = billCups(bill);
    bill.customer = billName(bill) || 'ทั่วไป';
    if (d.paidByApp) bill.paidAt = now;
    const ref = database.ref('orders').push(bill);
    ref.catch(function (e) { toast('บันทึกบิลไม่สำเร็จ: ' + e.message, false); });
    pushTicket(ref.key, bill, 'new', items, 1, '');
    adjustCups(-bill.cups);
    return { id: ref.key, bill: bill };
}

/* ---------- สั่งเพิ่มในบิลที่เปิดอยู่ ---------- */
function addItemsToBill(id, newItems) {
    let round = 0, added = [];
    return database.ref('orders/' + id).transaction(function (o) {
        if (o === null) return o;
        if (!isOpenBill(o)) return;
        round = (o.rounds || 1) + 1;
        added = arr(newItems).map(function (c) {
            return { lid: newLid(), itemId: c.itemId || '', name: c.name, variant: c.variant || '', price: Number(c.price || 0), quantity: c.quantity, modifiers: c.modifiers || [], note: c.note || '', cup: c.cup !== false, round: round };
        });
        o.items = arr(o.items).concat(added);
        o.subtotal = itemsSubtotal(o.items);
        o.total = Math.max(0, o.subtotal - Number(o.discount || 0));
        o.rounds = round;
        o.status = 'open'; o.paid = false;
        o.cups = billCups(o);
        return o;
    }).then(function (res) {
        const bill = res.snapshot.val();
        if (!res.committed || !bill) throw new Error('บิลนี้ปิดหรือถูกยกเลิกไปแล้ว');
        pushTicket(id, bill, 'add', added, round, '');
        adjustCups(-added.reduce(function (s, i) { return s + (i.cup === false ? 0 : i.quantity); }, 0));
        return { bill: bill, round: round, added: added };
    });
}

/* ---------- ลบรายการออกจากบิลที่เปิดอยู่ (ครัวเห็นป้ายแดง "ยกเลิก") ---------- */
function removeBillLine(id, lid) {
    let removed = null;
    return database.ref('orders/' + id).transaction(function (o) {
        removed = null;
        if (o === null) return o;
        if (!isOpenBill(o)) return;
        const items = arr(o.items);
        let i = items.findIndex(function (x) { return x.lid === lid; });
        if (i < 0 && /^idx:\d+$/.test(String(lid))) i = parseInt(String(lid).slice(4), 10);
        if (i < 0 || i >= items.length || items.length <= 1) return;
        removed = items.splice(i, 1)[0];
        o.items = items;
        o.subtotal = itemsSubtotal(items);
        o.total = Math.max(0, o.subtotal - Number(o.discount || 0));
        o.removedItems = arr(o.removedItems).concat([{ name: removed.name, quantity: removed.quantity, price: removed.price, at: Date.now() }]);
        o.cups = billCups(o);
        return o;
    }).then(function (res) {
        const bill = res.snapshot.val();
        if (!res.committed || !bill || !removed) throw new Error('ลบรายการไม่ได้ (บิลปิดแล้ว หรือเหลือรายการเดียว ให้ใช้ยกเลิกบิลแทน)');
        pushTicket(id, bill, 'cancel', [removed], bill.rounds || 1, 'ลบรายการ');
        adjustCups(removed.cup === false ? 0 : Number(removed.quantity || 0));
        return bill;
    });
}

/* ---------- ชำระเงิน (ปิดบิล) ---------- */
// p: { discountType:'amount'|'percent', discountValue, method:'cash'|'transfer', cashReceived:'' หรือตัวเลข }
function payBill(id, p) {
    return database.ref('orders/' + id).transaction(function (o) {
        if (o === null) return o;
        if (!isOpenBill(o)) return;
        const sub = itemsSubtotal(o.items);
        const val = Math.max(0, Number(p.discountValue) || 0);
        let disc = p.discountType === 'percent' ? sub * Math.min(val, 100) / 100 : val;
        disc = Math.round(Math.min(disc, sub));
        const total = sub - disc;
        const cash = p.method === 'cash';
        const rec = cash ? ((p.cashReceived === '' || p.cashReceived == null) ? total : Number(p.cashReceived)) : 0;
        if (cash && rec < total) return;
        const now = Date.now();
        o.subtotal = sub; o.discount = disc; o.discountType = p.discountType || 'amount'; o.discountValue = val; o.total = total;
        o.status = 'paid'; o.paid = true; o.paymentMethod = p.method;
        o.cashReceived = cash ? rec : 0; o.change = cash ? Math.max(0, rec - total) : 0;
        o.openedAt = o.openedAt || o.timestamp || now;
        o.paidAt = now; o.timestamp = now; o.dayKey = dayKey(now); o.date = fmtDate(now);
        return o;
    }).then(function (res) {
        const bill = res.snapshot.val();
        if (!res.committed || !bill || bill.status !== 'paid') throw new Error('ชำระไม่สำเร็จ: บิลถูกปิดหรือยกเลิกไปแล้ว หรือรับเงินไม่พอ');
        return bill;
    });
}

/* ---------- ยกเลิกบิล ---------- */
// opts: { reason, by:'cashier'|'admin', refund:{status:'refunded'|'pending', method:'cash'|'transfer'|''} }
function voidBill(id, bill, opts) {
    const wasOpen = isOpenBill(bill);
    const base = 'orders/' + id + '/', upd = {};
    upd[base + 'status'] = 'void';
    upd[base + 'voidReason'] = opts.reason || '';
    upd[base + 'voidedBy'] = opts.by || '';
    upd[base + 'voidedAt'] = Date.now();
    upd[base + 'voidedWasPaid'] = !wasOpen;
    if (!wasOpen && opts.refund) {
        upd[base + 'refund'] = { status: opts.refund.status, method: opts.refund.method || '', amount: Number(bill.total || 0), at: Date.now() };
    }
    return database.ref().update(upd).then(function () {
        adjustCups(billCups(bill));
        if (wasOpen) {
            Object.keys(bill.tickets || {}).forEach(function (k) {
                database.ref('tickets/' + k + '/status').transaction(function (s) { return (s === 'pending' || s === 'cooking') ? 'canceled' : s; });
            });
            pushTicket(id, bill, 'cancel', arr(bill.items), bill.rounds || 1, 'ยกเลิกทั้งบิล: ' + (opts.reason || ''));
        }
    });
}

/* ---------- หน้าต่างย่อยที่ใช้ร่วมกัน (CSS ฉีดเอง ไม่ต้องแก้ CSS ของหน้า) ---------- */
function injectSharedCss() {
    if (document.getElementById('sx-css')) return;
    const st = document.createElement('style');
    st.id = 'sx-css';
    st.textContent =
        '.sx-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3500;display:flex;align-items:center;justify-content:center;padding:12px}' +
        '.sx-box{background:#fff;width:100%;max-width:440px;max-height:96vh;max-height:96dvh;overflow-y:auto;border-radius:12px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.3);font-family:inherit}' +
        '.sx-box label{display:block;font-weight:bold;font-size:12px;color:#555;margin:10px 0 4px}' +
        '.sx-box input,.sx-box textarea{width:100%;padding:11px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;font-family:inherit}' +
        '.sx-title{font-size:1.1rem;font-weight:bold;color:#1a365d;margin-bottom:6px}' +
        '.sx-hint{font-size:12px;color:#64748b;margin:8px 0}' +
        '.sx-warn{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:bold;margin:8px 0}' +
        '.sx-chips{display:flex;flex-wrap:wrap;gap:8px}' +
        '.sx-chip{padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-weight:bold;font-size:13px;cursor:pointer;color:#334155;font-family:inherit}' +
        '.sx-chip.on{background:#1a365d;color:#fff;border-color:#1a365d}' +
        '.sx-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}' +
        '.sx-btn{padding:13px 10px;border:none;border-radius:8px;font-weight:bold;font-size:14px;color:#fff;cursor:pointer;font-family:inherit}' +
        '.sx-btn:disabled{opacity:.45;cursor:not-allowed}' +
        '.sx-blue{background:#1a365d}.sx-green{background:#689f38}.sx-red{background:#ef4444}.sx-gray{background:#64748b}' +
        '.sx-close{width:100%;margin-top:10px;background:#e2e8f0;color:#334155}' +
        '.sx-row{display:flex;gap:8px;margin-top:14px}.sx-row .sx-btn{flex:1}';
    document.head.appendChild(st);
}
function sxModal(html) {
    injectSharedCss();
    const ov = document.createElement('div');
    ov.className = 'sx-overlay';
    ov.innerHTML = '<div class="sx-box">' + html + '</div>';
    document.body.appendChild(ov);
    return ov;
}

// หน้าต่างยกเลิกบิล: เลือกเหตุผล (บังคับ) + ถ้าจ่ายแล้วต้องระบุสถานะคืนเงิน
function openVoidDialog(id, bill, by, onDone) {
    const paid = !isOpenBill(bill);
    const refundable = paid && (bill.paymentMethod === 'cash' || bill.paymentMethod === 'transfer');
    let reason = '', refund = null;
    const ov = sxModal(
        '<div class="sx-title">ยกเลิกบิล #' + esc(bill.orderNo || '') + ' ?</div>' +
        '<div class="sx-hint">ยอด ' + money(bill.total) + (paid ? ' (ชำระแล้ว)' : ' (ยังไม่ชำระ)') + '</div>' +
        (paid ? '<div class="sx-warn">บิลนี้ชำระแล้ว ยกเลิกแล้วอาจต้องคืนเงินลูกค้า</div>' : '') +
        '<label>เหตุผล (จำเป็น)</label><div class="sx-chips" id="vd-reasons">' +
        VOID_REASONS.map(function (r) { return '<button type="button" class="sx-chip" data-r="' + esc(r) + '">' + esc(r) + '</button>'; }).join('') + '</div>' +
        '<div id="vd-other" style="display:none"><input id="vd-other-text" placeholder="ระบุเหตุผล"></div>' +
        (refundable ? '<label>การคืนเงิน (จำเป็น)</label><div class="sx-chips" id="vd-refunds">' +
            '<button type="button" class="sx-chip" data-s="refunded" data-m="cash">คืนเงินสดแล้ว</button>' +
            '<button type="button" class="sx-chip" data-s="refunded" data-m="transfer">โอนคืนแล้ว</button>' +
            '<button type="button" class="sx-chip" data-s="pending" data-m="">ยังไม่ได้คืน</button></div>' : '') +
        '<div class="sx-row"><button class="sx-btn sx-gray" id="vd-no">ไม่ยกเลิก</button><button class="sx-btn sx-red" id="vd-yes">ยืนยันยกเลิกบิล</button></div>'
    );
    ov.querySelectorAll('#vd-reasons .sx-chip').forEach(function (b) {
        b.onclick = function () {
            ov.querySelectorAll('#vd-reasons .sx-chip').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on'); reason = b.dataset.r;
            ov.querySelector('#vd-other').style.display = reason === 'อื่นๆ' ? 'block' : 'none';
        };
    });
    ov.querySelectorAll('#vd-refunds .sx-chip').forEach(function (b) {
        b.onclick = function () {
            ov.querySelectorAll('#vd-refunds .sx-chip').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on'); refund = { status: b.dataset.s, method: b.dataset.m };
        };
    });
    ov.querySelector('#vd-no').onclick = function () { ov.remove(); };
    ov.querySelector('#vd-yes').onclick = function () {
        let r = reason;
        if (!r) return toast('เลือกเหตุผลก่อน', false);
        if (r === 'อื่นๆ') { r = ov.querySelector('#vd-other-text').value.trim(); if (!r) return toast('ระบุเหตุผล', false); }
        if (refundable && !refund) return toast('เลือกสถานะการคืนเงินก่อน', false);
        ov.querySelector('#vd-yes').disabled = true;
        voidBill(id, bill, { reason: r, by: by, refund: refund }).then(function () {
            ov.remove(); toast('ยกเลิกบิลแล้ว');
            if (onDone) onDone();
        }).catch(function (e) { ov.querySelector('#vd-yes').disabled = false; toast('ไม่สำเร็จ: ' + e.message, false); });
    };
}

/* =====================================================================
   ใบเสร็จ: โมเดลเดียว ใช้ได้ทั้งพิมพ์ / รูป-PDF / ข้อความ
   ===================================================================== */
const RCPT = { s: { paperSize: '58mm', shopName: 'AUGUSTX', shopSub: 'HOME COFFEE RECIPE', address: '', phone: '', footer: 'ขอบคุณที่ใช้บริการ' }, logo: '', started: false };
function receiptInit() {
    if (RCPT.started) return;
    RCPT.started = true;
    database.ref('settings/printer').on('value', function (snap) {
        const p = snap.val() || {};
        Object.keys(p).forEach(function (k) { if (p[k] !== '' && p[k] != null) RCPT.s[k] = p[k]; });
        RCPT.s.address = p.address || ''; RCPT.s.phone = p.phone || '';
        if (typeof onReceiptSettings === 'function') onReceiptSettings(RCPT.s);
    });
    database.ref('store_logo').on('value', function (s) { RCPT.logo = s.val() || ''; });
}

function receiptModel(o, copy) {
    const S = RCPT.s, m = [], items = arr(o.items);
    if (RCPT.logo) m.push({ t: 'logo' });
    m.push({ t: 'c', x: S.shopName, b: 1, z: 18 });
    if (S.shopSub) m.push({ t: 'c', x: S.shopSub });
    if (S.address) m.push({ t: 'c', x: S.address });
    if (S.phone) m.push({ t: 'c', x: 'โทร ' + S.phone });
    if (copy) { m.push({ t: 'c', x: '*** สำเนา (COPY) ***', b: 1, z: 15 }); m.push({ t: 'c', x: 'พิมพ์เมื่อ ' + fmtDateTime(Date.now()) }); }
    if (o.status === 'void') m.push({ t: 'c', x: '*** ยกเลิก (VOID) ***', b: 1, z: 16 });
    m.push({ t: 'hr' });
    m.push({ t: 'r', l: 'บิล #' + (o.orderNo || '-'), r: fmtDateTime(o.paidAt || o.timestamp) });
    const where = o.table ? 'โต๊ะ ' + o.table : (o.source && o.source !== 'store' ? o.source : '');
    if (o.orderType || where) m.push({ t: 'r', l: o.orderType || '', r: where });
    if (o.appOrderNo) m.push({ t: 'r', l: 'เลขออร์เดอร์แอป', r: String(o.appOrderNo) });
    if (o.customerName) m.push({ t: 'r', l: 'ลูกค้า', r: o.customerName });
    m.push({ t: 'hr' });
    items.forEach(function (c) {
        m.push({ t: 'r', l: c.name + ' x' + c.quantity, r: (Number(c.price || 0) * Number(c.quantity || 0)).toLocaleString() });
        const d = lineDetails(c);
        if (d) m.push({ t: 'i', x: d });
        if (c.note) m.push({ t: 'i', x: '* ' + c.note });
    });
    m.push({ t: 'hr' });
    const sub = o.subtotal != null ? o.subtotal : itemsSubtotal(items);
    m.push({ t: 'r', l: 'รวม', r: Number(sub).toLocaleString() });
    if (Number(o.discount) > 0) m.push({ t: 'r', l: 'ส่วนลด', r: '-' + Number(o.discount).toLocaleString() });
    m.push({ t: 'r', l: 'ยอดสุทธิ', r: Number(o.total || 0).toLocaleString() + ' ₭', b: 1, z: 16 });
    if (o.paymentMethod === 'cash') {
        m.push({ t: 'r', l: 'เงินสด', r: Number(o.cashReceived || 0).toLocaleString() });
        m.push({ t: 'r', l: 'เงินทอน', r: Number(o.change || 0).toLocaleString() });
    } else if (o.paymentMethod === 'transfer') m.push({ t: 'r', l: 'ชำระโดย', r: 'โอนเงิน QR' });
    else if (o.paymentMethod === 'delivery') m.push({ t: 'r', l: 'ชำระโดย', r: 'แอป Delivery' });
    m.push({ t: 'hr' });
    m.push({ t: 'c', x: S.footer || '' });
    return m;
}

function receiptText(o) {
    const S = RCPT.s;
    let t = S.shopName + '\n' + 'บิล #' + (o.orderNo || '-') + '  ' + fmtDateTime(o.paidAt || o.timestamp) + '\n----------------\n';
    arr(o.items).forEach(function (c) {
        const d = lineDetails(c);
        t += c.name + (d ? ' (' + d + ')' : '') + ' x' + c.quantity + '  ' + (Number(c.price || 0) * Number(c.quantity || 0)).toLocaleString() + '\n';
    });
    t += '----------------\n';
    if (Number(o.discount) > 0) t += 'ส่วนลด -' + Number(o.discount).toLocaleString() + '\n';
    t += 'ยอดสุทธิ ' + Number(o.total || 0).toLocaleString() + ' ₭\n';
    if (S.footer) t += '\n' + S.footer;
    return t;
}

/* ---------- พิมพ์ใบเสร็จ ---------- */
function ensurePrintArea() {
    let a = document.getElementById('print-area');
    if (a) return a;
    a = document.createElement('div'); a.id = 'print-area'; document.body.appendChild(a);
    const st = document.createElement('style'); st.id = 'print-css';
    st.textContent = '#print-area{display:none}@media print{html,body{height:auto!important;overflow:visible!important;background:#fff!important}' +
        'body>*:not(#print-area){display:none!important}#print-area{display:block;margin:0 auto;color:#000;line-height:1.4;font-size:12px}' +
        '.r-c{text-align:center}.r-hr{border-top:1px dashed #000;margin:6px 0}.r-r{display:flex;justify-content:space-between;gap:6px}' +
        '.r-b{font-weight:bold}.r-i{padding-left:8px;font-size:11px}#print-area img{max-width:100%;max-height:70px}}';
    document.head.appendChild(st);
    const ps = document.createElement('style'); ps.id = 'print-page-style'; document.head.appendChild(ps);
    return a;
}
// copy = true จะพิมพ์คำว่า "สำเนา (COPY)"; id = ใส่เพื่อนับจำนวนครั้งที่พิมพ์
function printReceipt(o, copy, id) {
    const area = ensurePrintArea();
    const narrow = RCPT.s.paperSize !== '80mm';
    let h = '';
    receiptModel(o, copy).forEach(function (e) {
        const z = e.z ? ' style="font-size:' + e.z + 'px"' : '';
        if (e.t === 'logo') h += '<div class="r-c"><img src="' + esc(RCPT.logo) + '"></div>';
        else if (e.t === 'hr') h += '<div class="r-hr"></div>';
        else if (e.t === 'c') h += '<div class="r-c' + (e.b ? ' r-b' : '') + '"' + z + '>' + esc(e.x) + '</div>';
        else if (e.t === 'i') h += '<div class="r-i">' + esc(e.x) + '</div>';
        else if (e.t === 'r') h += '<div class="r-r' + (e.b ? ' r-b' : '') + '"' + z + '><span>' + esc(e.l) + '</span><span>' + esc(e.r) + '</span></div>';
    });
    area.style.width = narrow ? '48mm' : '72mm';
    area.innerHTML = h;
    document.getElementById('print-page-style').textContent = '@page{size:' + (narrow ? '58mm' : '80mm') + ' auto;margin:2mm}';
    if (id) database.ref('orders/' + id + '/printCount').transaction(function (n) { return (n || 0) + 1; });
    setTimeout(function () { window.print(); }, 150);
}

/* ---------- ใบเสร็จเป็นรูป -> PDF ---------- */
async function receiptCanvas(o, copy) {
    const wide = RCPT.s.paperSize === '80mm';
    const W = wide ? 576 : 384, PAD = 14, SC = 2;
    const F = '"Noto Sans Lao","Noto Sans Thai","Noto Sans",sans-serif';
    const model = receiptModel(o, copy);
    let logoImg = null;
    if (RCPT.logo) {
        logoImg = await new Promise(function (res) { const im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = RCPT.logo; });
    }
    try { if (document.fonts && document.fonts.load) { await document.fonts.load('14px "Noto Sans Lao"'); await document.fonts.load('bold 14px "Noto Sans Lao"'); } } catch (e) { }
    function layout(ctx, draw) {
        let y = PAD; const cw = W - PAD * 2;
        const font = function (b, z) { return (b ? 'bold ' : '') + (z || 14) + 'px ' + F; };
        function wrap(text, maxW, f) {
            ctx.font = f; const out = []; let cur = '';
            for (const ch of String(text == null ? '' : text)) {
                if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch;
            }
            out.push(cur); return out;
        }
        model.forEach(function (e) {
            if (e.t === 'logo') {
                if (logoImg) {
                    const h = Math.min(70, logoImg.height * (Math.min(cw, 200) / logoImg.width)), w = logoImg.width * (h / logoImg.height);
                    if (draw) ctx.drawImage(logoImg, (W - w) / 2, y, w, h);
                    y += h + 6;
                }
            } else if (e.t === 'hr') {
                if (draw) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(PAD, y + 4); ctx.lineTo(W - PAD, y + 4); ctx.stroke(); ctx.setLineDash([]); }
                y += 10;
            } else if (e.t === 'c' || e.t === 'i') {
                const z = e.z || (e.t === 'i' ? 12 : 14), f = font(e.b, z), lh = Math.round(z * 1.45), ind = e.t === 'i' ? 10 : 0;
                wrap(e.x, cw - ind, f).forEach(function (L) {
                    if (draw) {
                        ctx.font = f; ctx.fillStyle = '#000';
                        if (e.t === 'c') { ctx.textAlign = 'center'; ctx.fillText(L, W / 2, y + z); } else { ctx.textAlign = 'left'; ctx.fillText(L, PAD + ind, y + z); }
                    }
                    y += lh;
                });
            } else if (e.t === 'r') {
                const z = e.z || 14, f = font(e.b, z), lh = Math.round(z * 1.45);
                ctx.font = f; const rw = ctx.measureText(e.r || '').width;
                const lines = wrap(e.l, Math.max(60, cw - rw - 8), f);
                lines.forEach(function (L, idx) {
                    if (draw) {
                        ctx.font = f; ctx.fillStyle = '#000';
                        ctx.textAlign = 'left'; ctx.fillText(L, PAD, y + z);
                        if (idx === lines.length - 1) { ctx.textAlign = 'right'; ctx.fillText(e.r || '', W - PAD, y + z); }
                    }
                    y += lh;
                });
            }
        });
        return y + PAD;
    }
    const H = Math.ceil(layout(document.createElement('canvas').getContext('2d'), false));
    const cv = document.createElement('canvas'); cv.width = W * SC; cv.height = H * SC;
    const ctx = cv.getContext('2d'); ctx.scale(SC, SC); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    layout(ctx, true);
    return cv;
}

// สร้างไฟล์ PDF 1 หน้า จากรูป JPEG (ไม่ต้องใช้ไลบรารีภายนอก)
function buildPdf(jpeg, wPx, hPx, wPt, hPt) {
    const enc = new TextEncoder(), parts = [], offsets = []; let off = 0;
    function push(u8) { parts.push(u8); off += u8.length; }
    function str(s) { push(enc.encode(s)); }
    function obj(n, body) { offsets[n] = off; str(n + ' 0 obj\n' + body + '\nendobj\n'); }
    const w = wPt.toFixed(2), h = hPt.toFixed(2);
    str('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4] = off;
    str('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + wPx + ' /Height ' + hPx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    push(jpeg); str('\nendstream\nendobj\n');
    const content = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q';
    obj(5, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    const xrefPos = off;
    let x = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    str(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF');
    const out = new Uint8Array(off); let p = 0;
    parts.forEach(function (u) { out.set(u, p); p += u.length; });
    return out;
}
async function receiptPdfFile(o, copy) {
    const cv = await receiptCanvas(o, copy);
    const blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.92); });
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const wPt = RCPT.s.paperSize === '80mm' ? 226.8 : 164.4;
    const pdf = buildPdf(jpeg, cv.width, cv.height, wPt, wPt * cv.height / cv.width);
    return new File([pdf], 'receipt-' + (o.orderNo || 'bill') + '.pdf', { type: 'application/pdf' });
}

/* ---------- ส่งใบเสร็จให้ลูกค้า (แชร์ไฟล์ + WhatsApp + อีเมล) ---------- */
function waNumber(raw) {
    let d = String(raw || '').replace(/[^\d]/g, '');
    if (!d) return '';
    const cc = String(APP_CONFIG.COUNTRY_CODE || '856');
    if (d.indexOf('00') === 0) return d.slice(2);
    if (d.charAt(0) === '0') return cc + d.slice(1);
    if (d.indexOf(cc) === 0 && d.length >= 11) return d;
    return cc + d;
}
function openShareModal(o) {
    const ov = sxModal(
        '<div class="sx-title">ส่งใบเสร็จให้ลูกค้า (บิล #' + esc(o.orderNo || '') + ')</div>' +
        '<label>เบอร์ WhatsApp</label><input id="sx-phone" type="tel" inputmode="tel" value="' + esc(o.customerPhone || '') + '" placeholder="เช่น 020 5555 5555">' +
        '<label>อีเมล</label><input id="sx-email" type="email" inputmode="email" value="' + esc(o.customerEmail || '') + '" placeholder="name@example.com">' +
        '<div class="sx-hint" id="sx-state">กำลังเตรียมไฟล์ PDF...</div>' +
        '<div class="sx-grid">' +
        '<button class="sx-btn sx-blue" id="sx-share" disabled>📎 แชร์ไฟล์ PDF</button>' +
        '<button class="sx-btn sx-gray" id="sx-dl" disabled>⬇️ ดาวน์โหลด PDF</button>' +
        '<button class="sx-btn sx-green" id="sx-wa">💬 WhatsApp (ข้อความ)</button>' +
        '<button class="sx-btn sx-gray" id="sx-mail">✉️ อีเมล (ข้อความ)</button></div>' +
        '<button class="sx-btn sx-close" id="sx-close">ปิด</button>'
    );
    let file = null;
    const $ = function (s) { return ov.querySelector(s); };
    receiptPdfFile(o, false).then(function (f) {
        file = f; $('#sx-share').disabled = false; $('#sx-dl').disabled = false;
        $('#sx-state').textContent = 'พร้อมส่ง: บนมือถือกด "แชร์ไฟล์ PDF" แล้วเลือก WhatsApp หรืออีเมล บนคอมกด "ดาวน์โหลด" แล้วแนบเอง';
    }).catch(function (e) { $('#sx-state').textContent = 'สร้างไฟล์ไม่สำเร็จ: ' + e.message + ' (ยังส่งแบบข้อความได้)'; });
    function download() {
        const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }
    $('#sx-dl').onclick = download;
    $('#sx-share').onclick = function () {
        if (!file) return;
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'ใบเสร็จ #' + (o.orderNo || ''), text: receiptText(o) }).catch(function (e) { if (e && e.name !== 'AbortError') toast('แชร์ไม่สำเร็จ ลองดาวน์โหลดแทน', false); });
        } else { download(); toast('อุปกรณ์นี้แชร์ไฟล์ตรงไม่ได้ ดาวน์โหลดแล้ว ให้แนบเองในแอป'); }
    };
    $('#sx-wa').onclick = function () {
        const n = waNumber($('#sx-phone').value);
        if (!n) return toast('ใส่เบอร์ WhatsApp ก่อน', false);
        window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(receiptText(o)), '_blank');
    };
    $('#sx-mail').onclick = function () {
        const e = $('#sx-email').value.trim();
        if (!e) return toast('ใส่อีเมลก่อน', false);
        window.location.href = 'mailto:' + encodeURIComponent(e).replace(/%40/g, '@') + '?subject=' + encodeURIComponent('ใบเสร็จ ' + RCPT.s.shopName + ' #' + (o.orderNo || '')) + '&body=' + encodeURIComponent(receiptText(o));
    };
    $('#sx-close').onclick = function () { ov.remove(); };
}
