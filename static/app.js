const $ = s => document.querySelector(s);
let token = null, role = null, me = "", info = {}, gstRate = 5;
let storefront = {};
const noImg = new Set();
let tab = "orders", selTable = null, cat = "All", query = "", billDate = "", busy = false;
let liveRefreshTimer = null, liveRefreshPending = false;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pl = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const rs = n => "₹" + Number(n || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const todayStr = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const parseDT = s => new Date(String(s).replace(" ", "T"));
const ago = s => { const m = Math.max(0, Math.floor((Date.now() - parseDT(s)) / 6e4)); return m < 60 ? m + "m" : Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m"; };

/* ---------- icons ---------- */
const ic = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  orders: ic('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
  bills: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 3-2V8z"/><path d="M14 2v6h6M8 13h8M8 9h2"/>'),
  reservations: ic('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  menu: ic('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>'),
  reports: ic('<path d="M18 20V10M12 20V4M6 20v-6"/>'),
  settings: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  moon: ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')
};
const TITLES = {orders: "Orders & Billing", bills: "Bill History", reservations: "Reservations", menu: "Menu", reports: "Reports & Analytics", settings: "Settings"};

/* ---------- dish look ---------- */
const LOOKS = {Coffee: ["☕", "#e8dccf"], Pasta: ["🍝", "#f6e3cf"], Burger: ["🍔", "#f3e2c3"], Chicken: ["🍗", "#f7d9cc"]};
function look(m) { const [e, bg] = LOOKS[m.category] || ["🍽️", "#e9edf3"]; return {e: /cold/i.test(m.name) ? "🧋" : e, bg}; }
const isVeg = m => !/chicken|mutton|fish|prawn|egg|lamb|beef|pork|keema|kebab/i.test(m.name);

/* ---------- ui helpers ---------- */
function toast(msg, err) {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = "", 2800);
}
function dialog(html, cls = "dlg") { $("#box").className = "box " + cls; $("#box").innerHTML = html; $("#modal").hidden = false;
  const f = $("#box").querySelector("input,select"); if (f && cls === "dlg") f.focus(); }
const closeDialog = () => { $("#modal").hidden = true; resumeLiveRefresh(); };
const modalOpen = () => !$("#modal").hidden;

function scheduleLiveRefresh() {
  const active = document.activeElement;
  if (busy || modalOpen() || (active && /INPUT|SELECT|TEXTAREA/.test(active.tagName))) {
    liveRefreshPending = true;
    return;
  }
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => { liveRefreshPending = false; render(); }, 120);
}
function resumeLiveRefresh() {
  if (liveRefreshPending) scheduleLiveRefresh();
}
async function api(path, body) {
  return window.rmsStatic.request(path, body);
}
const act = async (fn, ok) => {
  if (busy) return; busy = true;
  try { await fn(); if (ok) toast(ok); await render(); } catch (e) { toast(e.message, 1); } finally { busy = false; resumeLiveRefresh(); }
};

/* ---------- theme ---------- */
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("rms-theme", t); } catch (e) {}
  $("#themebtn").innerHTML = t === "dark" ? ICONS.sun : ICONS.moon; }
setTheme(document.documentElement.dataset.theme || "light");

