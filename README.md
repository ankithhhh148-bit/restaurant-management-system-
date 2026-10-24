# Restaurant Management System

A browser-only restaurant storefront built with HTML, CSS, and JavaScript. It has no server, database, secure authentication, or third-party runtime dependencies and is configured for static hosting on Vercel.

## Run locally

Open `static/index.html` in a browser or serve the `static` folder with VS Code Live Server.

## Deploy to Vercel

Import the repository into Vercel. The included [`vercel.json`](./vercel.json) sets `static` as the output directory.

## Configure the demo menu

Edit the `menu` array near the top of [`static/static-data.js`](./static/static-data.js) to set the restaurant's actual menu, categories, and prices before publishing. The included items and prices are examples.

Demo orders, reservations, bills, menu edits, tables, storefront settings, images, and accounts are saved in the browser's local storage. They are not transmitted to the restaurant or shared between visitors.

The **Admin / Staff** button opens the browser-only demo sign-in:

- Admin: `admin@restaurant.local` / `admin123`
- Staff: `staff@restaurant.local` / `staff123`

After signing in as admin, use **Settings** to manage the demo storefront, menu photos, accounts, tables, and admin email/password. Staff can manage orders, bills, reservations, and the menu. These credentials and role checks are only for trying the interface; browser storage can be inspected or changed by visitors, so they do not secure a public admin portal. A backend service is required for secure authentication and shared production data.
