// Description: Node.js HTML client (Users)
// requires: npm install express ejs axios body-parser

const express = require('express');
const axios = require('axios');
var bodyParser = require('body-parser');
const path = require("path");
const app = express();

// Base URL for API
const base_url = "http://localhost:4000";
const thbCurrencyFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric"
});

function formatTHB(value, fallback = "-") {
  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return thbCurrencyFormatter.format(numericValue);
}

function toBillMonthKey(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "unknown";

  const isoMatch = value.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  return "unknown";
}

function toBillMonthLabel(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "Unknown";
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const utcDate = new Date(Date.UTC(year, month - 1, 1));
  return monthLabelFormatter.format(utcDate);
}

function buildMonthlyExpenseReport(bills, payments) {
  const safeBills = Array.isArray(bills) ? bills : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const paymentsByBillId = {};

  safePayments.forEach((payment) => {
    const billId = String(payment.bill_id || "").trim();
    if (!billId) return;
    paymentsByBillId[billId] = paymentsByBillId[billId] || [];
    paymentsByBillId[billId].push(payment);
  });

  const monthlyReportMap = {};
  safeBills.forEach((bill) => {
    const monthKey = toBillMonthKey(bill.bill_month);
    const status = String(bill.status || "").toLowerCase().trim();
    const billId = String(bill.bill_id || bill.id || "").trim();
    const amount = Number.parseFloat(bill.amount);
    const normalizedAmount = Number.isFinite(amount) ? amount : 0;
    const linkedPayments = billId ? (paymentsByBillId[billId] || []) : [];

    if (!monthlyReportMap[monthKey]) {
      monthlyReportMap[monthKey] = {
        monthKey,
        monthLabel: toBillMonthLabel(monthKey),
        billsCount: 0,
        paidBillsCount: 0,
        unpaidBillsCount: 0,
        overdueBillsCount: 0,
        paymentsCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0
      };
    }

    const monthSummary = monthlyReportMap[monthKey];
    monthSummary.billsCount += 1;
    monthSummary.paymentsCount += linkedPayments.length;
    monthSummary.totalAmount += normalizedAmount;

    if (status === "paid") {
      monthSummary.paidBillsCount += 1;
      monthSummary.paidAmount += normalizedAmount;
      return;
    }

    if (status === "overdue") {
      monthSummary.overdueBillsCount += 1;
    } else {
      monthSummary.unpaidBillsCount += 1;
    }
    monthSummary.outstandingAmount += normalizedAmount;
  });

  return Object.values(monthlyReportMap).sort((left, right) => {
    const leftIsDated = /^\d{4}-\d{2}$/.test(left.monthKey);
    const rightIsDated = /^\d{4}-\d{2}$/.test(right.monthKey);

    if (leftIsDated && rightIsDated) {
      return right.monthKey.localeCompare(left.monthKey);
    }
    if (leftIsDated) return -1;
    if (rightIsDated) return 1;
    return left.monthKey.localeCompare(right.monthKey);
  });
}

