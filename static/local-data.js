(() => {
  "use strict";

  const STORAGE_KEY = "rms-browser-data-v1";
  const GST_RATE = 0.05;
  const menu = [
    ["Hot Coffee", "Coffee", 100],
    ["Cold Coffee", "Coffee", 150],
    ["Cheese Pasta", "Pasta", 200],
    ["Normal Pasta", "Pasta", 150],
    ["Veg Burger", "Burger", 100],
    ["Chicken Burger", "Burger", 180],
    ["Chilli Chicken (Half)", "Chicken", 200],
    ["Chilli Chicken (Full)", "Chicken", 390],
    ["Tandoori Chicken (Half)", "Chicken", 250],
    ["Tandoori Chicken (Full)", "Chicken", 480]
  ];

  function initialData() {
    return {
      users: [
        {username: "admin", password: "admin123", role: "admin"},
        {username: "staff", password: "staff123", role: "staff"}
      ],
      menu: menu.map(([name, category, price], index) =>
        ({id: index + 1, name, category, price, available: true})),
      tables: [2, 2, 4, 4, 4, 6, 6, 8].map((seats, index) =>
        ({id: index + 1, seats, status: "Free"})),
      orders: [],
      bills: [],
      reservations: [],
      uploads: {},
      storefront: {
        restaurant: "THE GOLDEN SPOON",
        banner_kicker: "GOOD FOOD, MADE FRESH",
        banner_title: "What are you craving?",
        banner_subtitle: "Choose your table, pick your favourites, and we’ll take care of the rest.",
        banner_image: "",
        logo_image: "",
        menu_images: {},
        colors: {
          background: "#f4efe2",
          surface: "#fffaf0",
          header: "#c9a23b",
          banner: "#d0ac49",
          primary: "#b51f2b",
          heading: "#a51b26",
          text: "#342817"
        }
      },
      nextMenuId: menu.length + 1,
      nextTableId: 9,
      nextOrderId: 1,
      nextBillId: 1,
      nextReservationId: 1
    };
  }

  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? initialData() : JSON.parse(saved);
    } catch (error) {
      throw new Error("Browser storage is unavailable or corrupted. Open this site in a regular browser window and check its storage settings.");
    }
  }

  let data = loadData();

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function save(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      if (error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
        throw new Error("Browser storage is full. Remove uploaded photos or use smaller images, then try again.");
      }
      throw new Error("Could not save data in this browser: " + (error.message || error));
    }
    data = next;
  }

  function change(fn) {
    const next = copy(data);
    const result = fn(next);
    save(next);
    return result;
  }

  function fail(message) {
    throw new Error(message);
  }

  function now() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function dateToday() {
    return now().slice(0, 10);
  }

  function randomHex(bytes = 16) {
    const values = new Uint8Array(bytes);
    crypto.getRandomValues(values);
    return [...values].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  function cleanText(body, key, label, limit = 60) {
    const value = String(body[key] ?? "").trim();
    if (!value) fail(`${label} is required`);
    if (value.length > limit) fail(`${label} must be ${limit} characters or fewer`);
    return value;
  }

  function number(body, key, label, min, max, integer = false) {
    const value = Number(body[key]);
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
      fail(`Enter a valid ${label}`);
    }
    if (value < min || value > max) fail(`${label} must be between ${min} and ${max}`);
    return value;
  }

  function admin(actor) {
    if (actor.role !== "admin") fail("Admin access required");
  }

  function restaurantInfo() {
    return {restaurant: data.storefront.restaurant, address: "", phone: "", gstin: ""};
  }

  function actorUser(actor) {
    return data.users.find(user => user.username === actor.name);
  }

  function menuFor(actor) {
    return data.menu
      .filter(item => actor.role !== "customer" || item.available)
      .slice()
      .sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id)
      .map(item => copy(item));
  }

  function tableList(actor) {
    const openOrders = data.orders.filter(order => order.status === "Open");
    return data.tables
      .filter(table => actor.role !== "customer" || table.status === "Free" ||
        openOrders.some(order => order.table_id === table.id && order.taken_by === actor.name))
      .slice().sort((a, b) => a.id - b.id).map(table => copy(table));
  }

  function orderItems(order) {
    return order.items.map(item => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      amount: Math.round(item.qty * item.price * 100) / 100
    }));
  }

  function openOrder(tableId) {
    return data.orders.find(order => order.table_id === tableId && order.status === "Open");
  }

  function orderList(actor) {
    return data.orders.filter(order => order.status === "Open" &&
      (actor.role !== "customer" || order.taken_by === actor.name))
      .map(order => {
        const items = orderItems(order);
        return {id: order.id, table_id: order.table_id, created: order.created,
          taken_by: order.taken_by, items,
          subtotal: items.reduce((sum, item) => sum + item.amount, 0)};
      });
  }

  function billDetail(bill, cashier) {
    const order = data.orders.find(item => item.id === bill.order_id);
    if (!order) fail("Bill not found");
    return {
      bill_id: bill.id,
      order_id: order.id,
      table_id: order.table_id,
      items: orderItems(order),
      subtotal: bill.subtotal,
      discount: bill.discount,
      discount_pct: bill.subtotal ? Math.round(bill.discount / bill.subtotal * 10000) / 100 : 0,
      gst: bill.gst,
      total: bill.total,
      method: bill.method,
      paid_at: bill.paid_at,
      cashier: cashier || order.taken_by,
      gst_rate: GST_RATE * 100,
      ...restaurantInfo()
    };
  }

  function amount(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function storefrontUpdate(body) {
    const fields = [
      ["restaurant", "Store name", 60],
      ["banner_kicker", "Banner kicker", 50],
      ["banner_title", "Banner heading", 100],
      ["banner_subtitle", "Banner message", 240]
    ];
    for (const [key, label, limit] of fields) {
      const value = String(body[key] ?? "").trim();
      if (!value) fail(`${label} is required`);
      if (value.length > limit) fail(`${label} must be ${limit} characters or fewer`);
    }
    const colors = body.colors;
    if (!colors || typeof colors !== "object") fail("Choose all storefront colors");
    const colorNames = ["background", "surface", "header", "banner", "primary", "heading", "text"];
    for (const key of colorNames) {
      if (typeof colors[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(colors[key])) {
        fail(`Invalid color: ${key}`);
      }
    }
    return change(next => {
      for (const [key] of fields) next.storefront[key] = String(body[key]).trim();
      next.storefront.colors = Object.fromEntries(colorNames.map(key => [key, colors[key]]));
      return copy(next.storefront);
    });
  }

  function report() {
    const today = dateToday();
    const todayBills = data.bills.filter(bill => bill.paid_at.startsWith(today));
    const paidOrders = new Map(data.bills.map(bill => [bill.order_id, bill]));
    const todayOrderIds = new Set(todayBills.map(bill => bill.order_id));
    const soldToday = data.orders.filter(order => todayOrderIds.has(order.id));
    const itemTotals = new Map();
    for (const order of data.orders.filter(item => paidOrders.has(item.id))) {
      for (const item of order.items) {
        const current = itemTotals.get(item.menu_id) || {name: item.name, qty: 0, revenue: 0};
        current.qty += item.qty;
        current.revenue += item.qty * item.price;
        itemTotals.set(item.menu_id, current);
      }
    }
    const methods = new Map();
    for (const bill of data.bills) {
      const current = methods.get(bill.method) || {method: bill.method, bills: 0, total: 0};
      current.bills += 1;
      current.total += bill.total;
      methods.set(bill.method, current);
    }
    const days = new Map();
    for (const bill of data.bills) {
      const date = bill.paid_at.slice(0, 10);
      const current = days.get(date) || {date, bills: 0, total: 0};
      current.bills += 1;
      current.total += bill.total;
      days.set(date, current);
    }
    return {
      today: {
        bills: todayBills.length,
        sales: todayBills.reduce((sum, bill) => sum + bill.subtotal, 0),
        gst: todayBills.reduce((sum, bill) => sum + bill.gst, 0),
        collected: todayBills.reduce((sum, bill) => sum + bill.total, 0),
        discount: todayBills.reduce((sum, bill) => sum + bill.discount, 0),
        items: soldToday.reduce((sum, order) =>
          sum + order.items.reduce((n, item) => n + item.qty, 0), 0)
      },
      top: [...itemTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
      methods: [...methods.values()],
      days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)
    };
  }

  function csvField(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  async function request(path, body, actor = {}) {
    const [rawRoute, query = ""] = path.split("?", 2);
    const route = rawRoute.replace(/^\/api/, "");
    const params = new URLSearchParams(query);
    const method = body === undefined ? "GET" : "POST";
    const who = {name: actor.name || "", role: actor.role || ""};

    if (route === "/login" && method === "POST") {
      const user = data.users.find(item => item.username === String(body.username || ""));
      if (!user || user.password !== String(body.password || "")) fail("Wrong username or password");
      return {token: randomHex(), user: user.username, role: user.role,
        gst_rate: GST_RATE * 100, ...restaurantInfo()};
    }
    if (route === "/public/session" && method === "POST") {
      return {token: randomHex(), user: "guest_" + randomHex(12), role: "customer",
        gst_rate: GST_RATE * 100, ...restaurantInfo()};
    }
    if (route === "/me") {
      return {user: who.name, role: who.role, gst_rate: GST_RATE * 100, ...restaurantInfo()};
    }
    if (!who.role) fail("Please sign in");
    if (who.role === "customer" && !(
      (method === "GET" && ["/storefront", "/menu", "/tables", "/orders"].includes(route)) ||
      (method === "POST" && ["/orders/add", "/orders/remove"].includes(route))
    )) fail("Customer access is limited to the menu and ordering");

    if (route === "/logout") return {ok: true};
    if (route === "/storefront" && method === "GET") return copy(data.storefront);
    if (route === "/storefront" && method === "POST") {
      admin(who);
      return storefrontUpdate(body);
    }
    if (route === "/storefront/image" && method === "POST") {
      admin(who);
      const kind = body.kind;
      if (!["banner", "logo", "menu"].includes(kind)) fail("Unknown image type");
      if (kind === "menu" && !data.menu.some(item => item.id === Number(body.menu_id))) fail("Menu item not found");
      const extensions = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"};
      const extension = extensions[body.mime];
      if (!extension) fail("Use a JPG, PNG or WebP image");
      if (typeof body.data !== "string" || !body.data || body.data.length > 7_000_000) {
        fail("Image must be between 1 byte and 5 MB");
      }
      const imagePath = `/uploads/${randomHex()}.${extension}`;
      return change(next => {
        next.uploads[imagePath] = `data:${body.mime};base64,${body.data}`;
        if (kind === "menu") next.storefront.menu_images[String(Number(body.menu_id))] = imagePath;
        else next.storefront[`${kind}_image`] = imagePath;
        return {url: imagePath, storefront: copy(next.storefront)};
      });
    }
    if (route === "/storefront/image/remove" && method === "POST") {
      admin(who);
      const kind = body.kind;
      if (kind === "menu") {
        const id = String(Number(body.menu_id));
        if (!Number.isInteger(Number(body.menu_id))) fail("Choose a valid menu item");
        return change(next => {
          const old = next.storefront.menu_images[id];
          delete next.storefront.menu_images[id];
          delete next.uploads[old];
          return copy(next.storefront);
        });
      }
      if (!["banner", "logo"].includes(kind)) fail("Unknown image type");
      return change(next => {
        const key = `${kind}_image`;
        delete next.uploads[next.storefront[key]];
        next.storefront[key] = "";
        return copy(next.storefront);
      });
    }
    if (route === "/password" && method === "POST") {
      return change(next => {
        const user = next.users.find(item => item.username === who.name);
        if (!user || user.password !== String(body.old || "")) fail("Current password is wrong");
        const password = String(body.new || "");
        if (password.length < 6) fail("New password must be at least 6 characters");
        user.password = password;
        return {ok: true};
      });
    }
    if (route === "/menu" && method === "GET") return menuFor(who);
    if (route === "/menu" && method === "POST") {
      admin(who);
      const name = cleanText(body, "name", "Name");
      const category = cleanText(body, "category", "Category", 30);
      const price = number(body, "price", "price", 0.01, 100000);
      if (data.menu.some(item => item.name === name)) fail("Item already exists");
      return change(next => {
        next.menu.push({id: next.nextMenuId++, name, category, price, available: true});
        return {ok: true};
      });
    }
    if (route === "/menu/update" && method === "POST") {
      admin(who);
      const id = Number(body.id);
      const name = cleanText(body, "name", "Name");
      const category = cleanText(body, "category", "Category", 30);
      const price = number(body, "price", "price", 0.01, 100000);
      if (data.menu.some(item => item.id !== id && item.name === name)) fail("Another item already has that name");
      return change(next => {
        const item = next.menu.find(value => value.id === id);
        if (!item) fail("Menu item not found");
        Object.assign(item, {name, category, price});
        return {ok: true};
      });
    }
    if (route === "/menu/toggle" && method === "POST") {
      admin(who);
      return change(next => {
        const item = next.menu.find(value => value.id === Number(body.id));
        if (!item) fail("Menu item not found");
        item.available = !item.available;
        return {ok: true};
      });
    }
    if (route === "/menu/delete" && method === "POST") {
      admin(who);
      const id = Number(body.id);
      if (data.orders.some(order => order.items.some(item => item.menu_id === id))) {
        fail("This item has sales history. Hide it instead of deleting.");
      }
      return change(next => {
        next.menu = next.menu.filter(item => item.id !== id);
        delete next.storefront.menu_images[String(id)];
        return {ok: true};
      });
    }
    if (route === "/tables" && method === "GET") return tableList(who);
    if (route === "/tables/add" && method === "POST") {
      admin(who);
      const seats = number(body, "seats", "seats", 1, 30, true);
      return change(next => {
        const id = next.nextTableId++;
        next.tables.push({id, seats, status: "Free"});
        return {id};
      });
    }
    if (route === "/tables/delete" && method === "POST") {
      admin(who);
      const id = Number(body.id);
      const table = data.tables.find(item => item.id === id);
      if (!table) fail("No such table");
      if (table.status !== "Free") fail("Table is in use");
      if (data.orders.some(order => order.table_id === id) ||
          data.reservations.some(reservation => reservation.table_id === id)) {
        fail("This table has order or reservation history and cannot be deleted");
      }
      return change(next => {
        next.tables = next.tables.filter(item => item.id !== id);
        return {ok: true};
      });
    }
    if (route === "/orders" && method === "GET") return orderList(who);
    if (route === "/orders/add" && method === "POST") {
      const tableId = Number(body.table_id), menuId = Number(body.menu_id);
      const quantity = number(body, "qty", "Quantity", 1, 50, true);
      const table = data.tables.find(item => item.id === tableId);
      const item = data.menu.find(value => value.id === menuId && value.available);
      if (!table) fail("No such table");
      if (!item) fail("Item unavailable");
      const open = openOrder(tableId);
      if (who.role === "customer" && open && open.taken_by !== who.name) {
        fail("This table already has an active order");
      }
      if (who.role === "customer" && !open && table.status !== "Free") fail("This table is unavailable");
      return change(next => {
        let order = next.orders.find(value => value.table_id === tableId && value.status === "Open");
        if (!order) {
          order = {id: next.nextOrderId++, table_id: tableId, status: "Open",
            created: now(), taken_by: who.name, items: []};
          next.orders.push(order);
          next.tables.find(value => value.id === tableId).status = "Occupied";
        }
        const line = order.items.find(value => value.menu_id === menuId && value.price === item.price);
        if (line) line.qty += quantity;
        else order.items.push({menu_id: menuId, name: item.name, qty: quantity, price: item.price});
        return {order_id: order.id};
      });
    }
    if (route === "/orders/remove" && method === "POST") {
      const tableId = Number(body.table_id), menuId = Number(body.menu_id);
      const order = openOrder(tableId);
      if (who.role === "customer" && (!order || order.taken_by !== who.name)) {
        fail("You can only change your own order");
      }
      return change(next => {
        const current = next.orders.find(value => value.table_id === tableId && value.status === "Open");
        if (current) {
          const line = current.items.find(value => value.menu_id === menuId);
          if (line && --line.qty <= 0) current.items = current.items.filter(value => value !== line);
          if (!current.items.length) {
            current.status = "Cancelled";
            next.tables.find(value => value.id === tableId).status = "Free";
          }
        }
        return {ok: true};
      });
    }
    if (route === "/orders/cancel" && method === "POST") {
      const tableId = Number(body.table_id);
      if (!openOrder(tableId)) fail("No open order");
      return change(next => {
        next.orders.find(order => order.table_id === tableId && order.status === "Open").status = "Cancelled";
        next.tables.find(table => table.id === tableId).status = "Free";
        return {ok: true};
      });
    }
    if (route === "/bill" && method === "POST") {
      const tableId = Number(body.table_id), order = openOrder(tableId);
      if (!order) fail("No open order for this table");
      const items = orderItems(order);
      if (!items.length) fail("Order is empty");
      const discountPercent = Number(body.discount || 0);
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) fail("Discount must be 0-100");
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const discount = amount(subtotal * discountPercent / 100);
      const gst = amount((subtotal - discount) * GST_RATE);
      const total = amount(subtotal - discount + gst);
      const method = ["Cash", "Card", "UPI"].includes(body.method) ? body.method : "Cash";
      return change(next => {
        const id = next.nextBillId++;
        const bill = {id, order_id: order.id, subtotal, discount, gst, total, method, paid_at: now()};
        next.bills.push(bill);
        next.orders.find(item => item.id === order.id).status = "Paid";
        next.tables.find(item => item.id === tableId).status = "Free";
        return billDetail(bill, who.name);
      });
    }
    if (route === "/bills" && method === "GET") {
      const date = params.get("date") || "";
      return data.bills.filter(bill => !date || bill.paid_at.startsWith(date))
        .slice().sort((a, b) => b.id - a.id).slice(0, 300).map(bill => {
          const order = data.orders.find(item => item.id === bill.order_id);
          return {id: bill.id, table_id: order.table_id, total: bill.total, method: bill.method,
            paid_at: bill.paid_at, cashier: order.taken_by,
            items: order.items.reduce((sum, item) => sum + item.qty, 0)};
        });
    }
    if (route === "/bills/detail" && method === "GET") {
      const bill = data.bills.find(item => item.id === Number(params.get("id")));
      if (!bill) fail("Bill not found");
      return billDetail(bill);
    }
    if (route === "/reservations" && method === "GET") {
      return data.reservations.filter(item => item.status === "Booked")
        .slice().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        .map(item => copy(item));
    }
    if (route === "/reservations" && method === "POST") {
      const name = cleanText(body, "name", "Guest name");
      const phone = cleanText(body, "phone", "Phone", 18);
      if (!/^[0-9+\-\s()]{7,18}$/.test(phone)) fail("Enter a valid phone number");
      const guests = number(body, "guests", "Guests", 1, 50, true);
      const date = String(body.date || ""), time = String(body.time || "");
      const when = new Date(`${date}T${time}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) ||
          Number.isNaN(when.getTime())) fail("Check guests, date and time");
      if (when < new Date()) fail("Choose a future date and time");
      const free = data.tables.filter(table => table.seats >= guests)
        .filter(table => !data.reservations.some(reservation => reservation.status === "Booked" &&
          reservation.table_id === table.id && reservation.date === date && reservation.time === time))
        .sort((a, b) => a.seats - b.seats || a.id - b.id)[0];
      if (!free) fail("No table available for that slot");
      return change(next => {
        const id = next.nextReservationId++;
        next.reservations.push({id, name, phone, table_id: free.id, date, time, guests, status: "Booked"});
        return {id, table_id: free.id};
      });
    }
    if (route === "/reservations/cancel" && method === "POST") {
      return change(next => {
        const reservation = next.reservations.find(item => item.id === Number(body.id));
        if (reservation) reservation.status = "Cancelled";
        return {ok: true};
      });
    }
    if (route === "/users" && method === "GET") {
      admin(who);
      return data.users.slice().sort((a, b) => a.role.localeCompare(b.role) ||
        a.username.localeCompare(b.username)).map(({username, role}) => ({username, role}));
    }
    if (route === "/users/add" && method === "POST") {
      admin(who);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const role = ["admin", "staff", "customer"].includes(body.role) ? body.role : "staff";
      if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username)) fail("Username: 3-20 letters, numbers, . _ -");
      if (password.length < 6) fail("Password must be at least 6 characters");
      if (data.users.some(user => user.username === username)) fail("Username already exists");
      return change(next => {
        next.users.push({username, password, role});
        return {ok: true};
      });
    }
    if (route === "/users/delete" && method === "POST") {
      admin(who);
      const username = String(body.username || "");
      if (username === who.name) fail("You cannot delete your own account");
      const user = data.users.find(item => item.username === username);
      if (!user) fail("No such user");
      if (user.role === "admin" && data.users.filter(item => item.role === "admin").length <= 1) {
        fail("At least one admin must remain");
      }
      return change(next => {
        next.users = next.users.filter(item => item.username !== username);
        return {ok: true};
      });
    }
    if (route === "/report" && method === "GET") {
      admin(who);
      return report();
    }
    if (route === "/export/bills" && method === "GET") {
      admin(who);
      const rows = [
        ["Bill ID", "Order ID", "Table", "Paid at", "Subtotal", "Discount", "GST", "Total", "Method", "Cashier"]
      ];
      for (const bill of data.bills.slice().sort((a, b) => a.id - b.id)) {
        const order = data.orders.find(item => item.id === bill.order_id);
        rows.push([bill.id, bill.order_id, order.table_id, bill.paid_at, bill.subtotal,
          bill.discount, bill.gst, bill.total, bill.method, order.taken_by]);
      }
      return "\uFEFF" + rows.map(row => row.map(csvField).join(",")).join("\r\n");
    }
    fail("Not found");
  }

  function image(path) {
    if (typeof path !== "string" || !/^\/uploads\/[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(path)) return "";
    return data.uploads[path] || "";
  }

  window.rmsLocal = {request, image};
})();