/* ---------- session ---------- */
function imageUrl(path) {
  return typeof path === "string" ? path : "";
}
function applyStorefront() {
  const logo = imageUrl(storefront.logo_image) || "images/golden-spoon-logo.png";
  document.querySelectorAll(".brandrow .logo").forEach(img => { img.src = logo; });
  if (role !== "customer") {
    for (const variable of ["--bg", "--surface", "--navy", "--brand", "--txt", "--store-heading", "--store-banner"]) {
      document.body.style.removeProperty(variable);
    }
    return;
  }
  const c = storefront.colors || {};
  const vars = {background: "--bg", surface: "--surface", header: "--navy", primary: "--brand", text: "--txt"};
  for (const [key, variable] of Object.entries(vars)) {
    if (/^#[0-9a-f]{6}$/i.test(c[key] || "")) document.body.style.setProperty(variable, c[key]);
  }
  if (/^#[0-9a-f]{6}$/i.test(c.heading || "")) document.body.style.setProperty("--store-heading", c.heading);
  if (/^#[0-9a-f]{6}$/i.test(c.banner || "")) document.body.style.setProperty("--store-banner", c.banner);
}
async function enter(d) {
  role = d.role; me = d.user; info = d; gstRate = d.gst_rate ?? 5;
  storefront = await api("/storefront");
  info.restaurant = storefront.restaurant;
  info.address = storefront.address || "";
  info.phone = storefront.phone || "";
  info.gstin = storefront.gstin || "";
  gstRate = Number(storefront.gst_rate) || gstRate;
  document.body.dataset.role = role;
  applyStorefront();
  $("#login").hidden = true; $("#app").hidden = false;
  $("#brand").textContent = storefront.restaurant;
  $("#uname").textContent = d.user;
  $("#urole").textContent = d.role.charAt(0).toUpperCase() + d.role.slice(1);
  $("#avatar").textContent = d.user.charAt(0).toUpperCase();
  $("#admin-access").textContent = d.role === "customer" ? "Admin / Staff" : "Sign out";
  $("#date").textContent = new Date().toLocaleDateString("en-IN", {weekday: "short", day: "numeric", month: "short", year: "numeric"});
  document.title = storefront.restaurant + " · Order online";
  tab = "orders"; billDate = todayStr(); render();
}
async function openStorefront() {
  try {
    window.rmsStatic.signOut();
    token = "static"; await enter(window.rmsStatic.session());
  } catch (e) {
    toast(e.message || "Could not load this browser's saved data.", 1);
  }
}
function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-hint").textContent = window.rmsStatic.loginHint();
  $("#login-email").focus();
}
async function signIn(e) {
  e.preventDefault();
  try {
    const d = window.rmsStatic.login($("#login-email").value, $("#login-password").value);
    token = "static"; await enter(d);
    $("#login-form").reset();
  } catch (error) {
    toast(error.message, 1);
  }
}
$("#login-form").addEventListener("submit", signIn);
$("#login-back").onclick = () => { $("#login").hidden = true; openStorefront(); };
$("#admin-access").onclick = () => role === "customer" ? showLogin() : openStorefront();
openStorefront();

setInterval(() => { const c = $("#clock"); if (c) c.textContent = new Date().toLocaleTimeString("en-IN", {hour: "2-digit", minute: "2-digit"}); }, 1000);
setInterval(() => { /* live refresh of the floor, but never while someone is typing */
  const a = document.activeElement;
  if (token && tab === "orders" && !modalOpen() && !busy && !document.hidden && !(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) render();
}, 20000);

/* ---------- navigation ---------- */
function render() {
  const tabs = role === "customer" ? ["orders", "menu"] : ["orders", "bills", "reservations", "menu"];
  if (role === "admin") tabs.push("reports", "settings");
  if (!tabs.includes(tab)) tab = "orders";
  $("#nav").innerHTML = tabs.map(k => `<button data-tab="${k}" class="${k === tab ? "on" : ""}" ${k === tab ? 'aria-current="page"' : ""}>${ICONS[k]}<span>${role === "customer" && k === "orders" ? "Order" : TITLES[k]}</span></button>`).join("");
  $("#title").textContent = role === "customer" && tab === "orders" ? "Place an order" : TITLES[tab];
  return views[tab]($("#view")).catch(e => toast(e.message, 1));
}

/* ---------- views ---------- */
const views = {
  async orders(v) {
    const customer = role === "customer";
    const bannerImage = imageUrl(storefront.banner_image);
    const bannerKicker = storefront.banner_kicker || "GOOD FOOD, MADE FRESH";
    const bannerTitle = storefront.banner_title || "What are you craving?";
    const bannerSubtitle = storefront.banner_subtitle || "";
    const bannerArtwork = !bannerImage && bannerKicker === "GOOD FOOD, MADE FRESH" &&
      bannerTitle === "What are you craving?" &&
      bannerSubtitle === "Choose your table, pick your favourites, and we’ll take care of the rest.";
    const bannerBackground = bannerImage ? `background-image:url('${bannerImage}')` :
      bannerArtwork ? "background-image:url('images/customer-banner.png?v=4')" : "";
    const [tables, menu, orders] = await Promise.all([api("/tables"), api("/menu"), api("/orders")]);
    const byTable = Object.fromEntries(orders.map(o => [o.table_id, o]));
    const cur = byTable[selTable];
    const cats = ["All", ...new Set(menu.filter(m => m.available).map(m => m.category))];
    if (!cats.includes(cat)) cat = "All";
    const q = query.toLowerCase();
    const shown = menu.filter(m => m.available && (cat === "All" || m.category === cat) && m.name.toLowerCase().includes(q));
    const qty = {}; (cur ? cur.items : []).forEach(i => qty[i.name] = i.qty);
    const count = s => tables.filter(t => t.status === s).length;
    const idOf = n => menu.find(m => m.name === n)?.id;

    const dish = m => {
      const base = m.name.replace(/\s*\(.*?\)\s*/g, "").trim(), size = (m.name.match(/\((.*?)\)/) || [])[1], l = look(m);
      return `<article class="dish" data-name="${esc(m.name.toLowerCase())}">
        <div class="ph" style="background:${l.bg}"><span>${l.e}</span>
          ${noImg.has(slug(base)) ? "" : `<img loading="lazy" src="${esc(imageUrl(storefront.menu_images?.[m.id]) || `images/${slug(base)}.jpg`)}" alt="${esc(base)}" onerror="noImg.add('${slug(base)}');this.remove()">`}
          ${size ? `<em class="size">${esc(size)}</em>` : ""}
          <i class="vn ${isVeg(m) ? "veg" : "nonveg"}" title="${isVeg(m) ? "Vegetarian" : "Non-vegetarian"}"></i></div>
        <div class="info"><h4>${esc(base)}</h4><small>${esc(m.category)}</small>
          <div class="buy"><b>${rs(m.price)}</b>
          <button class="${qty[m.name] ? "added" : "add"}" data-add="${m.id}">${qty[m.name] ? "Added · " + qty[m.name] : "Add"}</button></div></div></article>`;
    };

    const nItems = cur ? cur.items.reduce((a, i) => a + i.qty, 0) : 0;
    const panel = !selTable ? `<div class="empty">${ICONS.orders}<p>Select your table to start an order.</p></div>` :
      !cur ? `<div class="empty">${ICONS.menu}<p>No items yet. Tap <b>Add</b> on any dish.</p></div>` : `
        <div class="lines">${cur.items.map(i => `<div class="row"><span class="nm">${esc(i.name)}<small>${rs(i.price)} each</small></span>
          <span class="q"><button data-rem="${idOf(i.name)}" aria-label="Remove one ${esc(i.name)}">−</button><b>${i.qty}</b><button data-add="${idOf(i.name)}" aria-label="Add one ${esc(i.name)}">+</button></span>
          <span class="amt">${rs(i.amount)}</span></div>`).join("")}</div>
        ${customer ? `<div class="sum"><div><span>Subtotal · ${nItems} item${nItems === 1 ? "" : "s"}</span><span>${rs(cur.subtotal)}</span></div>
          <div class="muted"><span>GST ${gstRate}%</span><span>${rs(cur.subtotal * gstRate / 100)}</span></div>
          <div class="tot"><span>Estimated total</span><span>${rs(cur.subtotal * (1 + gstRate / 100))}</span></div>
          <p class="muted tiny">Saved in this browser only. This order has not been sent to restaurant staff.</p></div>` : `<div class="sum" data-sub="${cur.subtotal}">
          <div><span>Subtotal · ${nItems} item${nItems === 1 ? "" : "s"}</span><span>${rs(cur.subtotal)}</span></div>
          <div class="muted"><span>Discount</span><span id="tdisc">− ${rs(0)}</span></div>
          <div class="muted"><span>GST ${gstRate}%</span><span id="tgst">${rs(cur.subtotal * gstRate / 100)}</span></div>
          <div class="tot"><span>Total</span><span id="ttot">${rs(cur.subtotal * (1 + gstRate / 100))}</span></div></div>
        <div class="two"><div><label for="disc">Discount %</label><input id="disc" type="number" min="0" max="100" step="0.5" value="0"></div>
        <div><label for="pay">Payment</label><select id="pay"><option>Cash</option><option>Card</option><option>UPI</option></select></div></div>
        <div class="acts"><button class="primary" data-bill>Generate bill</button><button class="danger" data-cancel>Cancel order</button></div>`}`;

    v.innerHTML = `
      ${customer ? `<section class="customer-hero${bannerArtwork ? " banner-artwork" : ""}" ${bannerArtwork ? `role="img" aria-label="${esc([bannerKicker, bannerTitle, bannerSubtitle].filter(Boolean).join(". "))}"` : ""} style="${bannerBackground}"><div${bannerArtwork ? ' aria-hidden="true"' : ""}><span class="eyebrow">${esc(bannerKicker)}</span><h2>${esc(bannerTitle)}</h2>
        <p>${esc(bannerSubtitle)}</p></div>${bannerImage || bannerArtwork ? "" : `<span class="hero-food" aria-hidden="true">🍗</span>`}</section>` : ""}
      ${customer ? "" : `<div class="kpis">
        <div class="kpi"><small>Tables</small><b>${tables.length}</b></div>
        <div class="kpi ok"><small>Available</small><b>${count("Free")}</b></div>
        <div class="kpi bad"><small>Occupied</small><b>${count("Occupied")}</b></div>
        <div class="kpi warn"><small>Open orders · value</small><b>${orders.length} <span class="sub">${rs(orders.reduce((a, o) => a + o.subtotal, 0))}</span></b></div>
      </div>`}
      <div class="strip">${tables.map(t => { const o = byTable[t.id]; return `<button class="tbl ${t.status.toLowerCase()} ${t.id === selTable ? "sel" : ""}" data-table="${t.id}">
        <span class="dot"></span><b>Table ${t.id}</b><small>${t.seats} seats${customer ? (o ? " · Your order" : " · Available") : ` · ${t.status}${o ? " · " + ago(o.created) : ""}`}</small>${!customer && o ? `<small class="amt">${rs(o.subtotal)}</small>` : ""}</button>`; }).join("")}</div>
      <div class="pos"><section>
        <div class="toolbar"><div class="pills">${cats.map(c => `<button class="${c === cat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
          <input id="q" class="search" type="search" placeholder="Search menu…  ( / )" value="${esc(query)}" aria-label="Search menu"></div>
        <div class="legend"><i class="vn veg"></i> Veg <i class="vn nonveg"></i> Non-veg</div>
        <div class="dishes">${shown.map(dish).join("") || `<p class="muted">No dishes match your search.</p>`}</div></section>
        <aside class="order"><div class="ohead"><h3>${selTable ? "Table " + selTable : "Current order"}</h3>${cur ? `<span class="tag">Open · ${ago(cur.created)}</span>` : ""}</div>
          ${cur && !customer ? `<p class="muted tiny">Taken by ${esc(cur.taken_by || "—")} · Order #${cur.id}</p>` : ""}${panel}</aside></div>`;
  },

  async bills(v) {
    const list = await api("/bills?date=" + encodeURIComponent(billDate || ""));
    const total = list.reduce((a, b) => a + b.total, 0);
    v.innerHTML = `<div class="panel"><div class="phead"><h3>Bills <span class="count">${list.length}</span></h3>
      <div class="filters"><label for="bd" class="inl">Date</label><input id="bd" type="date" value="${esc(billDate)}" max="${todayStr()}">
      <button class="sm" data-bdall>All dates</button><button class="sm" data-bdtoday>Today</button></div></div>
      <p class="muted">Total collected${billDate ? " on " + esc(billDate) : ""}: <b>${rs(total)}</b></p>
      ${list.length ? `<div class="scroll"><table><tr><th>Bill</th><th>Time</th><th>Table</th><th>Items</th><th>Method</th><th>Cashier</th><th class="r">Total</th><th></th></tr>
      ${list.map(b => `<tr><td><b>#${b.id}</b></td><td>${esc(b.paid_at)}</td><td>T${b.table_id}</td><td>${b.items}</td><td>${esc(b.method)}</td><td>${esc(b.cashier)}</td>
        <td class="r"><b>${rs(b.total)}</b></td><td class="r"><button class="sm" data-rcpt="${b.id}">View / Print</button></td></tr>`).join("")}</table></div>`
      : `<div class="empty"><p>No bills for this date.</p></div>`}</div>`;
  },

  async reservations(v) {
    const list = await api("/reservations"), t0 = todayStr();
    v.innerHTML = `<div class="grid2 side-left">
      <div class="panel"><h3>New reservation</h3>
        <label for="rn">Guest name</label><input id="rn" placeholder="Full name" maxlength="60">
        <label for="rp">Phone</label><input id="rp" type="tel" placeholder="Contact number" maxlength="18">
        <label for="rg">Guests</label><input id="rg" type="number" min="1" max="50" placeholder="Party size">
        <div class="two"><div><label for="rd">Date</label><input id="rd" type="date" min="${t0}" value="${t0}"></div><div><label for="rt">Time</label><input id="rt" type="time"></div></div>
        <button class="primary block" data-res>Book table</button></div>
      <div class="panel"><h3>Upcoming <span class="count">${list.length}</span></h3>${list.length ? `<div class="scroll"><table><tr><th>Guest</th><th>Table</th><th>When</th><th>Guests</th><th></th></tr>
        ${list.map(r => `<tr><td><b>${esc(r.name)}</b><br><small class="muted">${esc(r.phone)}</small></td><td>T${r.table_id}</td>
        <td>${esc(r.date)} ${r.date === t0 ? `<span class="tag">Today</span>` : ""}<br><small class="muted">${esc(r.time)}</small></td><td>${r.guests}</td><td class="r"><button class="danger sm" data-rc="${r.id}">Cancel</button></td></tr>`).join("")}</table></div>`
        : `<div class="empty">${ICONS.reservations}<p>No upcoming reservations.</p></div>`}</div></div>`;
  },

  async menu(v) {
    const menu = await api("/menu"), adm = role === "admin";
    if (role === "customer") {
      v.innerHTML = `<section class="customer-menu-head"><div><span class="eyebrow">OUR MENU</span><h2>Made for good times.</h2>
        <p class="muted">Fresh favourites, prepared when you order.</p></div><button class="primary" data-tab="orders">Start an order</button></section>
        <div class="customer-menu-grid">${menu.map(m => {
          const base = m.name.replace(/\s*\(.*?\)\s*/g, "").trim(), size = (m.name.match(/\((.*?)\)/) || [])[1], l = look(m);
          return `<article class="dish"><div class="ph" style="background:${l.bg}"><span>${l.e}</span>
            ${noImg.has(slug(base)) ? "" : `<img loading="lazy" src="${esc(imageUrl(storefront.menu_images?.[m.id]) || `images/${slug(base)}.jpg`)}" alt="${esc(base)}" onerror="noImg.add('${slug(base)}');this.remove()">`}
            ${size ? `<em class="size">${esc(size)}</em>` : ""}<i class="vn ${isVeg(m) ? "veg" : "nonveg"}" title="${isVeg(m) ? "Vegetarian" : "Non-vegetarian"}"></i></div>
            <div class="info"><h3>${esc(base)}</h3><small>${esc(m.category)}</small><div class="buy"><b>${rs(m.price)}</b></div></div></article>`;
        }).join("") || `<div class="empty"><p>The menu is currently unavailable.</p></div>`}</div>`;
      return;
    }
    v.innerHTML = `<div class="grid2 side-left">${adm ? `<div class="panel"><h3>Add item</h3>
      <label for="mn">Item name</label><input id="mn" placeholder="e.g. Paneer Tikka" maxlength="60">
      <label for="mc">Category</label><input id="mc" placeholder="e.g. Starters" list="cats" maxlength="30"><datalist id="cats">${[...new Set(menu.map(m => m.category))].map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <label for="mp">Price (₹)</label><input id="mp" type="number" min="1" step="0.5" placeholder="0.00">
      <button class="primary block" data-madd>Add to menu</button>
      <p class="muted tiny">Tip: name sizes like “Paneer Tikka (Half)” / “(Full)” — they share one photo.</p></div>` : ""}
      <div class="panel ${adm ? "" : "wide"}"><h3>Menu items <span class="count">${menu.length}</span></h3><div class="scroll"><table><tr><th>Item</th><th>Category</th><th>Price</th><th>Status</th>${adm ? "<th></th>" : ""}</tr>
      ${menu.map(m => `<tr><td><i class="vn ${isVeg(m) ? "veg" : "nonveg"}"></i> <b>${esc(m.name)}</b></td><td>${esc(m.category)}</td><td>${rs(m.price)}</td>
      <td><span class="tag ${m.available ? "" : "off"}">${m.available ? "Available" : "Hidden"}</span></td>
      ${adm ? `<td class="r nowrap"><button class="sm" data-medit="${m.id}">Edit</button> <button class="sm" data-mt="${m.id}">${m.available ? "Hide" : "Show"}</button> <button class="sm danger" data-mdel="${m.id}">Delete</button></td>` : ""}</tr>`).join("")}</table></div></div></div>`;
    views.menu.cache = menu;
  },

  async reports(v) {
    const r = await api("/report");
    const avg = r.today.bills ? r.today.collected / r.today.bills : 0;
    const days = [...r.days].reverse(), maxD = Math.max(1, ...days.map(d => d.total));
    const maxT = Math.max(1, ...r.top.map(t => t.revenue)), sumM = r.methods.reduce((a, m) => a + m.total, 0) || 1;
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Collected today</small><b>${rs(r.today.collected)}</b></div>
        <div class="kpi"><small>Bills today</small><b>${r.today.bills}</b></div>
        <div class="kpi"><small>Items sold today</small><b>${r.today.items}</b></div>
        <div class="kpi"><small>Average bill</small><b>${rs(avg)}</b></div>
        <div class="kpi"><small>GST collected</small><b>${rs(r.today.gst)}</b></div>
        <div class="kpi"><small>Discounts given</small><b>${rs(r.today.discount)}</b></div>
      </div>
      <p class="actions"><button data-csv>⬇ Export all bills (CSV)</button></p>
      <div class="grid2">
        <div class="panel"><h3>Revenue · last 7 days</h3>${days.length ? `<div class="bars">${days.map(d =>
          `<div class="bar"><span class="val">${rs(d.total).replace(".00", "")}</span><i style="height:${Math.max(4, d.total / maxD * 100)}%"></i><small>${esc(d.date.slice(5))}</small></div>`).join("")}</div>`
          : `<div class="empty"><p>No bills yet.</p></div>`}</div>
        <div class="panel"><h3>Top selling items <span class="count">all time</span></h3>${r.top.length ? r.top.map(t => `<div class="hbar"><div><b>${esc(t.name)}</b><span>${t.qty} sold · ${rs(t.revenue)}</span></div>
          <div class="track"><i style="width:${t.revenue / maxT * 100}%"></i></div></div>`).join("") : `<div class="empty"><p>No sales yet.</p></div>`}</div>
        <div class="panel"><h3>By payment method</h3>${r.methods.length ? r.methods.map(t => `<div class="hbar"><div><b>${esc(t.method)}</b><span>${pl(t.bills, "bill")} · ${rs(t.total)} · ${Math.round(t.total / sumM * 100)}%</span></div>
          <div class="track"><i style="width:${t.total / sumM * 100}%"></i></div></div>`).join("") : `<div class="empty"><p>No bills yet.</p></div>`}</div>
        <div class="panel"><h3>Daily summary</h3>${r.days.length ? `<table>${r.days.map(t =>
          `<tr><td>${esc(t.date)}</td><td>${pl(t.bills, "bill")}</td><td class="r">${rs(t.total)}</td></tr>`).join("")}</table>` : `<div class="empty"><p>No bills yet.</p></div>`}</div>
      </div>`;
  },

  async settings(v) {
    const [accounts, tables, menu] = await Promise.all([api("/users"), api("/tables"), api("/menu")]);
    const admin = accounts.find(account => account.role === "admin");
    if (!admin) throw new Error("Admin account was not found.");
    const colors = storefront.colors || {};
    const colorInput = (key, label) => `<label class="color-setting"><span>${label}</span><input type="color" id="store-color-${key}" value="${/^#[0-9a-f]{6}$/i.test(colors[key] || "") ? colors[key] : "#ffffff"}"></label>`;
    const uploadTile = (kind, title, image, defaultImage = "") => `<div class="store-upload"><div class="store-thumb">${image || defaultImage ? `<img src="${esc(image || defaultImage)}" alt="">` : "Image preview"}</div>
      <b>${title}</b><label class="upload-button">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" data-store-image="${kind}"></label>
      ${image ? `<button class="sm" data-store-clear="${kind}">Use default</button>` : ""}</div>`;
    v.innerHTML = `<div class="grid2">
      <section class="panel storefront-editor full"><h3>Customer storefront template</h3>
        <p class="muted tiny">Customize the name, banner, photos and colors displayed on the storefront. Uploaded images are compressed and stored in this browser only.</p>
        <div class="grid2 store-copy">
          <div><label for="store-name">Company / restaurant name</label><input id="store-name" maxlength="60" value="${esc(storefront.restaurant || "")}">
            <label for="store-address">Address</label><input id="store-address" maxlength="180" value="${esc(storefront.address || "")}">
            <label for="store-phone">Phone</label><input id="store-phone" maxlength="30" value="${esc(storefront.phone || "")}">
            <label for="store-gstin">GSTIN</label><input id="store-gstin" maxlength="20" value="${esc(storefront.gstin || "")}">
            <label for="store-gst-rate">GST rate (%)</label><input id="store-gst-rate" type="number" min="0" max="100" step="0.1" value="${Number(storefront.gst_rate ?? 5)}">
            <label for="store-banner-kicker">Banner eyebrow</label><input id="store-banner-kicker" maxlength="50" value="${esc(storefront.banner_kicker || "")}">
            <label for="store-banner-title">Banner heading</label><input id="store-banner-title" maxlength="100" value="${esc(storefront.banner_title || "")}">
            <label for="store-banner-subtitle">Banner message</label><textarea id="store-banner-subtitle" maxlength="240" rows="3">${esc(storefront.banner_subtitle || "")}</textarea></div>
          <div class="store-uploads">${uploadTile("logo", "Store logo", imageUrl(storefront.logo_image))}
            ${uploadTile("banner", "Banner photo", imageUrl(storefront.banner_image), "images/customer-banner.png")}</div>
        </div>
        <h3 class="gap">Storefront colors</h3><div class="store-colors">${colorInput("background", "Page background")}${colorInput("surface", "Cards")}${colorInput("header", "Header")}${colorInput("banner", "Banner")}${colorInput("primary", "Buttons")}${colorInput("heading", "Headings")}${colorInput("text", "Body text")}</div>
        <button class="primary block" data-storefront-save>Save storefront design</button></section>
      <section class="panel storefront-editor full"><h3>Food photos</h3><p class="muted tiny">Change a menu photo or restore its built-in image.</p>
        <div class="store-food-grid">${menu.map(item => {
          const base = item.name.replace(/\\s*\\(.*?\\)\\s*/g, "").trim();
          const photo = imageUrl(storefront.menu_images?.[item.id]) || `images/${slug(base)}.jpg`;
          return `<div class="store-food"><div class="store-thumb"><img src="${esc(photo)}" alt="" onerror="this.style.display='none'"></div><b>${esc(item.name)}</b>
            <label class="upload-button">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" data-store-image="menu" data-menu-id="${item.id}"></label>
            ${storefront.menu_images?.[item.id] ? `<button class="sm" data-store-clear="menu" data-menu-id="${item.id}">Use default photo</button>` : ""}</div>`;
        }).join("")}</div></section>
      <div class="panel"><h3>User accounts <span class="count">${accounts.length}</span></h3>
        <div class="scroll"><table><tr><th>Account</th><th>Email</th><th>Role</th><th></th></tr>
          ${accounts.map(account => `<tr><td><b>${esc(account.username)}</b>${account.username === me ? ` <small class="muted">(you)</small>` : ""}</td><td>${esc(account.email)}</td>
          <td><span class="tag ${account.role === "admin" ? "" : "off2"}">${esc(account.role)}</span></td><td class="r">${account.role !== "admin" ? `<button class="danger sm" data-user-remove="${esc(account.email)}">Remove</button>` : ""}</td></tr>`).join("")}</table></div>
        <h3 class="gap">Add account</h3><div class="two"><div><label for="new-username">Username</label><input id="new-username" maxlength="30"></div>
        <div><label for="new-role">Role</label><select id="new-role"><option value="staff">Staff</option><option value="admin">Admin</option></select></div></div>
        <label for="new-user-password">Password (min 6)</label><input id="new-user-password" type="password" minlength="6">
        <button class="primary block" data-user-add>Add account</button>
        <p class="security-note">Demo credentials are saved in browser storage and are not secure for public admin access.</p></div>
      <div class="panel"><h3>Tables <span class="count">${tables.length}</span></h3>
        <div class="chips">${tables.map(table => `<span class="chip">T${table.id} · ${table.seats} seats <button class="x" data-tdel="${table.id}" title="Delete table" aria-label="Delete table ${table.id}">×</button></span>`).join("")}</div>
        <h3 class="gap">Add table</h3><label for="ts">Seats</label><input id="ts" type="number" min="1" max="30" value="4">
        <button class="primary block" data-tadd>Add table</button></div>
      <div class="panel"><h3>Restaurant details</h3>
        <table><tr><td class="muted">Name</td><td>${esc(info.restaurant)}</td></tr><tr><td class="muted">Address</td><td>${esc(info.address) || "—"}</td></tr>
        <tr><td class="muted">Phone</td><td>${esc(info.phone) || "—"}</td></tr><tr><td class="muted">GSTIN</td><td>${esc(info.gstin) || "—"}</td></tr>
        <tr><td class="muted">GST rate</td><td>${gstRate}%</td></tr></table></div>
      <div class="panel"><h3>Change administrator sign-in</h3>
        <label for="admin-email">Admin email</label><input id="admin-email" type="email" value="${esc(admin.email)}" autocomplete="username" required>
        <label for="admin-current-password">Current password</label><input id="admin-current-password" type="password" autocomplete="current-password" required>
        <label for="admin-new-password">New password (at least 8 characters)</label><input id="admin-new-password" type="password" minlength="8" autocomplete="new-password" required>
        <label for="admin-confirm-password">Confirm new password</label><input id="admin-confirm-password" type="password" minlength="8" autocomplete="new-password" required>
        <button class="primary block" data-admin-creds-save>Save admin sign-in</button></div>
    </div>`;
  }
};

/* ---------- receipt ---------- */
function receipt(b) {
  const n = b.items.reduce((a, i) => a + i.qty, 0);
  dialog(`<h2>${esc(b.restaurant)}</h2>
    ${b.address ? `<div class="c">${esc(b.address)}</div>` : ""}${b.phone ? `<div class="c">Tel: ${esc(b.phone)}</div>` : ""}${b.gstin ? `<div class="c">GSTIN: ${esc(b.gstin)}</div>` : ""}
    <div class="c strong">TAX INVOICE</div><hr>
    <div class="r"><span>Bill #${b.bill_id}</span><span>Table ${b.table_id}</span></div>
    <div>${esc(b.paid_at)}</div><div>Cashier: ${esc(b.cashier)}</div><hr>
    ${b.items.map(i => `<div class="r"><span>${esc(i.name)} × ${i.qty}</span><span>${i.amount.toFixed(2)}</span></div>`).join("")}<hr>
    <div class="r"><span>Subtotal (${n} item${n === 1 ? "" : "s"})</span><span>${b.subtotal.toFixed(2)}</span></div>
    ${b.discount ? `<div class="r"><span>Discount ${b.discount_pct}%</span><span>−${b.discount.toFixed(2)}</span></div>` : ""}
    <div class="r"><span>GST ${b.gst_rate}%</span><span>${b.gst.toFixed(2)}</span></div><hr>
    <div class="r big"><b>TOTAL</b><b>₹${b.total.toFixed(2)}</b></div><div>Paid by ${esc(b.method)}</div><hr>
    <p class="c">Thank you! Visit again.</p>
    <p class="c noprint"><button onclick="window.print()">Print</button> <button data-close>Close</button></p>`, "");
}

/* ---------- dialogs ---------- */
function pwDialog() {
  dialog(`<h3>Change password</h3>
    <label for="pn">New password (min 6)</label><input id="pn" type="password" autocomplete="new-password" minlength="6">
    <label for="pc">Confirm new password</label><input id="pc" type="password" autocomplete="new-password">
    <div class="acts"><button class="primary" data-pwsave>Update password</button><button data-close>Cancel</button></div>`);
}
function editDialog(m) {
  dialog(`<h3>Edit menu item</h3><label for="en">Name</label><input id="en" value="${esc(m.name)}" maxlength="60">
    <label for="ec">Category</label><input id="ec" value="${esc(m.category)}" maxlength="30">
    <label for="ep">Price (₹)</label><input id="ep" type="number" min="1" step="0.5" value="${m.price}">
    <div class="acts"><button class="primary" data-msave="${m.id}">Save changes</button><button data-close>Cancel</button></div>`);
}

/* ---------- events ---------- */
function calcTotals() {
  const s = $(".sum"); if (!s) return;
  const sub = +s.dataset.sub; let d = parseFloat($("#disc").value); if (!(d >= 0)) d = 0; d = Math.min(d, 100);
  const disc = Math.round(sub * d) / 100, gst = Math.round((sub - disc) * gstRate) / 100;
  $("#tdisc").textContent = "− " + rs(disc); $("#tgst").textContent = rs(gst); $("#ttot").textContent = rs(sub - disc + gst);
}
document.addEventListener("input", e => {
  if (e.target.id === "q") {
    query = e.target.value.toLowerCase().trim();
    document.querySelectorAll(".dish").forEach(d => d.hidden = !d.dataset.name.includes(query));
  } else if (e.target.id === "disc") calcTotals();
});
document.addEventListener("focusout", () => setTimeout(resumeLiveRefresh, 0));
document.addEventListener("change", e => {
  if (e.target.id === "bd") { billDate = e.target.value; render(); }
  if (e.target.matches("[data-store-image]") && e.target.files?.[0]) {
    const input = e.target, file = input.files[0];
    act(async () => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the selected image."));
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => reject(new Error("The selected image could not be decoded."));
          image.onload = () => {
            const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.72));
          };
          image.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });
      storefront = await api("/storefront/image", {
        kind: input.dataset.storeImage,
        menu_id: input.dataset.menuId,
        data
      });
      info.restaurant = storefront.restaurant;
      applyStorefront();
    }, "Image saved in this browser");
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && modalOpen()) closeDialog();
  if (e.key === "Enter" && modalOpen() && e.target.tagName === "INPUT") $("#box").querySelector("button.primary")?.click();
  if (e.key === "/" && token && tab === "orders" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q")?.focus(); }
});
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeDialog(); });

