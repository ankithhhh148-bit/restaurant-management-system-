# Restaurant Management System

A restaurant management application built with Python, SQLite, and the standard library. Use the web storefront for customer ordering or the management screens for restaurant operations.

## Features

- Customer storefront with menu search, categories, table selection, and ordering
- Admin and staff login; customers can order without signing in
- Menu, table, order, billing, GST, and reservation management
- Admin reports, bill export, and user management
- Admin-editable storefront template: restaurant name, logo, banner copy and image, menu photos, and theme colors
- SQLite database created and seeded automatically on first run

## Run the website

On Windows, double-click `run_web.bat`, or run:

```bash
python rms_server.py
```

Open [http://localhost:8000](http://localhost:8000). If port 8000 is occupied, set `RMS_PORT` before starting the server:

```powershell
$env:RMS_PORT = "8001"
python rms_server.py
```

To allow devices on the local network to connect, set `RMS_HOST` to `0.0.0.0` and use the computer's LAN IP address.

## Management login

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Staff | `staff` | `staff123` |

Customers see the menu and ordering experience by default. Use the **Admin / Staff** button to sign in to management. Change demo passwords before using the application outside a local development environment.

Admins can edit storefront branding and appearance in **Settings → Customer storefront template**. Storefront settings are kept in the local `rms_storefront.json`; uploaded images are kept in `static/uploads/`. Both are excluded from Git so local database and storefront data are not published.

## Command-line application

The original command-line interface remains available:

```bash
python restaurant_management_system.py
```

## Tech stack

- Python 3 (standard library only)
- SQLite (`sqlite3`)
