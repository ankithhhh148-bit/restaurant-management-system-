(() => {
  "use strict";

  const STORAGE_KEY = "restaurant-static-demo-v1";
  const DEFAULT_ACCOUNTS = [
    {email: "admin@restaurant.local", password: "admin123", username: "admin", role: "admin"},
    {email: "staff@restaurant.local", password: "staff123", username: "staff", role: "staff"}
  ];
  let activeRole = null;
  const menu = [
    {id: 1, name: "Cold Coffee", category: "Coffee", price: 120, available: true},
    {id: 2, name: "Hot Coffee", category: "Coffee", price: 80, available: true},
    {id: 3, name: "Chilli Chicken", category: "Chicken", price: 220, available: true},
    {id: 4, name: "Tandoori Chicken", category: "Chicken", price: 280, available: true},
    {id: 5, name: "Chicken Burger", category: "Burger", price: 180, available: true},
    {id: 6, name: "Veg Burger", category: "Burger", price: 150, available: true},
    {id: 7, name: "Cheese Pasta", category: "Pasta", price: 190, available: true},
    {id: 8, name: "Normal Pasta", category: "Pasta", price: 160, available: true}
  ];
  const initialState = () => ({
    menu: menu.map(item => ({...item})),
    tables: Array.from({length: 8}, (_, index) => ({id: index + 1, seats: 4})),
    orders: [],
    bills: [],
    reservations: [],
    accounts: DEFAULT_ACCOUNTS.map(account => ({...account})),
    storefront: {
      restaurant: "THE GOLDEN SPOON",
      address: "",
      phone: "",
      gstin: "",
      gst_rate: 5,
      banner_kicker: "GOOD FOOD, MADE FRESH",
      banner_title: "What are you craving?",
      banner_subtitle: "Choose your table, pick your favourites, and we’ll take care of the rest.",
      banner_image: "",
      logo_image: "",
      menu_images: {},
      colors: {background: "#f4efe2", surface: "#fffaf0", header: "#d0ac49", primary: "#b51f2b", heading: "#8f1b24", text: "#342817"}
    }
  });

  function loadState() {
    let saved;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      throw new Error("Browser storage is unavailable. Enable local storage to continue.");
    }
    if (saved === null) {
      const state = initialState();
      saveState(state);
      return state;
    }
    try {
      const state = JSON.parse(saved);
      if (!state || !Array.isArray(state.menu) || !Array.isArray(state.tables) ||
          !Array.isArray(state.orders) || !state.storefront) {
        throw new Error("Invalid saved data");
      }
      if (!Array.isArray(state.bills)) state.bills = [];
      if (!Array.isArray(state.reservations)) state.reservations = [];
      if (!Array.isArray(state.accounts)) state.accounts = DEFAULT_ACCOUNTS.map(account => ({...account}));
      return state;
    } catch (error) {
      throw new Error("Saved restaurant data is invalid. Clear this site's local storage to reset the demo.");
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      throw new Error("Could not save this change. Check available browser storage.");
    }
  }

  function orderSummary(order) {
    const items = order.items.map(item => ({...item, amount: item.qty * item.price}));
    return {
      ...order,
      items,
      subtotal: items.reduce((total, item) => total + item.amount, 0)
    };
  }

  async function request(path, body = {}) {
    const state = loadState();
    const requireStaff = () => {
      if (activeRole !== "admin" && activeRole !== "staff") throw new Error("Staff access required.");
    };
    const requireAdmin = () => {
      if (activeRole !== "admin") throw new Error("Administrator access required.");
    };
    if (path === "/auth/credentials") {
      requireAdmin();
      return state.accounts.map(({email, username, role}) => ({email, username, role}));
    }
    if (path === "/auth/credentials/update") {
      requireAdmin();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid admin email address.");
      if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
      const admin = state.accounts.find(account => account.role === "admin");
      if (!admin) throw new Error("Admin account was not found.");
      if (admin.password !== body.current_password) throw new Error("Current password is incorrect.");
      admin.email = email;
      admin.username = email.split("@")[0];
      admin.password = password;
      saveState(state);
      return {email: admin.email, username: admin.username, role: admin.role};
    }
    if (path === "/storefront" && Object.keys(body).length === 0) return state.storefront;
    if (path === "/storefront") {
      requireAdmin();
      const colors = body.colors;
      const gstRate = Number(body.gst_rate ?? state.storefront.gst_rate ?? 5);
      if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
        throw new Error("GST rate must be between 0 and 100.");
      }
      const next = {
        ...state.storefront,
        restaurant: String(body.restaurant || "").trim() || state.storefront.restaurant,
        address: String(body.address ?? state.storefront.address),
        phone: String(body.phone ?? state.storefront.phone),
        gstin: String(body.gstin ?? state.storefront.gstin),
        gst_rate: gstRate
      };
      for (const key of ["banner_kicker", "banner_title", "banner_subtitle"]) {
        if (typeof body[key] === "string") next[key] = body[key].trim();
      }
      if (colors && typeof colors === "object") {
        next.colors = {...(state.storefront.colors || {}), ...colors};
      }
      state.storefront = next;
      saveState(state);
      return state.storefront;
    }
    if (path === "/storefront/image") {
      requireAdmin();
      if (typeof body.data !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(body.data)) {
        throw new Error("Choose a valid JPG, PNG or WebP image.");
      }
      const kind = body.kind;
      if (kind === "menu") {
        const id = Number(body.menu_id);
        if (!state.menu.some(item => item.id === id)) throw new Error("Menu item was not found.");
        state.storefront.menu_images = {...state.storefront.menu_images, [id]: body.data};
      } else if (kind === "logo" || kind === "banner") {
        state.storefront[`${kind}_image`] = body.data;
      } else {
        throw new Error("Choose a valid image type.");
      }
      saveState(state);
      return state.storefront;
    }
    if (path === "/storefront/image/remove") {
      requireAdmin();
      if (body.kind === "menu") {
        const images = {...(state.storefront.menu_images || {})};
        delete images[Number(body.menu_id)];
        state.storefront.menu_images = images;
      } else if (body.kind === "logo" || body.kind === "banner") {
        state.storefront[`${body.kind}_image`] = "";
      } else {
        throw new Error("Choose a valid image type.");
      }
      saveState(state);
      return state.storefront;
    }
    if (path === "/menu" && Object.keys(body).length === 0) return state.menu;
    if (path === "/tables") {
      return state.tables.map(table => ({
        ...table,
        status: state.orders.some(order => order.table_id === table.id) ? "Occupied" : "Free"
      }));
    }
    if (path === "/orders") return state.orders.map(orderSummary);
    if (path.startsWith("/bills?date=")) {
      requireStaff();
      const date = decodeURIComponent(path.slice("/bills?date=".length));
      return state.bills.filter(bill => !date || bill.paid_at.slice(0, 10) === date).map(bill => ({
        ...bill,
        id: bill.bill_id,
        items: bill.items.reduce((count, item) => count + item.qty, 0)
      }));
    }
    if (path.startsWith("/bills/detail?id=")) {
      requireStaff();
      const bill = state.bills.find(entry => entry.bill_id === Number(path.slice("/bills/detail?id=".length)));
      if (!bill) throw new Error("Bill was not found.");
      return bill;
    }
    if (path === "/reservations" && Object.keys(body).length === 0) {
      requireStaff();
      return state.reservations.filter(reservation => reservation.status === "Booked" && reservation.date >= new Date().toISOString().slice(0, 10));
    }
    if (path === "/reservations") {
      requireStaff();
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const guests = Number(body.guests);
      const date = String(body.date || "");
      const time = String(body.time || "");
      if (!name || name.length > 60) throw new Error("Enter the guest name (up to 60 characters).");
      if (!/^[+\d\s()-]{7,18}$/.test(phone)) throw new Error("Enter a valid phone number.");
      if (!Number.isInteger(guests) || guests < 1 || guests > 50) throw new Error("Guest count must be between 1 and 50.");
      if (!date || date < new Date().toISOString().slice(0, 10) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Choose a valid future date and time.");
      const reservedTableIds = state.reservations
        .filter(reservation => reservation.status === "Booked" && reservation.date === date && reservation.time === time)
        .map(reservation => reservation.table_id);
      const table = state.tables.find(entry =>
        entry.seats >= guests && !reservedTableIds.includes(entry.id) &&
        !state.orders.some(order => order.table_id === entry.id)
      );
      if (!table) throw new Error("No suitable table is available for that time.");
      const reservation = {id: Date.now(), name, phone, guests, date, time, table_id: table.id, status: "Booked"};
      state.reservations.push(reservation);
      saveState(state);
      return reservation;
    }
    if (path === "/reservations/cancel") {
      requireStaff();
      const reservation = state.reservations.find(entry => entry.id === Number(body.id));
      if (!reservation) throw new Error("Reservation was not found.");
      reservation.status = "Cancelled";
      saveState(state);
      return true;
    }
    if (path === "/report") {
      requireAdmin();
      const today = new Date().toISOString().slice(0, 10);
      const todayBills = state.bills.filter(bill => bill.paid_at.slice(0, 10) === today);
      const days = Array.from({length: 7}, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - index);
        const key = date.toISOString().slice(0, 10);
        const matches = state.bills.filter(bill => bill.paid_at.slice(0, 10) === key);
        return {date: key, bills: matches.length, total: matches.reduce((sum, bill) => sum + bill.total, 0)};
      });
      const itemTotals = new Map();
      for (const bill of state.bills) {
        for (const item of bill.items) {
          const current = itemTotals.get(item.name) || {name: item.name, qty: 0, revenue: 0};
          current.qty += item.qty;
          current.revenue += item.amount;
          itemTotals.set(item.name, current);
        }
      }
      const methods = new Map();
      for (const bill of state.bills) {
        const current = methods.get(bill.method) || {method: bill.method, bills: 0, total: 0};
        current.bills += 1;
        current.total += bill.total;
        methods.set(bill.method, current);
      }
      return {
        today: {
          collected: todayBills.reduce((sum, bill) => sum + bill.total, 0),
          bills: todayBills.length,
          items: todayBills.reduce((sum, bill) => sum + bill.items.reduce((n, item) => n + item.qty, 0), 0),
          gst: todayBills.reduce((sum, bill) => sum + bill.gst, 0),
          discount: todayBills.reduce((sum, bill) => sum + bill.discount, 0)
        },
        days,
        top: [...itemTotals.values()].sort((a, b) => b.revenue - a.revenue),
        methods: [...methods.values()]
      };
    }

    if (path === "/orders/add") {
      const tableId = Number(body.table_id);
      const item = state.menu.find(entry => entry.id === Number(body.menu_id) && entry.available);
      if (!state.tables.some(table => table.id === tableId)) throw new Error("Choose a valid table.");
      if (!item) throw new Error("This menu item is unavailable.");
      let order = state.orders.find(entry => entry.table_id === tableId);
      if (!order) {
        order = {
          id: Date.now(),
          table_id: tableId,
          created: new Date().toISOString().slice(0, 19).replace("T", " "),
          taken_by: "Guest",
          items: []
        };
        state.orders.push(order);
      }
      const line = order.items.find(entry => entry.menu_id === item.id);
      if (line) line.qty += 1;
      else order.items.push({menu_id: item.id, name: item.name, qty: 1, price: Number(item.price)});
      saveState(state);
      return orderSummary(order);
    }

    if (path === "/orders/remove") {
      const order = state.orders.find(entry => entry.table_id === Number(body.table_id));
      if (!order) throw new Error("No open order was found for this table.");
      const line = order.items.find(entry => entry.menu_id === Number(body.menu_id));
      if (!line) throw new Error("This item is not in the current order.");
      line.qty -= 1;
      if (line.qty <= 0) order.items = order.items.filter(entry => entry !== line);
      if (order.items.length === 0) state.orders = state.orders.filter(entry => entry !== order);
      saveState(state);
      return true;
    }

    if (path === "/bill") {
      requireStaff();
      const tableId = Number(body.table_id);
      const orderIndex = state.orders.findIndex(entry => entry.table_id === tableId);
      if (orderIndex < 0) throw new Error("No open order was found for this table.");
      const order = orderSummary(state.orders[orderIndex]);
      const discountPct = Math.max(0, Math.min(100, Number(body.discount) || 0));
      const discount = Math.round(order.subtotal * discountPct) / 100;
      const gstRate = Number(state.storefront.gst_rate) || 5;
      const gst = Math.round((order.subtotal - discount) * gstRate) / 100;
      const bill = {
        bill_id: Math.max(0, ...state.bills.map(entry => entry.bill_id)) + 1,
        table_id: tableId,
        paid_at: new Date().toISOString().slice(0, 16).replace("T", " "),
        cashier: state.accounts.find(account => account.role === activeRole)?.username || activeRole,
        items: order.items,
        subtotal: order.subtotal,
        discount,
        discount_pct: discountPct,
        gst_rate: gstRate,
        gst,
        total: order.subtotal - discount + gst,
        method: ["Cash", "Card", "UPI"].includes(body.method) ? body.method : "Cash",
        restaurant: state.storefront.restaurant
      };
      state.bills.push(bill);
      state.orders.splice(orderIndex, 1);
      saveState(state);
      return bill;
    }

    if (path === "/menu" && Object.keys(body).length) {
      requireAdmin();
      const name = String(body.name || "").trim();
      const category = String(body.category || "").trim();
      const price = Number(body.price);
      if (name.length > 60 || category.length > 30 || !name || !category || !(price > 0) || price > 100000) {
        throw new Error("Enter a menu name (up to 60 characters), category (up to 30), and price up to ₹100,000.");
      }
      if (state.menu.some(item => item.name.toLowerCase() === name.toLowerCase())) throw new Error("That menu item already exists.");
      const item = {id: Math.max(0, ...state.menu.map(entry => entry.id)) + 1, name, category, price, available: true};
      state.menu.push(item);
      saveState(state);
      return item;
    }
    if (path === "/menu/update") {
      requireAdmin();
      const item = state.menu.find(entry => entry.id === Number(body.id));
      if (!item) throw new Error("Menu item was not found.");
      const name = String(body.name || "").trim();
      const category = String(body.category || "").trim();
      const price = Number(body.price);
      if (name.length > 60 || category.length > 30 || !name || !category || !(price > 0) || price > 100000) {
        throw new Error("Enter a menu name (up to 60 characters), category (up to 30), and price up to ₹100,000.");
      }
      if (state.menu.some(entry => entry.id !== item.id && entry.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("That menu item already exists.");
      }
      item.name = name; item.category = category; item.price = price;
      saveState(state);
      return item;
    }
    if (path === "/menu/toggle") {
      requireAdmin();
      const item = state.menu.find(entry => entry.id === Number(body.id));
      if (!item) throw new Error("Menu item was not found.");
      item.available = !item.available;
      saveState(state);
      return item;
    }
    if (path === "/menu/delete") {
      requireAdmin();
      const id = Number(body.id);
      if (!state.menu.some(entry => entry.id === id)) throw new Error("Menu item was not found.");
      if (state.orders.some(order => order.items.some(item => item.menu_id === id))) {
        throw new Error("Remove this item from open orders before deleting it.");
      }
      state.menu = state.menu.filter(entry => entry.id !== id);
      const images = {...(state.storefront.menu_images || {})};
      delete images[id];
      state.storefront.menu_images = images;
      saveState(state);
      return true;
    }
    if (path === "/users") {
      requireAdmin();
      return state.accounts.map(({email, username, role}) => ({email, username, role}));
    }
    if (path === "/users/add") {
      requireAdmin();
      const username = String(body.username || "").trim();
      const role = body.role === "admin" ? "admin" : "staff";
      const password = String(body.password || "");
      if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) throw new Error("Username must be 2-30 letters, numbers, underscores or hyphens.");
      if (password.length < 6) throw new Error("Password must have at least 6 characters.");
      const email = `${username.toLowerCase()}@restaurant.local`;
      if (state.accounts.some(account => account.email.toLowerCase() === email)) throw new Error("That username already exists.");
      state.accounts.push({email, username, password, role});
      saveState(state);
      return {email, username, role};
    }
    if (path === "/users/remove") {
      requireAdmin();
      const account = state.accounts.find(entry => entry.email === body.email);
      if (!account || account.role === "admin") throw new Error("This account cannot be removed.");
      state.accounts = state.accounts.filter(entry => entry !== account);
      saveState(state);
      return true;
    }
    if (path === "/tables/add") {
      requireAdmin();
      const seats = Number(body.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 30) throw new Error("Table capacity must be between 1 and 30.");
      const table = {id: Math.max(0, ...state.tables.map(entry => entry.id)) + 1, seats};
      state.tables.push(table);
      saveState(state);
      return table;
    }
    if (path === "/tables/delete") {
      requireAdmin();
      const id = Number(body.id);
      if (!state.tables.some(table => table.id === id)) throw new Error("Table was not found.");
      if (state.orders.some(order => order.table_id === id) ||
          state.reservations.some(reservation => reservation.table_id === id && reservation.status === "Booked") ||
          state.bills.some(bill => bill.table_id === id)) {
        throw new Error("Cannot delete a table with an open order, reservation, or bill history.");
      }
      state.tables = state.tables.filter(table => table.id !== id);
      saveState(state);
      return true;
    }
    if (path.startsWith("/export/bills")) {
      requireStaff();
      const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
      return ["Bill,Date,Table,Items,Method,Cashier,Total", ...state.bills.map(bill =>
        [bill.bill_id, bill.paid_at, bill.table_id, bill.items.map(item => `${item.name} x ${item.qty}`).join("; "), bill.method, bill.cashier, bill.total].map(quote).join(",")
      )].join("\r\n");
    }

    if (path === "/orders/cancel") {
      state.orders = state.orders.filter(entry => entry.table_id !== Number(body.table_id));
      saveState(state);
      return true;
    }

    throw new Error("This feature is not available.");
  }

  function session() {
    return {user: "Guest", role: "customer", gst_rate: 5};
  }

  function login(email, password) {
    const state = loadState();
    const account = state.accounts.find(entry =>
      entry.email.toLowerCase() === String(email).trim().toLowerCase() && entry.password === password
    );
    if (!account) throw new Error("Email or password is incorrect.");
    activeRole = account.role;
    return {user: account.username, email: account.email, role: account.role, gst_rate: 5};
  }

  function signOut() {
    activeRole = null;
  }

  function loginHint() {
    const accounts = loadState().accounts;
    const admin = accounts.find(account => account.role === "admin");
    const staff = accounts.find(account => account.role === "staff");
    const adminHint = admin?.password === "admin123"
      ? `Default admin: ${admin.email} / admin123`
      : `Admin email: ${admin?.email || "not configured"} (use the password set in Settings)`;
    const staffHint = staff?.password === "staff123"
      ? `Staff: ${staff.email} / staff123`
      : `Staff email: ${staff?.email || "not configured"}`;
    return `${adminHint}\n${staffHint}`;
  }

  window.rmsStatic = {request, session, login, signOut, loginHint};
})();
