# Restaurant Management System

A command-line Restaurant Management System built with **Python** and **SQLite**. It handles the daily work of a restaurant in one place: menu, tables, orders, billing, reservations, reports, and staff accounts.

## Features

- **Login with roles:** admin and staff accounts, with salted password hashing
- **Menu management:** add, update, delete items and mark them available or unavailable
- **Table management:** track tables as Free, Occupied, or Reserved
- **Orders:** open an order per table, add or remove items, cancel orders
- **Billing:** discount, 5% GST, Cash / Card / UPI payment, and a printed receipt saved to `receipts/`
- **Reservations:** automatically assigns a suitable table and prevents double booking of the same time slot
- **Reports (admin):** today's sales, sales by date, top-selling items, sales by payment method
- **User management (admin):** add users, change passwords, delete users

## Tech Stack

- Python 3 (standard library only, nothing to install)
- SQLite (`sqlite3`)

## How to Run

```bash
git clone <your-repo-link>
cd <repo-folder>
python restaurant_management_system.py
```

The database (`rms.db`) is created automatically on the first run and loaded with a sample menu.

## Demo Logins

| Role  | Username | Password   |
|-------|----------|------------|
| Admin | admin    | admin123   |
| Staff | staff    | staff123   |

Admins have full access. Staff can take orders, create bills, and manage reservations.

## Sample Menu

| Category | Items |
|----------|-------|
| Coffee   | Hot Coffee, Cold Coffee |
| Pasta    | Cheese Pasta, Normal Pasta |
| Burger   | Veg Burger, Chicken Burger |
| Chicken  | Chilli Chicken (Half/Full), Tandoori Chicken (Half/Full) |

## Database Design

`users` · `menu` · `tables` · `orders` · `order_items` · `bills` · `reservations`

Orders link to tables, order items link to menu items, and bills link to orders, using foreign keys.

## Sample Receipt

```
============================================
              THE GOLDEN SPOON
                Tax Invoice
============================================
Item                   Qty   Rate      Amt
--------------------------------------------
Hot Coffee               2    100   200.00
Chicken Burger           1    180   180.00
--------------------------------------------
Subtotal                              380.00
GST @ 5%                               19.00
============================================
TOTAL                                 399.00
```

## Future Improvements

- Desktop (Tkinter) or web (Flask) interface
- Kitchen order display
- Inventory tracking
- PDF receipts

## Author

**Ankit**, B.Tech Information Technology student

Feedback and suggestions are welcome.
