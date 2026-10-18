#!/usr/bin/env python3
"""
Restaurant Management System
----------------------------
Modules : Login (roles) | Menu | Tables | Orders | Billing | Reservations | Reports | Users
Storage : SQLite (rms.db, auto-created)  |  Receipts saved in ./receipts/
Run     : python restaurant_management_system.py
Logins  : admin / admin123   (full access)
          staff / staff123   (orders, billing, reservations)
"""
import sqlite3, hashlib, os, secrets, getpass
from datetime import datetime

DB_FILE = "rms.db"
GST_RATE = 0.05
RESTAURANT = "THE GOLDEN SPOON"

DEFAULT_MENU = [
    ("Hot Coffee", "Coffee", 100),
    ("Cold Coffee", "Coffee", 150),
    ("Cheese Pasta", "Pasta", 200),
    ("Normal Pasta", "Pasta", 150),
    ("Veg Burger", "Burger", 100),
    ("Chicken Burger", "Burger", 180),
    ("Chilli Chicken (Half)", "Chicken", 200),
    ("Chilli Chicken (Full)", "Chicken", 390),
    ("Tandoori Chicken (Half)", "Chicken", 250),
    ("Tandoori Chicken (Full)", "Chicken", 480),
]

# ------------------------------------------------------------------ helpers
def hash_pw(password, salt):
    return hashlib.sha256((salt + password).encode()).hexdigest()

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def ask(prompt, cast=str, default=None, allow_blank=False):
    while True:
        raw = input(prompt).strip()
        if raw == "" and default is not None:
            return default
        if raw == "" and allow_blank:
            return None
        try:
            return cast(raw)
        except ValueError:
            print("  ! Invalid input, try again.")

def line(ch="-", n=62):
    print(ch * n)

def header(title):
    print(); line("=")
    print(f"  {title}")
    line("=")

def show_table(rows, cols):
    if not rows:
        print("  (nothing to show)"); return
    widths = [max(len(str(c)), *(len(str(r[i])) for r in rows)) for i, c in enumerate(cols)]
    fmt = "  " + " | ".join(f"{{:<{w}}}" for w in widths)
    print(fmt.format(*cols))
    print("  " + "-+-".join("-" * w for w in widths))
    for r in rows:
        print(fmt.format(*[str(x) for x in r]))

