const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(express.json());

// ==========================
// CONNECT DATABASE
// ==========================
const db = new sqlite3.Database("./Database/utility.db");

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  // USERS
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // UTILITIES
  db.run(`
    CREATE TABLE IF NOT EXISTS utilities (
      utility_id INTEGER PRIMARY KEY AUTOINCREMENT,
      utility_name TEXT NOT NULL UNIQUE
    )
  `);

  // METERS
  db.run(`
    CREATE TABLE IF NOT EXISTS meters (
      meter_id INTEGER PRIMARY KEY AUTOINCREMENT,
      meter_number TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      utility_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (utility_id) REFERENCES utilities(utility_id)
    )
  `);

  // BILLS
  db.run(`
    CREATE TABLE IF NOT EXISTS bills (
      bill_id INTEGER PRIMARY KEY AUTOINCREMENT,
      meter_id INTEGER NOT NULL,
      bill_month DATE NOT NULL,
      amount REAL NOT NULL,
      due_date DATE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('paid','unpaid','overdue')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meter_id) REFERENCES meters(meter_id) ON DELETE CASCADE
    )
  `);

  // PAYMENTS
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL UNIQUE,
      payment_method TEXT NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      transaction_ref TEXT UNIQUE,
      FOREIGN KEY (bill_id) REFERENCES bills(bill_id) ON DELETE CASCADE
    )
  `);
});

// ==========================
// GENERIC CRUD FUNCTION
// ==========================

function getAll(table, res) {
  db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
}

function getById(table, idField, id, res) {
  db.get(`SELECT * FROM ${table} WHERE ${idField} = ?`, [id], (err, row) => {
    if (err) return res.status(500).json(err);
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json(row);
  });
}

function deleteById(table, idField, id, res) {
  db.run(`DELETE FROM ${table} WHERE ${idField} = ?`, [id], function (err) {
    if (err) return res.status(500).json(err);
    res.json({ deleted: this.changes });
  });
}

// ==========================
// USERS ROUTES
// ==========================
app.get('/users', (req, res) => getAll('users', res));
app.get('/users/:id', (req, res) => getById('users', 'user_id', req.params.id, res));

app.post('/users', (req, res) => {
  const { name, email, password, phone } = req.body;
  db.run(
    `INSERT INTO users (name,email,password,phone) VALUES (?,?,?,?)`,
    [name, email, password, phone],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ user_id: this.lastID });
    }
  );
});

app.put('/users/:id', (req, res) => {
  const { name, email, phone } = req.body;
  db.run(
    `UPDATE users SET name=?, email=?, phone=? WHERE user_id=?`,
    [name, email, phone, req.params.id],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ updated: this.changes });
    }
  );
});

app.delete('/users/:id', (req, res) =>
  deleteById('users', 'user_id', req.params.id, res)
);

// ==========================
// UTILITIES ROUTES
// ==========================
app.get('/utilities', (req, res) => getAll('utilities', res));
app.post('/utilities', (req, res) => {
  db.run(
    `INSERT INTO utilities (utility_name) VALUES (?)`,
    [req.body.utility_name],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ utility_id: this.lastID });
    }
  );
});
app.delete('/utilities/:id', (req, res) =>
  deleteById('utilities', 'utility_id', req.params.id, res)
);

// ==========================
// METERS ROUTES
// ==========================
app.get('/meters', (req, res) => getAll('meters', res));
app.post('/meters', (req, res) => {
  const { meter_number, user_id, utility_id } = req.body;
  db.run(
    `INSERT INTO meters (meter_number,user_id,utility_id) VALUES (?,?,?)`,
    [meter_number, user_id, utility_id],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ meter_id: this.lastID });
    }
  );
});
app.delete('/meters/:id', (req, res) =>
  deleteById('meters', 'meter_id', req.params.id, res)
);

// ==========================
// BILLS ROUTES
// ==========================
app.get('/bills', (req, res) => getAll('bills', res));
app.post('/bills', (req, res) => {
  const { meter_id, bill_month, amount, due_date, status } = req.body;
  db.run(
    `INSERT INTO bills (meter_id,bill_month,amount,due_date,status)
     VALUES (?,?,?,?,?)`,
    [meter_id, bill_month, amount, due_date, status],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ bill_id: this.lastID });
    }
  );
});
app.delete('/bills/:id', (req, res) =>
  deleteById('bills', 'bill_id', req.params.id, res)
);

// ==========================
// PAYMENTS ROUTES
// ==========================
app.get('/payments', (req, res) => getAll('payments', res));
app.post('/payments', (req, res) => {
  const { bill_id, payment_method, transaction_ref } = req.body;
  db.run(
    `INSERT INTO payments (bill_id,payment_method,transaction_ref)
     VALUES (?,?,?)`,
    [bill_id, payment_method, transaction_ref],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ payment_id: this.lastID });
    }
  );
});
app.delete('/payments/:id', (req, res) =>
  deleteById('payments', 'payment_id', req.params.id, res)
);

// ==========================
// START SERVER
// ==========================
const PORT = 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));