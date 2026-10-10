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
    LOW_CUP_ALERT: 50
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
    return String(text || '').split(',').map(function (part) {
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
    const opts = Array.isArray(m.options) ? m.options : Object.values(m.options || {});
    m.options = opts.filter(Boolean);
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
