const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(express.json());

const ALLOWED_USER_ROLES = new Set(['admin', 'user']);

function normalizeUserRole(role) {
  const input = String(role || '').toLowerCase().trim();
  return ALLOWED_USER_ROLES.has(input) ? input : 'user';
}

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
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Backward compatibility for existing DBs created before role existed.
  db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`, (alterErr) => {
    const message = String(alterErr && alterErr.message ? alterErr.message : '').toLowerCase();
    const duplicateColumn = message.includes('duplicate column name');
    if (alterErr && !duplicateColumn) {
      console.error('Failed to ensure users.role column:', alterErr.message);
    }

    db.run(
      `INSERT INTO users (name,email,password,phone,role)
       SELECT ?,?,?,?,?
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(?))`,
      ['System Administrator', 'opterapat@local', 'opterapat', null, 'admin', 'opterapat@local']
    );

    db.run(
      `INSERT INTO users (name,email,password,phone,role)
       SELECT ?,?,?,?,?
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(?))`,
      ['Normal User', 'user@local', 'user123', null, 'user', 'user@local']
    );
  });

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
app.get('/users', (req, res) => {
  db.all(
    `SELECT user_id, name, email, phone, role, created_at
     FROM users
     ORDER BY user_id ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
});

app.get('/users/:id', (req, res) => {
  db.get(
    `SELECT user_id, name, email, phone, role, created_at
     FROM users
     WHERE user_id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json(err);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    }
  );
});
app.post('/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  db.get(
    `SELECT user_id, name, email, phone, password, role FROM users WHERE lower(email) = lower(?)`,
    [email],
    (err, row) => {
      if (err) return res.status(500).json(err);
      if (!row || row.password !== password) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      return res.json({
        user: {
          user_id: row.user_id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          role: normalizeUserRole(row.role)
        }
      });
    }
  );
});

app.post('/users', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const phone = String(req.body.phone || '').trim() || null;
  const role = normalizeUserRole(req.body.role);

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }

  db.run(
    `INSERT INTO users (name,email,password,phone,role) VALUES (?,?,?,?,?)`,
    [name, email, password, phone, role],
    function (err) {
      if (err) {
        const message = String(err.message || '').toLowerCase();
        if (message.includes('unique constraint failed: users.email')) {
          return res.status(409).json({ message: 'Email already exists' });
        }
        return res.status(500).json(err);
      }
      res.json({ user_id: this.lastID, role });
    }
  );
});

app.put('/users/:id', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim() || null;
  const role = typeof req.body.role === 'undefined' ? null : normalizeUserRole(req.body.role);

  if (!name || !email) {
    return res.status(400).json({ message: 'name and email are required' });
  }

  db.run(
    `UPDATE users SET name=?, email=?, phone=?, role=COALESCE(?, role) WHERE user_id=?`,
    [name, email, phone, role, req.params.id],
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
  const meterNumber = String(req.body.meter_number || "").trim();
  const userId = Number.parseInt(req.body.user_id, 10);
  const utilityId = Number.parseInt(req.body.utility_id, 10);

  if (!meterNumber) {
    return res.status(400).json({ message: "meter_number is required" });
  }
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "user_id must be a positive integer" });
  }
  if (!Number.isFinite(utilityId) || utilityId <= 0) {
    return res.status(400).json({ message: "utility_id must be a positive integer" });
  }

  db.run(
    `INSERT INTO meters (meter_number,user_id,utility_id) VALUES (?,?,?)`,
    [meterNumber, userId, utilityId],
    function (err) {
      if (err) {
        const rawMessage = String(err.message || "").toLowerCase();
        if (rawMessage.includes("unique constraint failed: meters.meter_number")) {
          return res.status(409).json({ message: "Meter number already exists" });
        }
        if (rawMessage.includes("foreign key constraint failed")) {
          return res.status(400).json({ message: "Selected user or utility does not exist" });
        }
        if (rawMessage.includes("not null constraint failed")) {
          return res.status(400).json({ message: "meter_number, user_id and utility_id are required" });
        }
        return res.status(500).json(err);
      }
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
app.get('/bills/:id', (req, res) => getById('bills', 'bill_id', req.params.id, res));
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
  const normalizedBillId = Number.parseInt(bill_id, 10);
  const normalizedMethod = String(payment_method || "").trim();
  const normalizedRef = String(transaction_ref || "").trim() || null;

  if (!Number.isFinite(normalizedBillId) || normalizedBillId <= 0) {
    return res.status(400).json({ message: "Invalid bill_id" });
  }
  if (!normalizedMethod) {
    return res.status(400).json({ message: "payment_method is required" });
  }

  db.get(
    `SELECT bill_id, status FROM bills WHERE bill_id = ?`,
    [normalizedBillId],
    (billErr, bill) => {
      if (billErr) return res.status(500).json(billErr);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (String(bill.status || "").toLowerCase() === "paid") {
        return res.status(409).json({ message: "Bill is already paid" });
      }

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        db.run(
          `INSERT INTO payments (bill_id,payment_method,transaction_ref)
           VALUES (?,?,?)`,
          [normalizedBillId, normalizedMethod, normalizedRef],
          function (insertErr) {
            if (insertErr) {
              const status = String(insertErr.code || "").includes("CONSTRAINT") ? 409 : 500;
              const payload = status === 409
                ? { message: "Payment already exists or transaction reference is duplicated" }
                : insertErr;
              return db.run("ROLLBACK", () => res.status(status).json(payload));
            }

            const paymentId = this.lastID;
            db.run(
              `UPDATE bills SET status = 'paid' WHERE bill_id = ?`,
              [normalizedBillId],
              function (updateErr) {
                if (updateErr) {
                  return db.run("ROLLBACK", () => res.status(500).json(updateErr));
                }
                if (!this.changes) {
                  return db.run("ROLLBACK", () => res.status(404).json({ message: "Bill not found during update" }));
                }

                db.run("COMMIT", (commitErr) => {
                  if (commitErr) {
                    return db.run("ROLLBACK", () => res.status(500).json(commitErr));
                  }
                  res.json({
                    payment_id: paymentId,
                    bill_id: normalizedBillId,
                    bill_status: "paid"
                  });
                });
              }
            );
          }
        );
      });
    }
  );
});
app.delete('/payments/:id', (req, res) =>
  deleteById('payments', 'payment_id', req.params.id, res)
);

// ==========================
// START SERVER
// ==========================
const PORT = Number.parseInt(process.env.PORT, 10) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT} (pid: ${process.pid})`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing process or choose another port.`);
  } else {
    console.error('Failed to start server:', err);
  }
  process.exit(1);
});