function normalizeRole(role) {
  return role === "admin" ? "admin" : "user";
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) return;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) return;

    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function safeRedirectPath(rawPath) {
  const path = String(rawPath || "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

function setAuthCookies(res, user) {
  const maxAge = 60 * 60 * 24 * 30;
  const role = normalizeRole(user.role);
  const name = String(user.name || "").trim();
  const email = String(user.email || "").trim();
  const userId = String(user.user_id || "").trim();

  res.setHeader("Set-Cookie", [
    `auth_uid=${encodeURIComponent(userId)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`,
    `auth_role=${encodeURIComponent(role)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`,
    `auth_name=${encodeURIComponent(name)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`,
    `auth_email=${encodeURIComponent(email)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  ]);
}

function clearAuthCookies(res) {
  res.setHeader("Set-Cookie", [
    "auth_uid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    "auth_role=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    "auth_name=; Path=/; Max-Age=0; SameSite=Lax",
    "auth_email=; Path=/; Max-Age=0; SameSite=Lax"
  ]);
}

function requireAdmin(req, res, next) {
  if (!req.currentUser) {
    const nextPath = encodeURIComponent(req.originalUrl || "/");
    return res.redirect(`/login?next=${nextPath}`);
  }

  if (req.currentRole === "admin") return next();

  const message = "Administrator access is required for this page.";
  const accepts = (req.get("accept") || "").toLowerCase();

  if (accepts.includes("application/json")) {
    return res.status(403).json({ message });
  }

  return res.status(403).render("access-denied", { message });
}

function requireAuth(req, res, next) {
  if (req.currentUser) return next();

  const accepts = (req.get("accept") || "").toLowerCase();
  if (accepts.includes("application/json")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const nextPath = encodeURIComponent(req.originalUrl || "/");
  return res.redirect(`/login?next=${nextPath}`);
}

// Set template engine
app.set("views", path.join(__dirname, "/public/views"));
app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const userId = Number.parseInt(cookies.auth_uid, 10);
  const role = normalizeRole(cookies.auth_role);
  const userName = String(cookies.auth_name || "").trim();
  const userEmail = String(cookies.auth_email || "").trim();
  const isAuthenticated = Number.isFinite(userId) && userId > 0 && !!userName;

  const currentUser = isAuthenticated
    ? {
      user_id: userId,
      name: userName,
      email: userEmail || null,
      role
    }
    : null;

  req.currentUser = currentUser;
  req.currentRole = currentUser ? role : "guest";

  res.locals.currentUser = currentUser;
  res.locals.isAuthenticated = !!currentUser;
  res.locals.role = req.currentRole;
  res.locals.isAdmin = !!currentUser && role === "admin";
  res.locals.roleLabel = !currentUser
    ? "Guest"
    : role === "admin"
      ? "Administrator"
      : "General User";
  res.locals.rolePath = (targetPath) => targetPath;
  res.locals.formatTHB = formatTHB;
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ================= ROUTES =================

app.get('/login', (req, res) => {
  if (req.currentUser) return res.redirect('/');
  res.render('login', {
    error: req.query.error || null,
    next: safeRedirectPath(req.query.next)
  });
});

app.post('/login', async (req, res) => {
  if (req.currentUser) return res.redirect('/');

  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  const nextPath = safeRedirectPath(req.body.next || req.query.next);

  try {
    const loginResp = await axios.post(`${base_url}/auth/login`, {
      email,
      password
    });
    const user = loginResp.data && loginResp.data.user;
    if (!user || !user.user_id) {
      throw new Error('Invalid login response');
    }

    setAuthCookies(res, user);
    return res.redirect(nextPath);
  } catch (err) {
    const apiMessage = err.response && err.response.data && err.response.data.message;
    const backendOffline = err.code === 'ECONNREFUSED';
    const message = backendOffline
      ? 'Backend API is offline on http://localhost:4000. Start it with: npm run backend'
      : apiMessage || 'Login failed';
    return res.status(401).render('login', {
      error: message,
      next: nextPath
    });
  }
});

app.get('/register', (req, res) => {
  if (req.currentUser) return res.redirect('/');

  res.render('register', {
    error: req.query.error || null,
    values: {
      name: req.query.name || '',
      email: req.query.email || '',
      phone: req.query.phone || ''
    }
  });
});

app.post('/register', async (req, res) => {
  if (req.currentUser) return res.redirect('/');

  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const phone = String(req.body.phone || '').trim();

  if (!name || !email || !password) {
    return res.status(400).render('register', {
      error: 'Name, email and password are required.',
      values: { name, email, phone }
    });
  }

  try {
    await axios.post(`${base_url}/users`, {
      name,
      email,
      password,
      phone: phone || null,
      role: 'user'
    });

    const loginResp = await axios.post(`${base_url}/auth/login`, { email, password });
    const user = loginResp.data && loginResp.data.user;
    if (!user || !user.user_id) {
      throw new Error('Invalid login response');
    }

    setAuthCookies(res, user);
    return res.redirect('/');
  } catch (err) {
    const apiMessage = err.response && err.response.data && err.response.data.message;
    const fallback = 'Registration failed';
    const message = apiMessage || fallback;
    return res.status(400).render('register', {
      error: message,
      values: { name, email, phone }
    });
  }
});

app.get('/logout', (req, res) => {
  clearAuthCookies(res);
  res.redirect('/login');
});

// Home (landing) page
app.get('/', async (req, res) => {
  if (!req.currentUser) {
    return res.redirect('/register');
  }

  if (req.currentRole === "admin") {
    try {
      const [usersResp, metersResp, billsResp, paymentsResp, utilitiesResp] = await Promise.all([
        axios.get(`${base_url}/users`),
        axios.get(`${base_url}/meters`),
        axios.get(`${base_url}/bills`),
        axios.get(`${base_url}/payments`),
        axios.get(`${base_url}/utilities`)
      ]);

      const users = usersResp.data || [];
      const meters = metersResp.data || [];
      const bills = billsResp.data || [];
      const payments = paymentsResp.data || [];
      const utilities = utilitiesResp.data || [];

      const openBills = bills.filter((b) => {
        const status = String(b.status || "").toLowerCase();
        return status === "unpaid" || status === "overdue";
      });
      const outstandingAmount = openBills.reduce((sum, bill) => {
        const amount = Number.parseFloat(bill.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);
      const urgentBills = [...openBills].sort((a, b) => {
        const left = new Date(a.due_date || 0).getTime();
        const right = new Date(b.due_date || 0).getTime();
        return left - right;
      }).slice(0, 5);
      const recentPayments = [...payments].sort((a, b) => {
        const left = new Date(a.payment_date || 0).getTime();
        const right = new Date(b.payment_date || 0).getTime();
        return right - left;
      }).slice(0, 5);

      return res.render('index', {
        home: {
          mode: "admin",
          error: null,
          summary: {
            usersCount: users.length,
            metersCount: meters.length,
            utilitiesCount: utilities.length,
            openBillsCount: openBills.length,
            outstandingAmount
          },
          urgentBills,
          recentPayments
        }
      });
    } catch (err) {
      console.error('Home dashboard (admin) load failed:', err.message);
      return res.render('index', {
        home: {
          mode: "admin",
          error: "Unable to load latest admin metrics right now.",
          summary: {
            usersCount: 0,
            metersCount: 0,
            utilitiesCount: 0,
            openBillsCount: 0,
            outstandingAmount: 0
          },
          urgentBills: [],
          recentPayments: []
        }
      });
    }
  }

  try {
    const [metersResp, billsResp, paymentsResp] = await Promise.all([
      axios.get(`${base_url}/meters`),
      axios.get(`${base_url}/bills`),
      axios.get(`${base_url}/payments`)
    ]);

    const allMeters = metersResp.data || [];
    const allBills = billsResp.data || [];
    const allPayments = paymentsResp.data || [];

    const myMeters = allMeters.filter((m) => String(m.user_id) === String(req.currentUser.user_id));
    const meterIds = new Set(myMeters.map((m) => String(m.meter_id)));
    const myBills = allBills.filter((b) => meterIds.has(String(b.meter_id)));
    const billIds = new Set(myBills.map((b) => String(b.bill_id)));
    const myPayments = allPayments.filter((p) => billIds.has(String(p.bill_id)));

    const openBills = myBills.filter((b) => {
      const status = String(b.status || "").toLowerCase();
      return status === "unpaid" || status === "overdue";
    });
    const dueAmount = openBills.reduce((sum, bill) => {
      const amount = Number.parseFloat(bill.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const recentBills = [...myBills].sort((a, b) => {
      const left = new Date(a.due_date || a.created_at || 0).getTime();
      const right = new Date(b.due_date || b.created_at || 0).getTime();
      return left - right;
    }).slice(0, 5);
    const recentPayments = [...myPayments].sort((a, b) => {
      const left = new Date(a.payment_date || 0).getTime();
      const right = new Date(b.payment_date || 0).getTime();
      return right - left;
    }).slice(0, 5);

    return res.render('index', {
      home: {
        mode: "user",
        error: null,
        summary: {
          metersCount: myMeters.length,
          billsCount: myBills.length,
          openBillsCount: openBills.length,
          paymentsCount: myPayments.length,
          dueAmount
        },
        recentBills,
        recentPayments
      }
    });
  } catch (err) {
    console.error('Home dashboard (user) load failed:', err.message);
    return res.render('index', {
      home: {
        mode: "user",
        error: "Unable to load your latest dashboard data right now.",
        summary: {
          metersCount: 0,
          billsCount: 0,
          openBillsCount: 0,
          paymentsCount: 0,
          dueAmount: 0
        },
        recentBills: [],
        recentPayments: []
      }
    });
  }
});

// Admin dashboard page
app.get('/admin-dashboard', requireAdmin, async (req, res) => {
  try {
    const [usersResp, metersResp, billsResp, paymentsResp, utilitiesResp] = await Promise.all([
      axios.get(`${base_url}/users`),
      axios.get(`${base_url}/meters`),
      axios.get(`${base_url}/bills`),
      axios.get(`${base_url}/payments`),
      axios.get(`${base_url}/utilities`)
    ]);

    const users = usersResp.data || [];
    const meters = metersResp.data || [];
    const bills = billsResp.data || [];
    const payments = paymentsResp.data || [];
    const utilities = utilitiesResp.data || [];

    const overdueBills = bills.filter((b) => String(b.status || "").toLowerCase() === "overdue");
    const unpaidBills = bills.filter((b) => String(b.status || "").toLowerCase() === "unpaid");
    const paidBills = bills.filter((b) => String(b.status || "").toLowerCase() === "paid");

    const totalBilledAmount = bills.reduce((sum, bill) => {
      const amount = Number.parseFloat(bill.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const recentUsers = [...users].sort((a, b) => {
      const left = new Date(a.created_at || 0).getTime();
      const right = new Date(b.created_at || 0).getTime();
      return right - left;
    }).slice(0, 8);

    const recentPayments = [...payments].sort((a, b) => {
      const left = new Date(a.payment_date || 0).getTime();
      const right = new Date(b.payment_date || 0).getTime();
      return right - left;
    }).slice(0, 8);

    const urgentBills = [...bills].filter((bill) => {
      const status = String(bill.status || "").toLowerCase();
      return status === "unpaid" || status === "overdue";
    }).sort((a, b) => {
      const left = new Date(a.due_date || 0).getTime();
      const right = new Date(b.due_date || 0).getTime();
      return left - right;
    }).slice(0, 10);

    res.render('admin-dashboard', {
      summary: {
        usersCount: users.length,
        metersCount: meters.length,
        utilitiesCount: utilities.length,
        billsCount: bills.length,
        paymentsCount: payments.length,
        paidBillsCount: paidBills.length,
        unpaidBillsCount: unpaidBills.length,
        overdueBillsCount: overdueBills.length,
        totalBilledAmount
      },
      recentUsers,
      recentPayments,
      urgentBills
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading admin dashboard');
  }
});

// User dashboard page
app.get('/user-dashboard', requireAuth, async (req, res) => {
  try {
    const [metersResp, billsResp, paymentsResp] = await Promise.all([
      axios.get(`${base_url}/meters`),
      axios.get(`${base_url}/bills`),
      axios.get(`${base_url}/payments`)
    ]);

    const allMeters = metersResp.data || [];
    const allBills = billsResp.data || [];
    const allPayments = paymentsResp.data || [];
    const isAdmin = req.currentRole === "admin";

    const meters = isAdmin
      ? allMeters
      : allMeters.filter((m) => String(m.user_id) === String(req.currentUser.user_id));

    const meterIds = new Set(meters.map((m) => String(m.meter_id)));
    const bills = allBills.filter((b) => meterIds.has(String(b.meter_id)));
    const billIds = new Set(bills.map((b) => String(b.bill_id)));
    const payments = allPayments.filter((p) => billIds.has(String(p.bill_id)));

    const paidBillsCount = bills.filter((b) => String(b.status || "").toLowerCase() === "paid").length;
    const overdueBillsCount = bills.filter((b) => String(b.status || "").toLowerCase() === "overdue").length;
    const unpaidBills = bills.filter((b) => {
      const status = String(b.status || "").toLowerCase();
      return status === "unpaid" || status === "overdue";
    });
    const totalDue = unpaidBills.reduce((sum, bill) => {
      const amount = Number.parseFloat(bill.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const recentBills = [...bills].sort((a, b) => {
      const left = new Date(a.due_date || a.created_at || 0).getTime();
      const right = new Date(b.due_date || b.created_at || 0).getTime();
      return right - left;
    }).slice(0, 8);

    const recentPayments = [...payments].sort((a, b) => {
      const left = new Date(a.payment_date || 0).getTime();
      const right = new Date(b.payment_date || 0).getTime();
      return right - left;
    }).slice(0, 8);
    const monthlyReport = buildMonthlyExpenseReport(bills, payments);

    res.render('user-dashboard', {
      summary: {
        metersCount: meters.length,
        billsCount: bills.length,
        paidBillsCount,
        overdueBillsCount,
        unpaidBillsCount: unpaidBills.length,
        totalDue
      },
      recentBills,
      recentPayments,
      monthlyReport,
      error: null
    });
  } catch (err) {
    const apiMessage = err.response && err.response.data && err.response.data.message;
    const backendOffline = err.code === 'ECONNREFUSED';
    const message = backendOffline
      ? 'Cannot reach backend API on http://localhost:4000. Start it with: npm run backend'
      : apiMessage
        ? `Unable to load dashboard data: ${apiMessage}`
        : 'Unable to load dashboard data right now.';

    console.error('User dashboard load failed:', err.message);
    return res.render('user-dashboard', {
      summary: {
        metersCount: 0,
        billsCount: 0,
        paidBillsCount: 0,
        overdueBillsCount: 0,
        unpaidBillsCount: 0,
        totalDue: 0
      },
      recentBills: [],
      recentPayments: [],
      monthlyReport: [],
      error: message
    });
  }
});

// Show all users (separate route)
app.get('/users', requireAdmin, async (req, res) => {
  try {
    const response = await axios.get(base_url + '/users');
    res.render('users', { users: response.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading users');
  }
});

// Show one user
app.get('/user/:id', requireAdmin, async (req, res) => {
  try {
    // Fetch user
    const userResp = await axios.get(`${base_url}/users/${req.params.id}`);
    const user = userResp.data;

    // Fetch all meters and filter for this user
    const metersResp = await axios.get(`${base_url}/meters`);
    const allMeters = metersResp.data || [];
    const userMeters = allMeters.filter(m => String(m.user_id) === String(user.id || user.user_id));

    // Fetch utilities to map utility_id to name
    const utilsResp = await axios.get(`${base_url}/utilities`);
    const utilities = utilsResp.data || [];
    const utilityMap = {};
    utilities.forEach(u => { utilityMap[u.utility_id] = u.utility_name; });

    // Attach utility_name to each meter
    userMeters.forEach(m => { m.utility_name = utilityMap[m.utility_id] || null; });

    // Fetch bills and link to meters
    const billsResp = await axios.get(`${base_url}/bills`);
    const allBills = billsResp.data || [];
    // bills by meter id
    const billsByMeter = {};
    allBills.forEach(b => {
      const mid = String(b.meter_id);
      billsByMeter[mid] = billsByMeter[mid] || [];
      billsByMeter[mid].push(b);
    });

    // Attach bills to each user meter
    userMeters.forEach(m => { m.bills = billsByMeter[String(m.meter_id)] || []; });

    // Fetch payments
    const paymentsResp = await axios.get(`${base_url}/payments`);
    const allPayments = paymentsResp.data || [];
    const userBills = [];
    userMeters.forEach((meter) => {
      const meterBills = Array.isArray(meter.bills) ? meter.bills : [];
      meterBills.forEach((bill) => {
        userBills.push(bill);
      });
    });
    const userBillIdSet = new Set(
      userBills
        .map((bill) => String(bill.bill_id || bill.id || "").trim())
        .filter((billId) => !!billId)
    );
    const userPayments = allPayments.filter((payment) =>
      userBillIdSet.has(String(payment.bill_id || "").trim())
    );
    const monthlyReport = buildMonthlyExpenseReport(userBills, userPayments);

    res.render('user', {
      user,
      meters: userMeters,
      payments: userPayments,
      monthlyReport
    });
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    res.status(500).send('Error loading user');
  }
});

// List meters
app.get('/meters', requireAdmin, async (req, res) => {
  try {
    const resp = await axios.get(`${base_url}/meters`);
    const meters = resp.data || [];
    const utilsResp = await axios.get(`${base_url}/utilities`);
    const utilities = utilsResp.data || [];
    const utilityMap = {};
    utilities.forEach(u => { utilityMap[u.utility_id] = u.utility_name; });
    meters.forEach(m => { m.utility_name = utilityMap[m.utility_id] || null; });
    res.render('meters', { meters });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading meters');
  }
});

// List bills
app.get('/bills', requireAuth, async (req, res) => {
  try {
    const resp = await axios.get(`${base_url}/bills`);
    let bills = resp.data || [];

    if (!req.currentUser.role || req.currentUser.role !== "admin") {
      const metersResp = await axios.get(`${base_url}/meters`);
      const myMeterIds = new Set(
        (metersResp.data || [])
          .filter((m) => String(m.user_id) === String(req.currentUser.user_id))
          .map((m) => String(m.meter_id))
      );
      bills = bills.filter((b) => myMeterIds.has(String(b.meter_id)));
    }

    res.render('bills', {
      bills,
      message: req.query.message || null
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading bills');
  }
});

// List utilities
app.get('/utilities', requireAdmin, async (req, res) => {
  try {
    const resp = await axios.get(`${base_url}/utilities`);
    res.render('utilities', { utilities: resp.data || [] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading utilities');
  }
});

// Create utility page
app.get("/create-utility", requireAdmin, (req, res) => {
  res.render("create-utility");
});

// Create utility
app.post("/create-utility", requireAdmin, async (req, res) => {
  try {
    const data = {
      utility_name: req.body.utility_name
    };
    await axios.post(base_url + '/utilities', data);
    res.redirect("/utilities");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error creating utility');
  }
});

// List payments
app.get('/payments', requireAuth, async (req, res) => {
  try {
    const resp = await axios.get(`${base_url}/payments`);
    let payments = resp.data || [];

    if (!req.currentUser.role || req.currentUser.role !== "admin") {
      const [metersResp, billsResp] = await Promise.all([
        axios.get(`${base_url}/meters`),
        axios.get(`${base_url}/bills`)
      ]);
      const myMeterIds = new Set(
        (metersResp.data || [])
          .filter((m) => String(m.user_id) === String(req.currentUser.user_id))
          .map((m) => String(m.meter_id))
      );
      const myBillIds = new Set(
        (billsResp.data || [])
          .filter((b) => myMeterIds.has(String(b.meter_id)))
          .map((b) => String(b.bill_id))
      );
      payments = payments.filter((p) => myBillIds.has(String(p.bill_id)));
    }

    const successMessage = req.query.paid === "1"
      ? "Payment completed and bill marked as paid."
      : null;
    res.render('payments', {
      payments,
      message: req.query.message || successMessage
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading payments');
  }
});

// Pay bill page
app.get('/pay-bill/:billId', requireAuth, async (req, res) => {
  try {
    const billResp = await axios.get(`${base_url}/bills/${req.params.billId}`);
    const bill = billResp.data;

    if (req.currentUser.role !== "admin") {
      const metersResp = await axios.get(`${base_url}/meters`);
      const ownsBill = (metersResp.data || []).some(
        (m) =>
          String(m.meter_id) === String(bill.meter_id) &&
          String(m.user_id) === String(req.currentUser.user_id)
      );

      if (!ownsBill) {
        return res.status(403).render('access-denied', {
          message: "You can only pay your own bills."
        });
      }
    }

    const paymentsResp = await axios.get(`${base_url}/payments`);
    const existingPayment = (paymentsResp.data || []).find(
      (p) => String(p.bill_id) === String(bill.bill_id)
    ) || null;

    res.render('pay-bill', {
      bill,
      existingPayment,
      error: req.query.error || null
    });
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 404) {
      return res.status(404).send('Bill not found');
    }
    console.error(err.message);
    res.status(500).send('Error loading payment page');
  }
});

// Pay bill submit
app.post('/pay-bill/:billId', requireAuth, async (req, res) => {
  try {
    if (req.currentUser.role !== "admin") {
      const [billResp, metersResp] = await Promise.all([
        axios.get(`${base_url}/bills/${req.params.billId}`),
        axios.get(`${base_url}/meters`)
      ]);
      const bill = billResp.data;
      const ownsBill = (metersResp.data || []).some(
        (m) =>
          String(m.meter_id) === String(bill.meter_id) &&
          String(m.user_id) === String(req.currentUser.user_id)
      );

      if (!ownsBill) {
        return res.status(403).render('access-denied', {
          message: "You can only pay your own bills."
        });
      }
    }

    const payload = {
      bill_id: req.params.billId,
      payment_method: req.body.payment_method,
      transaction_ref: req.body.transaction_ref
    };
    await axios.post(`${base_url}/payments`, payload);
    res.redirect('/payments?paid=1');
  } catch (err) {
    const apiMessage = err.response && err.response.data && err.response.data.message;
    const message = apiMessage || 'Payment failed';
    res.redirect(`/pay-bill/${req.params.billId}?error=${encodeURIComponent(message)}`);
  }
});

// Create page
app.get("/create", requireAdmin, (req, res) => {
  res.render("create");
});

// Create user
app.post("/create", requireAdmin, async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      phone: req.body.phone,
      role: normalizeRole(req.body.role)
    };
    await axios.post(base_url + '/users', data);
    res.redirect("/");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error creating user');
  }
});

// Update page
app.get("/update/:id", requireAdmin, async (req, res) => {
  try {
    const response = await axios.get(base_url + '/users/' + req.params.id);
    res.render("update", { user: response.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading update page');
  }
});

// Update user
app.post("/update/:id", requireAdmin, async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      role: normalizeRole(req.body.role)
    };
    await axios.put(base_url + '/users/' + req.params.id, data);
    res.redirect("/");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error updating user');
  }
});

// Delete user
app.get("/delete/:id", requireAdmin, async (req, res) => {
  try {
    await axios.delete(base_url + '/users/' + req.params.id);
    res.redirect("/");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error deleting user');
  }
});

// Create meter page
app.get("/create-meter", requireAdmin, async (req, res) => {
  try {
    const usersResp = await axios.get(base_url + '/users');
    const utilsResp = await axios.get(base_url + '/utilities');
    res.render("create-meter", {
      users: usersResp.data,
      utilities: utilsResp.data,
      error: null,
      values: {
        meter_number: "",
        user_id: "",
        utility_id: ""
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading create meter page');
  }
});

// Create meter
app.post("/create-meter", requireAdmin, async (req, res) => {
  const meterNumber = String(req.body.meter_number || req.body.meter_reading || "").trim();
  const userId = String(req.body.user_id || "").trim();
  const utilityId = String(req.body.utility_id || "").trim();
  const data = {
    meter_number: meterNumber,
    user_id: userId,
    utility_id: utilityId
  };

  try {
    await axios.post(base_url + '/meters', data);
    res.redirect("/meters");
  } catch (err) {
    const apiMessage = err.response && err.response.data && err.response.data.message;
    const message = apiMessage || "Error creating meter";
    console.error('Create meter failed:', message);

    try {
      const [usersResp, utilsResp] = await Promise.all([
        axios.get(base_url + '/users'),
        axios.get(base_url + '/utilities')
      ]);
      return res.status(400).render("create-meter", {
        users: usersResp.data || [],
        utilities: utilsResp.data || [],
        error: message,
        values: data
      });
    } catch (loadErr) {
      console.error('Create meter fallback load failed:', loadErr.message);
      return res.status(500).send(message);
    }
  }
});

// Create bill page
app.get("/create-bill", requireAdmin, async (req, res) => {
  try {
    const metersResp = await axios.get(base_url + '/meters');
    res.render("create-bill", { meters: metersResp.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading create bill page');
  }
});

// Create bill
app.post("/create-bill", requireAdmin, async (req, res) => {
  try {
    const data = {
      meter_id: req.body.meter_id,
      bill_month: req.body.bill_month,
      amount: req.body.amount,
      due_date: req.body.due_date,
      status: req.body.status || 'unpaid'
    };
    await axios.post(base_url + '/bills', data);
    res.redirect("/bills");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error creating bill');
  }
});

app.listen(5500, () => {
  console.log(`Client running at http://localhost:5500`);
});