# ------------------------------------------------------------------ database
class DB:
    def __init__(self, path=DB_FILE):
        self.con = sqlite3.connect(path)
        self.con.execute("PRAGMA foreign_keys = ON")
        self.create_schema()
        self.seed()

    def q(self, sql, args=()):
        return self.con.execute(sql, args).fetchall()

    def x(self, sql, args=()):
        cur = self.con.execute(sql, args)
        self.con.commit()
        return cur

    def create_schema(self):
        self.con.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            salt TEXT NOT NULL, pw_hash TEXT NOT NULL, role TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS menu(
            id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
            category TEXT NOT NULL, price REAL NOT NULL, available INTEGER DEFAULT 1);
        CREATE TABLE IF NOT EXISTS tables(
            id INTEGER PRIMARY KEY, seats INTEGER NOT NULL, status TEXT DEFAULT 'Free');
        CREATE TABLE IF NOT EXISTS orders(
            id INTEGER PRIMARY KEY, table_id INTEGER, status TEXT DEFAULT 'Open',
            created TEXT, taken_by TEXT, FOREIGN KEY(table_id) REFERENCES tables(id));
        CREATE TABLE IF NOT EXISTS order_items(
            id INTEGER PRIMARY KEY, order_id INTEGER, menu_id INTEGER,
            qty INTEGER, price REAL,
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(menu_id) REFERENCES menu(id));
        CREATE TABLE IF NOT EXISTS bills(
            id INTEGER PRIMARY KEY, order_id INTEGER, subtotal REAL, discount REAL,
            gst REAL, total REAL, method TEXT, paid_at TEXT,
            FOREIGN KEY(order_id) REFERENCES orders(id));
        CREATE TABLE IF NOT EXISTS reservations(
            id INTEGER PRIMARY KEY, name TEXT, phone TEXT, table_id INTEGER,
            res_date TEXT, res_time TEXT, guests INTEGER, status TEXT DEFAULT 'Booked',
            FOREIGN KEY(table_id) REFERENCES tables(id));
        """)
        self.con.commit()

    def seed(self):
        if not self.q("SELECT 1 FROM users"):
            for u, p, r in (("admin", "admin123", "admin"), ("staff", "staff123", "staff")):
                s = secrets.token_hex(8)
                self.x("INSERT INTO users(username,salt,pw_hash,role) VALUES(?,?,?,?)",
                       (u, s, hash_pw(p, s), r))
        if not self.q("SELECT 1 FROM menu"):
            self.con.executemany("INSERT INTO menu(name,category,price) VALUES(?,?,?)", DEFAULT_MENU)
            self.con.commit()
        if not self.q("SELECT 1 FROM tables"):
            for seats in (2, 2, 4, 4, 4, 6, 6, 8):
                self.x("INSERT INTO tables(seats) VALUES(?)", (seats,))

# ------------------------------------------------------------------ app
class RMS:
    def __init__(self):
        self.db = DB()
        self.user = None

    # ---------- login
    def login(self):
        header(f"{RESTAURANT} - RESTAURANT MANAGEMENT SYSTEM")
        for attempt in range(3):
            u = input("  Username: ").strip()
            try:
                p = getpass.getpass("  Password: ")
            except Exception:
                p = input("  Password: ")
            row = self.db.q("SELECT salt,pw_hash,role FROM users WHERE username=?", (u,))
            if row and hash_pw(p, row[0][0]) == row[0][1]:
                self.user = (u, row[0][2])
                print(f"\n  Welcome, {u} ({row[0][2]})!")
                return True
            print("  ! Wrong username or password.")
        return False

    def is_admin(self):
        return self.user[1] == "admin"

    def need_admin(self):
        if not self.is_admin():
            print("  ! Admin access required."); return False
        return True

    # ---------- menu
    def list_menu(self, only_available=False):
        sql = "SELECT id,name,category,price,CASE available WHEN 1 THEN 'Yes' ELSE 'No' END FROM menu"
        if only_available: sql += " WHERE available=1"
        rows = self.db.q(sql + " ORDER BY category, id")
        show_table([(i, n, c, f"Rs {p:.0f}", a) for i, n, c, p, a in rows],
                   ["ID", "Item", "Category", "Price", "Avail"])
        return rows

    def menu_module(self):
        while True:
            header("MENU MANAGEMENT")
            print("  1. View menu\n  2. Add item (admin)\n  3. Update price (admin)\n"
                  "  4. Toggle availability (admin)\n  5. Delete item (admin)\n  0. Back")
            c = input("  > ").strip()
            if c == "1": self.list_menu()
            elif c == "2" and self.need_admin():
                n = ask("  Name: "); cat = ask("  Category: "); p = ask("  Price: ", float)
                try:
                    self.db.x("INSERT INTO menu(name,category,price) VALUES(?,?,?)", (n, cat, p))
                    print("  Item added.")
                except sqlite3.IntegrityError:
                    print("  ! Item already exists.")
            elif c == "3" and self.need_admin():
                self.list_menu(); i = ask("  Item ID: ", int); p = ask("  New price: ", float)
                self.db.x("UPDATE menu SET price=? WHERE id=?", (p, i)); print("  Updated.")
            elif c == "4" and self.need_admin():
                self.list_menu(); i = ask("  Item ID: ", int)
                self.db.x("UPDATE menu SET available=1-available WHERE id=?", (i,)); print("  Toggled.")
            elif c == "5" and self.need_admin():
                self.list_menu(); i = ask("  Item ID: ", int)
                try:
                    self.db.x("DELETE FROM menu WHERE id=?", (i,)); print("  Deleted.")
                except sqlite3.IntegrityError:
                    print("  ! Item used in past orders; mark it unavailable instead.")
            elif c == "0": return

    # ---------- tables
    def show_tables(self):
        show_table(self.db.q("SELECT id,seats,status FROM tables"), ["Table", "Seats", "Status"])

    def tables_module(self):
        while True:
            header("TABLE MANAGEMENT")
            print("  1. View tables\n  2. Add table (admin)\n  3. Free a table\n  0. Back")
            c = input("  > ").strip()
            if c == "1": self.show_tables()
            elif c == "2" and self.need_admin():
                s = ask("  Seats: ", int); self.db.x("INSERT INTO tables(seats) VALUES(?)", (s,))
                print("  Table added.")
            elif c == "3":
                self.show_tables(); t = ask("  Table no: ", int)
                if self.db.q("SELECT 1 FROM orders WHERE table_id=? AND status='Open'", (t,)):
                    print("  ! Table has an open order; bill it first.")
                else:
                    self.db.x("UPDATE tables SET status='Free' WHERE id=?", (t,)); print("  Table freed.")
            elif c == "0": return

    # ---------- orders
    def open_order_for(self, table_id):
        r = self.db.q("SELECT id FROM orders WHERE table_id=? AND status='Open'", (table_id,))
        return r[0][0] if r else None

    def new_order(self):
        header("TAKE ORDER")
        self.show_tables()
        t = ask("  Table no: ", int)
        tb = self.db.q("SELECT status FROM tables WHERE id=?", (t,))
        if not tb: print("  ! No such table."); return
        oid = self.open_order_for(t)
        if oid is None:
            if tb[0][0] == "Reserved":
                print("  Note: table is reserved.")
            oid = self.db.x("INSERT INTO orders(table_id,created,taken_by) VALUES(?,?,?)",
                            (t, now(), self.user[0])).lastrowid
            self.db.x("UPDATE tables SET status='Occupied' WHERE id=?", (t,))
            print(f"  Order #{oid} opened for table {t}.")
        else:
            print(f"  Adding to existing order #{oid}.")
        self.list_menu(only_available=True)
        print("  Enter item ID and quantity. Blank ID to finish.")
        while True:
            i = ask("  Item ID: ", int, allow_blank=True)
            if i is None: break
            m = self.db.q("SELECT name,price FROM menu WHERE id=? AND available=1", (i,))
            if not m: print("  ! Invalid / unavailable item."); continue
            q = ask("  Quantity [1]: ", int, default=1)
            if q <= 0: print("  ! Quantity must be positive."); continue
            self.db.x("INSERT INTO order_items(order_id,menu_id,qty,price) VALUES(?,?,?,?)",
                      (oid, i, q, m[0][1]))
            print(f"  + {q} x {m[0][0]}")
        self.show_order(oid)

    def order_items(self, oid):
        return self.db.q("""SELECT m.name, SUM(oi.qty), oi.price, SUM(oi.qty*oi.price)
                            FROM order_items oi JOIN menu m ON m.id=oi.menu_id
                            WHERE oi.order_id=? GROUP BY oi.menu_id, oi.price""", (oid,))

    def show_order(self, oid):
        items = self.order_items(oid)
        show_table([(n, q, f"{p:.0f}", f"{t:.0f}") for n, q, p, t in items],
                   ["Item", "Qty", "Rate", "Amount"])
        print(f"  Subtotal: Rs {sum(i[3] for i in items):.2f}")

    def orders_module(self):
        while True:
            header("ORDERS")
            print("  1. New / add to order\n  2. View open orders\n  3. Remove an item from order\n"
                  "  4. Cancel order\n  0. Back")
            c = input("  > ").strip()
            if c == "1": self.new_order()
            elif c == "2":
                rows = self.db.q("SELECT id,table_id,created,taken_by FROM orders WHERE status='Open'")
                show_table(rows, ["Order", "Table", "Opened", "By"])
                if rows:
                    o = ask("  View order # (blank to skip): ", int, allow_blank=True)
                    if o: self.show_order(o)
            elif c == "3":
                o = ask("  Order #: ", int)
                rows = self.db.q("""SELECT oi.id,m.name,oi.qty FROM order_items oi
                                    JOIN menu m ON m.id=oi.menu_id WHERE oi.order_id=?""", (o,))
                show_table(rows, ["Line", "Item", "Qty"])
                if rows:
                    l = ask("  Line to remove: ", int)
                    self.db.x("DELETE FROM order_items WHERE id=? AND order_id=?", (l, o))
                    print("  Removed.")
            elif c == "4":
                o = ask("  Order #: ", int)
                r = self.db.q("SELECT table_id FROM orders WHERE id=? AND status='Open'", (o,))
                if r:
                    self.db.x("UPDATE orders SET status='Cancelled' WHERE id=?", (o,))
                    self.db.x("UPDATE tables SET status='Free' WHERE id=?", (r[0][0],))
                    print("  Order cancelled.")
                else: print("  ! No such open order.")
            elif c == "0": return

    # ---------- billing
    def billing_module(self):
        header("BILLING")
        rows = self.db.q("SELECT id,table_id,created FROM orders WHERE status='Open'")
        show_table(rows, ["Order", "Table", "Opened"])
        if not rows: return
        o = ask("  Order # to bill: ", int)
        r = self.db.q("SELECT table_id,created FROM orders WHERE id=? AND status='Open'", (o,))
        if not r: print("  ! No such open order."); return
        items = self.order_items(o)
        if not items: print("  ! Order is empty."); return
        sub = sum(i[3] for i in items)
        d = ask("  Discount % [0]: ", float, default=0.0)
        if not 0 <= d <= 100: print("  ! Invalid discount."); return
        disc = round(sub * d / 100, 2)
        gst = round((sub - disc) * GST_RATE, 2)
        total = round(sub - disc + gst, 2)
        method = {"1": "Cash", "2": "Card", "3": "UPI"}.get(
            ask("  Payment (1-Cash 2-Card 3-UPI) [1]: ", str, default="1"), "Cash")
        bid = self.db.x("INSERT INTO bills(order_id,subtotal,discount,gst,total,method,paid_at) "
                        "VALUES(?,?,?,?,?,?,?)", (o, sub, disc, gst, total, method, now())).lastrowid
        self.db.x("UPDATE orders SET status='Paid' WHERE id=?", (o,))
        self.db.x("UPDATE tables SET status='Free' WHERE id=?", (r[0][0],))
        text = self.receipt(bid, o, r[0][0], items, sub, disc, gst, total, method)
        print(text)
        os.makedirs("receipts", exist_ok=True)
        path = os.path.join("receipts", f"bill_{bid}.txt")
        with open(path, "w", encoding="utf-8") as f: f.write(text)
        print(f"  Receipt saved: {path}")

    def receipt(self, bid, oid, tid, items, sub, disc, gst, total, method):
        w = 44
        out = ["", "=" * w, RESTAURANT.center(w), "Tax Invoice".center(w), "=" * w,
               f"Bill #{bid:<6} Order #{oid:<6} Table {tid}",
               f"Date: {now()}   Cashier: {self.user[0]}", "-" * w,
               f"{'Item':<22}{'Qty':>4}{'Rate':>7}{'Amt':>9}", "-" * w]
        for n, q, p, t in items:
            out.append(f"{n[:22]:<22}{q:>4}{p:>7.0f}{t:>9.2f}")
        out += ["-" * w, f"{'Subtotal':<35}{sub:>9.2f}"]
        if disc: out.append(f"{'Discount':<35}{-disc:>9.2f}")
        out += [f"{'GST @ %d%%' % int(GST_RATE*100):<35}{gst:>9.2f}", "=" * w,
                f"{'TOTAL':<35}{total:>9.2f}", f"Paid by: {method}", "=" * w,
                "Thank you! Visit again.".center(w), ""]
        return "\n".join(out)

    # ---------- reservations
    def reservations_module(self):
        while True:
            header("RESERVATIONS")
            print("  1. New reservation\n  2. View upcoming\n  3. Cancel reservation\n"
                  "  4. Mark as seated\n  0. Back")
            c = input("  > ").strip()
            if c == "1":
                name = ask("  Guest name: "); phone = ask("  Phone: ")
                g = ask("  Guests: ", int)
                date = ask("  Date (YYYY-MM-DD): ")
                tm = ask("  Time (HH:MM): ")
                try:
                    datetime.strptime(f"{date} {tm}", "%Y-%m-%d %H:%M")
                except ValueError:
                    print("  ! Bad date/time format."); continue
                free = self.db.q("""SELECT id,seats FROM tables WHERE seats>=? AND id NOT IN
                    (SELECT table_id FROM reservations WHERE res_date=? AND res_time=? AND status='Booked')
                    ORDER BY seats LIMIT 1""", (g, date, tm))
                if not free: print("  ! No table available for that slot."); continue
                rid = self.db.x("""INSERT INTO reservations(name,phone,table_id,res_date,res_time,guests)
                                   VALUES(?,?,?,?,?,?)""", (name, phone, free[0][0], date, tm, g)).lastrowid
                print(f"  Reservation #{rid} confirmed: table {free[0][0]} ({free[0][1]} seats).")
            elif c == "2":
                show_table(self.db.q("""SELECT id,name,phone,table_id,res_date,res_time,guests
                    FROM reservations WHERE status='Booked' ORDER BY res_date,res_time"""),
                    ["ID", "Name", "Phone", "Table", "Date", "Time", "Guests"])
            elif c == "3":
                r = ask("  Reservation ID: ", int)
                self.db.x("UPDATE reservations SET status='Cancelled' WHERE id=?", (r,)); print("  Cancelled.")
            elif c == "4":
                r = ask("  Reservation ID: ", int)
                row = self.db.q("SELECT table_id FROM reservations WHERE id=? AND status='Booked'", (r,))
                if row:
                    self.db.x("UPDATE reservations SET status='Seated' WHERE id=?", (r,))
                    self.db.x("UPDATE tables SET status='Reserved' WHERE id=? AND status='Free'", (row[0][0],))
                    print(f"  Guests seated. Table {row[0][0]} reserved; take the order from Orders menu.")
                else: print("  ! Not found.")
            elif c == "0": return

    # ---------- reports (admin)
    def reports_module(self):
        if not self.need_admin(): return
        while True:
            header("REPORTS")
            print("  1. Today's sales\n  2. Sales by date\n  3. Top selling items\n"
                  "  4. Sales by payment method\n  0. Back")
            c = input("  > ").strip()
            if c == "1":
                d = datetime.now().strftime("%Y-%m-%d")
                r = self.db.q("""SELECT COUNT(*),COALESCE(SUM(subtotal),0),COALESCE(SUM(gst),0),
                    COALESCE(SUM(total),0) FROM bills WHERE paid_at LIKE ?""", (d + "%",))[0]
                print(f"  Bills: {r[0]} | Sales: Rs {r[1]:.2f} | GST: Rs {r[2]:.2f} | Collected: Rs {r[3]:.2f}")
            elif c == "2":
                show_table([(d, n, f"{t:.2f}") for d, n, t in self.db.q(
                    """SELECT substr(paid_at,1,10),COUNT(*),SUM(total) FROM bills
                       GROUP BY 1 ORDER BY 1 DESC LIMIT 15""")], ["Date", "Bills", "Total (Rs)"])
            elif c == "3":
                show_table(self.db.q("""SELECT m.name,SUM(oi.qty),SUM(oi.qty*oi.price) FROM order_items oi
                    JOIN menu m ON m.id=oi.menu_id JOIN orders o ON o.id=oi.order_id
                    WHERE o.status='Paid' GROUP BY m.id ORDER BY 2 DESC LIMIT 5"""),
                    ["Item", "Qty sold", "Revenue"])
            elif c == "4":
                show_table([(m, n, f"{t:.2f}") for m, n, t in self.db.q(
                    "SELECT method,COUNT(*),SUM(total) FROM bills GROUP BY method")],
                    ["Method", "Bills", "Total (Rs)"])
            elif c == "0": return

    # ---------- users (admin)
    def users_module(self):
        if not self.need_admin(): return
        while True:
            header("USER MANAGEMENT")
            print("  1. List users\n  2. Add user\n  3. Change password\n  4. Delete user\n  0. Back")
            c = input("  > ").strip()
            if c == "1":
                show_table(self.db.q("SELECT id,username,role FROM users"), ["ID", "Username", "Role"])
            elif c == "2":
                u = ask("  Username: "); p = ask("  Password: ")
                r = "admin" if ask("  Role (admin/staff) [staff]: ", str, default="staff") == "admin" else "staff"
                s = secrets.token_hex(8)
                try:
                    self.db.x("INSERT INTO users(username,salt,pw_hash,role) VALUES(?,?,?,?)",
                              (u, s, hash_pw(p, s), r)); print("  User added.")
                except sqlite3.IntegrityError: print("  ! Username taken.")
            elif c == "3":
                u = ask("  Username: "); p = ask("  New password: "); s = secrets.token_hex(8)
                cur = self.db.x("UPDATE users SET salt=?,pw_hash=? WHERE username=?", (s, hash_pw(p, s), u))
                print("  Password changed." if cur.rowcount else "  ! No such user.")
            elif c == "4":
                u = ask("  Username: ")
                if u == self.user[0]: print("  ! You cannot delete yourself."); continue
                self.db.x("DELETE FROM users WHERE username=?", (u,)); print("  Done.")
            elif c == "0": return

    # ---------- main loop
    def run(self):
        if not self.login():
            print("  Too many failed attempts."); return
        actions = {"1": self.orders_module, "2": self.billing_module, "3": self.reservations_module,
                   "4": self.menu_module, "5": self.tables_module,
                   "6": self.reports_module, "7": self.users_module}
        while True:
            header(f"MAIN MENU  |  {self.user[0]} ({self.user[1]})")
            print("  1. Orders\n  2. Billing\n  3. Reservations\n  4. Menu\n  5. Tables\n"
                  "  6. Reports (admin)\n  7. Users (admin)\n  0. Logout / Exit")
            c = input("  > ").strip()
            if c == "0":
                print("  Goodbye!"); return
            actions.get(c, lambda: print("  ! Invalid choice."))()


if __name__ == "__main__":
    try:
        RMS().run()
    except (KeyboardInterrupt, EOFError):
        print("\n  Exiting.")
