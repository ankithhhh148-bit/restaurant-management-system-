#!/usr/bin/env python3
"""
Web backend for the Restaurant Management System.
Uses the DB class from restaurant_management_system.py (same database, same data).
Run:  python rms_server.py   ->  open http://localhost:8000
Set RMS_PORT to use another port. No extra installs needed (Python standard library only).
Customer ordering uses temporary guest sessions; optional customer accounts are limited to the menu and their own orders.
"""
import base64, binascii, csv, io, json, os, re, secrets, sqlite3, time, webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from restaurant_management_system import DB, hash_pw, now, GST_RATE, RESTAURANT

# ---------------------------------------------------------------- settings (edit freely)
PORT = int(os.environ.get("RMS_PORT", "8000"))
HOST = os.environ.get("RMS_HOST", "127.0.0.1")   # set RMS_HOST=0.0.0.0 to let tablets on your Wi-Fi connect
ADDRESS = ""            # shown on receipts, e.g. "12 Main Street, Your City"
PHONE = ""              # e.g. "+91 98765 43210"
GSTIN = ""              # e.g. "03ABCDE1234F1Z5"
SESSION_HOURS = 8
MAX_FAILS, FAIL_WINDOW = 5, 300                  # 5 wrong passwords per 5 minutes -> temporary lock

db = DB()
sessions = {}          # token -> (username, role, expires_at)
fails = {}             # username -> [timestamps]
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
STOREFRONT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rms_storefront.json")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
}
TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "application/javascript; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8"}
INFO = dict(restaurant=RESTAURANT, address=ADDRESS, phone=PHONE, gstin=GSTIN)

DEFAULT_STOREFRONT = {
    "restaurant": RESTAURANT,
    "banner_kicker": "GOOD FOOD, MADE FRESH",
    "banner_title": "What are you craving?",
    "banner_subtitle": "Choose your table, pick your favourites, and we’ll take care of the rest.",
    "banner_image": "",
    "logo_image": "",
    "menu_images": {},
    "colors": {
        "background": "#f4efe2",
        "surface": "#fffaf0",
        "header": "#c9a23b",
        "banner": "#d0ac49",
        "primary": "#b51f2b",
        "heading": "#a51b26",
        "text": "#342817",
    },
}


def storefront_config():
    config = dict(DEFAULT_STOREFRONT)
    config["colors"] = dict(DEFAULT_STOREFRONT["colors"])
    config["menu_images"] = {}
    try:
        with open(STOREFRONT_FILE, encoding="utf-8") as fh:
            saved = json.load(fh)
    except FileNotFoundError:
        return config
    if not isinstance(saved, dict):
        raise ValueError("Storefront settings must be a JSON object")
    for key in ("restaurant", "banner_kicker", "banner_title", "banner_subtitle", "banner_image", "logo_image"):
        if isinstance(saved.get(key), str):
            config[key] = saved[key]
    if isinstance(saved.get("colors"), dict):
        config["colors"].update(saved["colors"])
    if isinstance(saved.get("menu_images"), dict):
        config["menu_images"] = saved["menu_images"]
    return config


def save_storefront(config):
    temp = STOREFRONT_FILE + "." + secrets.token_hex(8) + ".tmp"
    try:
        with open(temp, "w", encoding="utf-8") as fh:
            json.dump(config, fh, ensure_ascii=False, indent=2)
        os.replace(temp, STOREFRONT_FILE)
    finally:
        if os.path.exists(temp):
            os.remove(temp)


def restaurant_info():
    return dict(INFO, restaurant=storefront_config()["restaurant"])


class ApiError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg); self.code = code


def items_of(oid):
    rows = db.q("""SELECT m.name,SUM(oi.qty),oi.price,SUM(oi.qty*oi.price) FROM order_items oi
                   JOIN menu m ON m.id=oi.menu_id WHERE oi.order_id=? GROUP BY oi.menu_id,oi.price""", (oid,))
    return [dict(name=n, qty=q, price=p, amount=t) for n, q, p, t in rows]