async function downloadCsv() {
  const csv = await api("/export/bills");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
  a.download = "bills_" + todayStr().replace(/-/g, "") + ".csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
  if (d.themeBtn !== undefined) setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  else if (d.close !== undefined) closeDialog();
  else if (d.loginEye !== undefined) {
    const password = $("#login-password");
    password.type = password.type === "password" ? "text" : "password";
    b.textContent = password.type === "password" ? "Show" : "Hide";
  }
  else if (d.adminCredsSave !== undefined) act(async () => {
    if ($("#admin-new-password").value !== $("#admin-confirm-password").value) throw new Error("New passwords do not match.");
    await api("/auth/credentials/update", {
      email: $("#admin-email").value,
      current_password: $("#admin-current-password").value,
      password: $("#admin-new-password").value
    });
  }, "Admin sign-in updated");
  else if (d.userAdd !== undefined) act(() => api("/users/add", {
    username: $("#new-username").value,
    role: $("#new-role").value,
    password: $("#new-user-password").value
  }), "Account added");
  else if (d.userRemove) {
    if (confirm("Remove this staff account?")) act(() => api("/users/remove", {email: d.userRemove}), "Account removed");
  }
  else if (d.tab) { tab = d.tab; render(); }
  else if (d.table) { selTable = +d.table; render(); }
  else if (d.cat) { cat = d.cat; render(); }
  else if (d.add) { if (!selTable) return toast("Select a table first", 1);
    act(() => api("/orders/add", {table_id: selTable, menu_id: +d.add, qty: 1})); }
  else if (d.rem) act(() => api("/orders/remove", {table_id: selTable, menu_id: +d.rem}));
  else if (d.cancel !== undefined) { if (confirm("Cancel this order? All items on it will be discarded.")) act(() => api("/orders/cancel", {table_id: selTable}), "Order cancelled"); }
  else if (d.bill !== undefined) act(async () => receipt(await api("/bill", {table_id: selTable, discount: $("#disc").value, method: $("#pay").value})), "Bill generated");
  else if (d.rcpt) act(async () => receipt(await api("/bills/detail?id=" + d.rcpt)));
  else if (d.bdall !== undefined) { billDate = ""; render(); }
  else if (d.bdtoday !== undefined) { billDate = todayStr(); render(); }
  else if (d.res !== undefined) act(async () => { const r = await api("/reservations", {name: $("#rn").value, phone: $("#rp").value,
      guests: $("#rg").value, date: $("#rd").value, time: $("#rt").value}); toast("Booked: table " + r.table_id); });
  else if (d.rc) { if (confirm("Cancel this reservation?")) act(() => api("/reservations/cancel", {id: +d.rc}), "Reservation cancelled"); }
  else if (d.madd !== undefined) act(() => api("/menu", {name: $("#mn").value, category: $("#mc").value, price: $("#mp").value}), "Item added");
  else if (d.mt) act(() => api("/menu/toggle", {id: +d.mt}));
  else if (d.medit) { const m = (views.menu.cache || []).find(x => x.id === +d.medit); if (m) editDialog(m); }
  else if (d.msave) act(async () => { await api("/menu/update", {id: +d.msave, name: $("#en").value, category: $("#ec").value, price: $("#ep").value}); closeDialog(); }, "Item updated");
  else if (d.mdel) { if (confirm("Delete this menu item permanently?")) act(() => api("/menu/delete", {id: +d.mdel}), "Item deleted"); }
  else if (d.csv !== undefined) act(downloadCsv, "Export started");
  else if (d.tadd !== undefined) act(() => api("/tables/add", {seats: $("#ts").value}), "Table added");
  else if (d.tdel) { if (confirm("Delete table " + d.tdel + "?")) act(() => api("/tables/delete", {id: +d.tdel}), "Table deleted"); }
  else if (d.storefrontSave !== undefined) act(async () => {
    const colors = Object.fromEntries(["background", "surface", "header", "banner", "primary", "heading", "text"]
      .map(key => [key, $("#store-color-" + key).value]));
    storefront = await api("/storefront", {
      restaurant: $("#store-name").value,
      address: $("#store-address").value,
      phone: $("#store-phone").value,
      gstin: $("#store-gstin").value,
      gst_rate: $("#store-gst-rate").value,
      banner_kicker: $("#store-banner-kicker").value,
      banner_title: $("#store-banner-title").value,
      banner_subtitle: $("#store-banner-subtitle").value,
      colors
    });
    info.restaurant = storefront.restaurant; info.address = storefront.address; info.phone = storefront.phone;
    info.gstin = storefront.gstin; gstRate = Number(storefront.gst_rate) || 5; applyStorefront();
  }, "Storefront design saved");
  else if (d.storeClear) act(async () => {
    storefront = await api("/storefront/image/remove", {
      kind: d.storeClear,
      menu_id: d.menuId
    });
    applyStorefront();
  }, "Default image restored");
});
