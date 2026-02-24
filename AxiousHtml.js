// Description: Node.js HTML client (Users)
// requires: npm install express ejs axios body-parser

const express = require('express');
const axios = require('axios');
var bodyParser = require('body-parser');
const path = require("path");
const app = express();

// Base URL for API
const base_url = "http://localhost:4000";

// Set template engine
app.set("views", path.join(__dirname, "/public/views"));
app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ================= ROUTES =================

// Home (landing) page
app.get('/', (req, res) => {
  res.render('index');
});

// Show all users (separate route)
app.get('/users', async (req, res) => {
  try {
    const response = await axios.get(base_url + '/users');
    res.render('users', { users: response.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading users');
  }
});

// Show one user
app.get('/user/:id', async (req, res) => {
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

    res.render('user', { user, meters: userMeters, payments: allPayments });
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    res.status(500).send('Error loading user');
  }
});

// List meters
app.get('/meters', async (req, res) => {
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
app.get('/bills', async (req, res) => {
  try {
    const resp = await axios.get(`${base_url}/bills`);
    const bills = resp.data || [];
    res.render('bills', { bills });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading bills');
  }
});

// List utilities
app.get('/utilities', async (req, res) => {
  try {
    const resp = await axios.get(`${base_url}/utilities`);
    res.render('utilities', { utilities: resp.data || [] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading utilities');
  }
});

// Create utility page
app.get("/create-utility", (req, res) => {
  res.render("create-utility");
});

// Create utility
app.post("/create-utility", async (req, res) => {
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
app.get('/payments', async (req, res) => {
  try {
    const resp = await axios.get(`${base_url}/payments`);
    res.render('payments', { payments: resp.data || [] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading payments');
  }
});

// Create page
app.get("/create", (req, res) => {
  res.render("create");
});

// Create user
app.post("/create", async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      phone: req.body.phone
    };
    await axios.post(base_url + '/users', data);
    res.redirect("/");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error creating user');
  }
});

// Update page
app.get("/update/:id", async (req, res) => {
  try {
    const response = await axios.get(base_url + '/users/' + req.params.id);
    res.render("update", { user: response.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading update page');
  }
});

// Update user
app.post("/update/:id", async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone
    };
    await axios.put(base_url + '/users/' + req.params.id, data);
    res.redirect("/");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error updating user');
  }
});

// Delete user
app.get("/delete/:id", async (req, res) => {
  try {
    await axios.delete(base_url + '/users/' + req.params.id);
    res.redirect("/");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error deleting user');
  }
});

// Create meter page
app.get("/create-meter", async (req, res) => {
  try {
    const usersResp = await axios.get(base_url + '/users');
    const utilsResp = await axios.get(base_url + '/utilities');
    res.render("create-meter", { users: usersResp.data, utilities: utilsResp.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading create meter page');
  }
});

// Create meter
app.post("/create-meter", async (req, res) => {
  try {
    const data = {
      user_id: req.body.user_id,
      utility_id: req.body.utility_id,
      meter_reading: req.body.meter_reading
    };
    await axios.post(base_url + '/meters', data);
    res.redirect("/meters");
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error creating meter');
  }
});

// Create bill page
app.get("/create-bill", async (req, res) => {
  try {
    const metersResp = await axios.get(base_url + '/meters');
    res.render("create-bill", { meters: metersResp.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error loading create bill page');
  }
});

// Create bill
app.post("/create-bill", async (req, res) => {
  try {
    const data = {
      meter_id: req.body.meter_id,
      amount: req.body.amount,
      status: req.body.status || 'pending'
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