def open_order(table_id):
    r = db.q("SELECT id FROM orders WHERE table_id=? AND status='Open'", (table_id,))
    return r[0][0] if r else None


def valid_date(s):
    try: datetime.strptime(s, "%Y-%m-%d"); return True
    except (TypeError, ValueError): return False


def bill_dict(bid, cashier=None):
    r = db.q("""SELECT b.id,b.order_id,o.table_id,b.subtotal,b.discount,b.gst,b.total,b.method,b.paid_at,o.taken_by
                FROM bills b JOIN orders o ON o.id=b.order_id WHERE b.id=?""", (bid,))
    if not r: raise ApiError("Bill not found", 404)
    i, oid, tid, sub, disc, gst, tot, meth, paid, by = r[0]
    return dict(bill_id=i, order_id=oid, table_id=tid, items=items_of(oid), subtotal=sub, discount=disc,
                discount_pct=round(disc / sub * 100, 2) if sub else 0, gst=gst, total=tot, method=meth,
                paid_at=paid, cashier=cashier or by, gst_rate=round(GST_RATE * 100, 2), **restaurant_info())


def api(m, p, b, u, qs):
    def admin():
        if u[1] != "admin": raise ApiError("Admin access required", 403)

    if u[1] == "customer" and (m, p) not in {
        ("GET", "/api/me"), ("GET", "/api/storefront"), ("GET", "/api/menu"), ("GET", "/api/tables"),
        ("GET", "/api/orders"), ("POST", "/api/orders/add"), ("POST", "/api/orders/remove"),
    }:
        raise ApiError("Customer access is limited to the menu and ordering", 403)

    def text(key, label, maxlen=60):
        v = str(b.get(key, "")).strip()
        if not v: raise ApiError(f"{label} is required")
        if len(v) > maxlen: raise ApiError(f"{label} is too long")
        return v

    def number(key, label, lo, hi, cast=float):
        try: v = cast(b.get(key))
        except (TypeError, ValueError): raise ApiError(f"Enter a valid {label}")
        if not lo <= v <= hi: raise ApiError(f"{label} must be between {lo} and {hi}")
        return v

    # ---- session / account
    if p == "/api/me":
        return dict(user=u[0], role=u[1], gst_rate=round(GST_RATE * 100, 2), **restaurant_info())
    if p == "/api/storefront" and m == "GET":
        return storefront_config()
    if p == "/api/storefront" and m == "POST":
        admin()
        config = storefront_config()
        for key, label, limit in (
            ("restaurant", "Store name", 60),
            ("banner_kicker", "Banner kicker", 50),
            ("banner_title", "Banner heading", 100),
            ("banner_subtitle", "Banner message", 240),
        ):
            value = str(b.get(key, "")).strip()
            if not value: raise ApiError(f"{label} is required")
            if len(value) > limit: raise ApiError(f"{label} must be {limit} characters or fewer")
            config[key] = value
        color_names = ("background", "surface", "header", "banner", "primary", "heading", "text")
        colors = b.get("colors")
        if not isinstance(colors, dict): raise ApiError("Choose all storefront colors")
        for key in color_names:
            value = colors.get(key)
            if not isinstance(value, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
                raise ApiError(f"Invalid color: {key}")
            config["colors"][key] = value
        save_storefront(config)
        return config
    if p == "/api/storefront/image" and m == "POST":
        admin()
        kind = b.get("kind")
        menu_id = None
        if kind == "menu":
            try: menu_id = int(b.get("menu_id"))
            except (TypeError, ValueError): raise ApiError("Choose a valid menu item")
            if not db.q("SELECT 1 FROM menu WHERE id=?", (menu_id,)):
                raise ApiError("Menu item not found", 404)
        elif kind not in ("banner", "logo"):
            raise ApiError("Unknown image type")
        mime = b.get("mime")
        if mime not in IMAGE_TYPES: raise ApiError("Use a JPG, PNG or WebP image")
        try: image = base64.b64decode(b.get("data", ""), validate=True)
        except (binascii.Error, ValueError): raise ApiError("Invalid image data")
        if not image or len(image) > MAX_IMAGE_BYTES:
            raise ApiError("Image must be between 1 byte and 5 MB")
        extension, check_signature = IMAGE_TYPES[mime]
        if not check_signature(image): raise ApiError("The image contents do not match its file type")
        upload_dir = os.path.join(STATIC, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        filename = secrets.token_hex(16) + extension
        image_path = os.path.join(upload_dir, filename)
        with open(image_path, "xb") as fh:
            fh.write(image)
        config = storefront_config()
        image_url = "/uploads/" + filename
        if kind == "menu":
            config["menu_images"][str(menu_id)] = image_url
        else:
            config[kind + "_image"] = image_url
        try:
            save_storefront(config)
        except OSError:
            os.remove(image_path)
            raise
        return dict(url=image_url, storefront=config)
    if p == "/api/storefront/image/remove" and m == "POST":
        admin()
        kind = b.get("kind")
        config = storefront_config()
        if kind == "menu":
            try: menu_id = str(int(b.get("menu_id")))
            except (TypeError, ValueError): raise ApiError("Choose a valid menu item")
            config["menu_images"].pop(menu_id, None)
        elif kind in ("banner", "logo"):
            config[kind + "_image"] = ""
        else:
            raise ApiError("Unknown image type")
        save_storefront(config)
        return config
    if p == "/api/password":
        row = db.q("SELECT salt,pw_hash FROM users WHERE username=?", (u[0],))[0]
        if hash_pw(str(b.get("old", "")), row[0]) != row[1]: raise ApiError("Current password is wrong")
        new = str(b.get("new", ""))
        if len(new) < 6: raise ApiError("New password must be at least 6 characters")
        salt = secrets.token_hex(8)
        db.x("UPDATE users SET salt=?,pw_hash=? WHERE username=?", (salt, hash_pw(new, salt), u[0]))
        return {"ok": True}

    # ---- menu
    if p == "/api/menu" and m == "GET":
        if u[1] == "customer":
            return [dict(id=i, name=n, category=c, price=pr, available=a) for i, n, c, pr, a in
                    db.q("SELECT id,name,category,price,available FROM menu WHERE available=1 ORDER BY category,id")]
        return [dict(id=i, name=n, category=c, price=pr, available=a) for i, n, c, pr, a in
                db.q("SELECT id,name,category,price,available FROM menu ORDER BY category,id")]
    if p == "/api/menu" and m == "POST":
        admin()
        name, cat, price = text("name", "Name"), text("category", "Category", 30), number("price", "price", 0.01, 100000)
        try: db.x("INSERT INTO menu(name,category,price) VALUES(?,?,?)", (name, cat, price))
        except sqlite3.IntegrityError: raise ApiError("Item already exists")
        return {"ok": True}
    if p == "/api/menu/update":
        admin()
        name, cat, price = text("name", "Name"), text("category", "Category", 30), number("price", "price", 0.01, 100000)
        try: db.x("UPDATE menu SET name=?,category=?,price=? WHERE id=?", (name, cat, price, int(b["id"])))
        except sqlite3.IntegrityError: raise ApiError("Another item already has that name")
        return {"ok": True}
    if p == "/api/menu/toggle":
        admin(); db.x("UPDATE menu SET available=1-available WHERE id=?", (int(b["id"]),)); return {"ok": True}
    if p == "/api/menu/delete":
        admin(); mid = int(b["id"])
        if db.q("SELECT 1 FROM order_items WHERE menu_id=? LIMIT 1", (mid,)):
            raise ApiError("This item has sales history. Hide it instead of deleting.")
        db.x("DELETE FROM menu WHERE id=?", (mid,)); return {"ok": True}

    # ---- tables
    if p == "/api/tables" and m == "GET":
        if u[1] == "customer":
            return [dict(id=i, seats=s, status=st) for i, s, st in db.q(
                """SELECT id,seats,status FROM tables
                   WHERE status='Free' OR id IN
                   (SELECT table_id FROM orders WHERE taken_by=? AND status='Open')""", (u[0],))]
        return [dict(id=i, seats=s, status=st) for i, s, st in db.q("SELECT id,seats,status FROM tables")]
    if p == "/api/tables/add":
        admin(); seats = number("seats", "seats", 1, 30, int)
        return {"id": db.x("INSERT INTO tables(seats) VALUES(?)", (seats,)).lastrowid}
    if p == "/api/tables/delete":
        admin(); tid = int(b["id"])
        row = db.q("SELECT status FROM tables WHERE id=?", (tid,))
        if not row: raise ApiError("No such table")
        if row[0][0] != "Free": raise ApiError("Table is in use")
        if db.q("SELECT 1 FROM orders WHERE table_id=? LIMIT 1", (tid,)) or \
           db.q("SELECT 1 FROM reservations WHERE table_id=? LIMIT 1", (tid,)):
            raise ApiError("This table has order or reservation history and cannot be deleted")
        db.x("DELETE FROM tables WHERE id=?", (tid,)); return {"ok": True}

    # ---- orders
    if p == "/api/orders" and m == "GET":
        out = []
        query = "SELECT id,table_id,created,taken_by FROM orders WHERE status='Open'"
        args = ()
        if u[1] == "customer":
            query += " AND taken_by=?"
            args = (u[0],)
        for oid, tid, created, by in db.q(query, args):
            it = items_of(oid)
            out.append(dict(id=oid, table_id=tid, created=created, taken_by=by, items=it,
                            subtotal=sum(i["amount"] for i in it)))
        return out
    if p == "/api/orders/add":
        tid, mid, qty = int(b["table_id"]), int(b["menu_id"]), int(b.get("qty", 1))
        if not 0 < qty <= 50: raise ApiError("Quantity must be between 1 and 50")
        if not db.q("SELECT 1 FROM tables WHERE id=?", (tid,)): raise ApiError("No such table")
        mi = db.q("SELECT price FROM menu WHERE id=? AND available=1", (mid,))
        if not mi: raise ApiError("Item unavailable")
        if u[1] == "customer":
            existing = db.q("SELECT taken_by FROM orders WHERE table_id=? AND status='Open'", (tid,))
            if existing and existing[0][0] != u[0]:
                raise ApiError("This table already has an active order", 409)
            if not existing and db.q("SELECT 1 FROM tables WHERE id=? AND status!='Free'", (tid,)):
                raise ApiError("This table is unavailable", 409)
        with db.con:                                   # one atomic transaction
            oid = open_order(tid)
            if oid is None:
                oid = db.con.execute("INSERT INTO orders(table_id,created,taken_by) VALUES(?,?,?)", (tid, now(), u[0])).lastrowid
                db.con.execute("UPDATE tables SET status='Occupied' WHERE id=?", (tid,))
            db.con.execute("INSERT INTO order_items(order_id,menu_id,qty,price) VALUES(?,?,?,?)", (oid, mid, qty, mi[0][0]))
        return {"order_id": oid}
    if p == "/api/orders/remove":
        tid, mid = int(b["table_id"]), int(b["menu_id"])
        oid = open_order(tid)
        if u[1] == "customer" and (not oid or not db.q(
            "SELECT 1 FROM orders WHERE id=? AND taken_by=?", (oid, u[0]))):
            raise ApiError("You can only change your own order", 403)
        if oid:
            row = db.q("SELECT id FROM order_items WHERE order_id=? AND menu_id=? ORDER BY id DESC LIMIT 1", (oid, mid))
            if row: db.x("DELETE FROM order_items WHERE id=?", (row[0][0],))
            if not db.q("SELECT 1 FROM order_items WHERE order_id=?", (oid,)):   # last item removed -> free the table
                with db.con:
                    db.con.execute("UPDATE orders SET status='Cancelled' WHERE id=?", (oid,))
                    db.con.execute("UPDATE tables SET status='Free' WHERE id=?", (tid,))
        return {"ok": True}
    if p == "/api/orders/cancel":
        tid = int(b["table_id"]); oid = open_order(tid)
        if not oid: raise ApiError("No open order")
        with db.con:
            db.con.execute("UPDATE orders SET status='Cancelled' WHERE id=?", (oid,))
            db.con.execute("UPDATE tables SET status='Free' WHERE id=?", (tid,))
        return {"ok": True}

    # ---- billing
    if p == "/api/bill":
        tid = int(b["table_id"]); oid = open_order(tid)
        if not oid: raise ApiError("No open order for this table")
        it = items_of(oid)
        if not it: raise ApiError("Order is empty")
        try: d = float(b.get("discount") or 0)
        except ValueError: raise ApiError("Invalid discount")
        if not 0 <= d <= 100: raise ApiError("Discount must be 0-100")
        method = b.get("method") if b.get("method") in ("Cash", "Card", "UPI") else "Cash"
        sub = sum(i["amount"] for i in it); disc = round(sub * d / 100, 2)
        gst = round((sub - disc) * GST_RATE, 2); total = round(sub - disc + gst, 2)
        with db.con:
            bid = db.con.execute("INSERT INTO bills(order_id,subtotal,discount,gst,total,method,paid_at) VALUES(?,?,?,?,?,?,?)",
                                 (oid, sub, disc, gst, total, method, now())).lastrowid
            db.con.execute("UPDATE orders SET status='Paid' WHERE id=?", (oid,))
            db.con.execute("UPDATE tables SET status='Free' WHERE id=?", (tid,))
        return bill_dict(bid, cashier=u[0])
    if p == "/api/bills":
        day = (qs.get("date") or "")
        day = day if valid_date(day) else ""
        rows = db.q("""SELECT b.id,o.table_id,b.total,b.method,b.paid_at,o.taken_by,
                              (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id=b.order_id)
                       FROM bills b JOIN orders o ON o.id=b.order_id
                       WHERE (?='' OR substr(b.paid_at,1,10)=?) ORDER BY b.id DESC LIMIT 300""", (day, day))
        return [dict(id=i, table_id=t, total=tot, method=me, paid_at=pa, cashier=by, items=n) for i, t, tot, me, pa, by, n in rows]
    if p == "/api/bills/detail":
        return bill_dict(int(qs.get("id", 0)))

    # ---- reservations
    if p == "/api/reservations" and m == "GET":
        return [dict(id=i, name=n, phone=ph, table_id=t, date=d, time=tm, guests=g) for i, n, ph, t, d, tm, g in
                db.q("""SELECT id,name,phone,table_id,res_date,res_time,guests FROM reservations
                        WHERE status='Booked' ORDER BY res_date,res_time""")]
    if p == "/api/reservations" and m == "POST":
        name, phone = text("name", "Guest name"), text("phone", "Phone", 18)
        date, tm = str(b.get("date", "")), str(b.get("time", ""))
        if not re.fullmatch(r"[0-9+\-\s()]{7,18}", phone): raise ApiError("Enter a valid phone number")
        try:
            g = int(b.get("guests")); when = datetime.strptime(f"{date} {tm}", "%Y-%m-%d %H:%M")
        except (TypeError, ValueError): raise ApiError("Check guests, date and time")
        if not 0 < g <= 50: raise ApiError("Guests must be between 1 and 50")
        if when < datetime.now(): raise ApiError("Choose a future date and time")
        free = db.q("""SELECT id,seats FROM tables WHERE seats>=? AND id NOT IN
                (SELECT table_id FROM reservations WHERE res_date=? AND res_time=? AND status='Booked')
                ORDER BY seats LIMIT 1""", (g, date, tm))
        if not free: raise ApiError("No table available for that slot")
        rid = db.x("INSERT INTO reservations(name,phone,table_id,res_date,res_time,guests) VALUES(?,?,?,?,?,?)",
                   (name, phone, free[0][0], date, tm, g)).lastrowid
        return {"id": rid, "table_id": free[0][0]}
    if p == "/api/reservations/cancel":
        db.x("UPDATE reservations SET status='Cancelled' WHERE id=?", (int(b["id"]),)); return {"ok": True}

    # ---- users (admin)
    if p == "/api/users" and m == "GET":
        admin(); return [dict(username=n, role=r) for n, r in db.q("SELECT username,role FROM users ORDER BY role,username")]
    if p == "/api/users/add":
        admin(); name = str(b.get("username", "")).strip(); pw = str(b.get("password", ""))
        role = b.get("role") if b.get("role") in ("admin", "staff", "customer") else "staff"
        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,20}", name): raise ApiError("Username: 3-20 letters, numbers, . _ -")
        if len(pw) < 6: raise ApiError("Password must be at least 6 characters")
        salt = secrets.token_hex(8)
        try: db.x("INSERT INTO users(username,salt,pw_hash,role) VALUES(?,?,?,?)", (name, salt, hash_pw(pw, salt), role))
        except sqlite3.IntegrityError: raise ApiError("Username already exists")
        return {"ok": True}
    if p == "/api/users/delete":
        admin(); name = str(b.get("username", ""))
        if name == u[0]: raise ApiError("You cannot delete your own account")
        row = db.q("SELECT role FROM users WHERE username=?", (name,))
        if not row: raise ApiError("No such user")
        if row[0][0] == "admin" and db.q("SELECT COUNT(*) FROM users WHERE role='admin'")[0][0] <= 1:
            raise ApiError("At least one admin must remain")
        db.x("DELETE FROM users WHERE username=?", (name,))
        for t in [t for t, s in sessions.items() if s[0] == name]: sessions.pop(t, None)
        return {"ok": True}

    # ---- reports (admin)
    if p == "/api/report":
        admin()
        today = datetime.now().strftime("%Y-%m-%d")
        r = db.q("SELECT COUNT(*),COALESCE(SUM(subtotal),0),COALESCE(SUM(gst),0),COALESCE(SUM(total),0),COALESCE(SUM(discount),0) "
                 "FROM bills WHERE paid_at LIKE ?", (today + "%",))[0]
        sold = db.q("""SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN bills b ON b.order_id=oi.order_id
                       WHERE b.paid_at LIKE ?""", (today + "%",))[0][0]
        top = db.q("""SELECT m.name,SUM(oi.qty),SUM(oi.qty*oi.price) FROM order_items oi JOIN menu m ON m.id=oi.menu_id
                      JOIN orders o ON o.id=oi.order_id WHERE o.status='Paid' GROUP BY m.id ORDER BY 2 DESC LIMIT 5""")
        meth = db.q("SELECT method,COUNT(*),SUM(total) FROM bills GROUP BY method")
        days = db.q("SELECT substr(paid_at,1,10),COUNT(*),SUM(total) FROM bills GROUP BY 1 ORDER BY 1 DESC LIMIT 7")
        return dict(today=dict(bills=r[0], sales=r[1], gst=r[2], collected=r[3], discount=r[4], items=sold),
                    top=[dict(name=n, qty=q, revenue=t) for n, q, t in top],
                    methods=[dict(method=a, bills=c, total=t) for a, c, t in meth],
                    days=[dict(date=a, bills=c, total=t) for a, c, t in days])
    if p == "/api/export/bills":
        admin()
        rows = db.q("""SELECT b.id,b.order_id,o.table_id,b.paid_at,b.subtotal,b.discount,b.gst,b.total,b.method,o.taken_by
                       FROM bills b JOIN orders o ON o.id=b.order_id ORDER BY b.id""")
        buf = io.StringIO(); w = csv.writer(buf)
        w.writerow(["Bill ID", "Order ID", "Table", "Paid at", "Subtotal", "Discount", "GST", "Total", "Method", "Cashier"])
        w.writerows(rows)
        return (buf.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8", f"bills_{datetime.now():%Y%m%d}.csv")
    raise ApiError("Not found", 404)


class Handler(BaseHTTPRequestHandler):
    def reply(self, data, code=200, ctype="application/json; charset=utf-8", extra=None):
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        try:
            self.send_response(code); self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff"); self.send_header("X-Frame-Options", "DENY")
            for k, v in (extra or {}).items(): self.send_header(k, v)
            self.end_headers(); self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass

    def do_GET(self): self.route("GET")
    def do_POST(self): self.route("POST")
    def log_message(self, *a): pass

    def route(self, m):
        url = urlparse(self.path); path = url.path
        if not path.startswith("/api/"):
            f = os.path.normpath(os.path.join(STATIC, path.lstrip("/") or "index.html"))
            if m == "GET" and f.startswith(STATIC + os.sep) and os.path.isfile(f):
                ext = os.path.splitext(f)[1].lower()
                cache = "public, max-age=86400" if ext in (".jpg", ".jpeg", ".png", ".webp", ".svg") else "no-cache"
                with open(f, "rb") as fh: data = fh.read()
                return self.reply(data, 200, TYPES.get(ext, "application/octet-stream"), {"Cache-Control": cache})
            return self.reply({"error": "Not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n < 0 or n > MAX_IMAGE_BYTES * 2:
                raise ApiError("Request is too large", 413)
            body = json.loads(self.rfile.read(n)) if n else {}
            if path == "/api/public/session" and m == "POST":
                t = time.time()
                for expired in [key for key, value in sessions.items() if value[2] < t]:
                    sessions.pop(expired, None)
                tok = secrets.token_hex(16)
                guest = "guest_" + secrets.token_hex(12)
                sessions[tok] = (guest, "customer", t + SESSION_HOURS * 3600)
                return self.reply(dict(token=tok, user=guest, role="customer",
                                       gst_rate=round(GST_RATE * 100, 2), **restaurant_info()))
            if path == "/api/login":
                name = str(body.get("username", "")); t = time.time()
                recent = [x for x in fails.get(name, []) if t - x < FAIL_WINDOW]
                if len(recent) >= MAX_FAILS: raise ApiError("Too many attempts. Try again in a few minutes.", 429)
                row = db.q("SELECT salt,pw_hash,role FROM users WHERE username=?", (name,))
                if not row or hash_pw(str(body.get("password", "")), row[0][0]) != row[0][1]:
                    fails[name] = recent + [t]
                    raise ApiError("Wrong username or password", 401)
                fails.pop(name, None)
                tok = secrets.token_hex(16); sessions[tok] = (name, row[0][2], t + SESSION_HOURS * 3600)
                return self.reply(dict(token=tok, user=name, role=row[0][2], gst_rate=round(GST_RATE * 100, 2), **restaurant_info()))
            tok = self.headers.get("X-Token"); s = sessions.get(tok)
            if s and s[2] < time.time(): sessions.pop(tok, None); s = None
            if not s: raise ApiError("Please log in", 401)
            if path == "/api/logout": sessions.pop(tok, None); return self.reply({"ok": True})
            res = api(m, path, body, s[:2], {k: v[0] for k, v in parse_qs(url.query).items()})
            if isinstance(res, tuple):
                data, ctype, fname = res
                return self.reply(data, 200, ctype, {"Content-Disposition": f'attachment; filename="{fname}"'})
            self.reply(res)
        except ApiError as e: self.reply({"error": str(e)}, e.code)
        except (KeyError, ValueError, TypeError): self.reply({"error": "Invalid request"}, 400)
        except Exception as e: self.reply({"error": "Server error: " + str(e)}, 500)


if __name__ == "__main__":
    shown = "localhost" if HOST in ("127.0.0.1", "0.0.0.0") else HOST
    url = f"http://{shown}:{PORT}"
    print(f"Restaurant Management System running at {url}  (Ctrl+C to stop)")
    try: webbrowser.open(url)
    except Exception: pass
    try: HTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt: print("\nStopped.")
