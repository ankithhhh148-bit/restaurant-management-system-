# Restaurant Management System

A static restaurant management and ordering website built with HTML, CSS, and JavaScript. Supabase provides shared PostgreSQL data, authentication, and image storage; the website does not include a custom application server.

## Features

- Customer storefront with menu search, categories, table selection, and ordering
- Supabase Auth sign-in for restaurant staff
- Menu, table, order, billing, GST, and reservation management
- Reports, bill history, CSV export, and user management
- Storefront branding, banner, menu-photo, and theme customization
- Shared menu, orders, bills, reservations, settings, and photos in Supabase
- Live updates across customer and staff browsers through Supabase Realtime

## Run the website

1. Open the Supabase SQL Editor for project `soviunagudymsrctrssi` and run [`supabase/schema.sql`](./supabase/schema.sql).
2. In Supabase Authentication settings, enable anonymous sign-ins so customers can place orders.
3. In Authentication → Users, create the administrator `ankitadmin@gmail.com` and set its password. Then run this SQL once to grant its role:

   ```sql
   update public.profiles set role = 'admin' where email = 'ankitadmin@gmail.com';
   ```

4. For local testing, serve the `static` folder with VS Code Live Server. The project is configured to deploy its `static` folder on Vercel.

The frontend uses the project's public publishable key. Never put a Supabase `service_role` or secret key in frontend code. Database actions are routed through the security-definer `rms_request` function, which checks the signed-in profile role; row-level security is enabled on the tables and uploads. The schema adds shared tables to the Realtime publication with read policies that limit each role's event visibility.

For Vercel, import this repository and deploy the `static` directory as the output directory. The included `vercel.json` configures that output.

## Existing local data and photos

The previous SQLite database and uploaded photos were local, ignored files, so GitHub/Vercel could not include them. After applying the schema and creating the admin account, run the local-only `supabase/local-migration.sql` in Supabase SQL Editor to transfer the existing catalog, tables, orders, bills, reservations, and storefront settings. If that private file is unavailable, open [`supabase/export-local-migration.html`](./supabase/export-local-migration.html) from Live Server, select your local `rms.db` and `rms_storefront.json`, and generate it in the browser. The export contains reservation contact data; keep it private and do not commit it.

While serving the workspace locally with Live Server, sign in as the admin in the app, then open [`supabase/import-local-uploads.html`](./supabase/import-local-uploads.html) from the same origin to copy the existing ignored photos from `static/uploads/` into Supabase Storage. This one-time importer is outside the Vercel output.

Staff accounts are created in Supabase Authentication → Users. New accounts default to the customer role; an administrator can assign `staff` or `admin` in `public.profiles` from the SQL Editor. Customer storefront sessions use Supabase anonymous authentication. All shared changes and uploaded images are available to visitors using the same Supabase project.
