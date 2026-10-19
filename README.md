# Restaurant Management System

A static restaurant management and ordering website built with HTML, CSS, and JavaScript. It includes the customer storefront and the management screens without a Python server or database.

## Features

- Customer storefront with menu search, categories, table selection, and ordering
- Admin and staff demo sign-in
- Menu, table, order, billing, GST, and reservation management
- Reports, bill history, CSV export, and user management
- Storefront branding, banner, menu-photo, and theme customization
- Browser-local data saved automatically in `localStorage`

## Run the website

Open `static/index.html` in a browser, or use a static-file preview extension such as Live Server. No Python installation, server, or package install is required.

For Vercel, import this repository and deploy the `static` directory as the output directory. The included `vercel.json` configures that output.

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Staff | `staff` | `staff123` |

Customers can order without signing in. These demo accounts are not secure authentication.

## Data and security limitations

This is a browser-only version. Users, passwords, menu changes, orders, bills, reservations, images, and settings are stored in the current browser profile. They are not shared with other devices or browsers, and clearing browser site data deletes them. Browser storage is not a secure database; do not use real passwords or sensitive customer information. Use a JavaScript backend with a hosted database if shared access or secure authentication is needed.

Data from the previous SQLite version is not imported. The static app starts with its demo data in browser storage; any existing `rms.db` file is left unchanged.
