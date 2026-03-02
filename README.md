# FlowBills

FlowBills is a full-stack utility billing system with:
- `SQliteDB.js`: REST API + SQLite data layer.
- `AxiousHtml.js`: EJS frontend server that consumes the API.

## Function Tags
These tags describe what each function/handler is responsible for.

- `[AUTH]` Authentication and access control.
- `[SESSION]` Cookie/session helpers.
- `[NOTICE]` User-facing alert message helpers.
- `[FORMAT]` Value/date/currency formatting.
- `[REPORT]` Billing summary/report generation.
- `[CRUD]` Generic database helpers.
- `[USER]` User account management.
- `[UTILITY]` Utility type management.
- `[METER]` Meter management.
- `[BILL]` Bill and invoice management.
- `[PAYMENT]` Payment processing.
- `[DASHBOARD]` Dashboard aggregation/metrics.
- `[SYSTEM]` Server startup/runtime utilities.

## `AxiousHtml.js` Functions

### Helper functions

| Function | Tag | Description |
|---|---|---|
| `formatTHB(value, fallback)` | `[FORMAT]` | Converts numeric values to THB currency format. |
| `toBillMonthKey(rawValue)` | `[FORMAT]` | Normalizes bill month into `YYYY-MM` grouping key. |
| `toBillMonthLabel(monthKey)` | `[FORMAT]` | Converts month key into readable month label. |
| `buildMonthlyExpenseReport(bills, payments)` | `[REPORT]` | Builds monthly billing summary: totals, paid/unpaid, rates, due window, range. |
| `normalizeRole(role)` | `[AUTH]` | Forces role to `admin` or `user`. |
| `parseCookies(cookieHeader)` | `[SESSION]` | Parses raw cookie header into key/value object. |
| `safeRedirectPath(rawPath)` | `[AUTH]` | Validates redirect path to prevent unsafe redirects. |
| `normalizeNoticeType(rawType, fallback)` | `[NOTICE]` | Restricts notice type to allowed values. |
| `sanitizeNoticeText(rawText)` | `[NOTICE]` | Trims and clamps notice text length. |
| `withNotice(rawPath, message, type)` | `[NOTICE]` | Adds notice query parameters to redirect URLs. |
| `deriveUsername(user)` | `[USER]` | Derives display username from user data fallback chain. |
| `setAuthCookies(res, user)` | `[SESSION]` | Stores login identity in cookies. |
| `clearAuthCookies(res)` | `[SESSION]` | Clears auth cookies during logout. |
| `requireAdmin(req, res, next)` | `[AUTH]` | Guards admin-only pages and endpoints. |
| `requireAuth(req, res, next)` | `[AUTH]` | Guards authenticated pages and endpoints. |

### Route handlers

| Route | Tag | Description |
|---|---|---|
| `GET /login` | `[AUTH]` | Renders login page for guests. |
| `POST /login` | `[AUTH]` | Authenticates user via API and sets cookies. |
| `GET /register` | `[USER]` | Renders registration page. |
| `POST /register` | `[USER]` | Creates user and auto-login on success. |
| `GET /logout` | `[AUTH]` | Logs out by clearing cookies. |
| `GET /` | `[DASHBOARD]` | Home dashboard (admin metrics or user overview). |
| `GET /admin-dashboard` | `[DASHBOARD]` | Admin analytics dashboard. |
| `GET /user-dashboard` | `[DASHBOARD]` | User dashboard with monthly report. |
| `GET /users` | `[USER]` | Shows all users (admin only). |
| `GET /user/:id` | `[USER][REPORT]` | Shows user profile, meters, payments, monthly billing report (print-ready). |
| `GET /user/:id/invoices` | `[BILL][PAYMENT]` | Prints/collects open invoices for one user. |
| `GET /meters` | `[METER]` | Lists meters with utility names. |
| `GET /bills` | `[BILL]` | Lists bills (scoped for non-admin users). |
| `GET /invoice/:billId` | `[BILL][REPORT]` | Renders single invoice with account/payment details and print mode. |
| `GET /utilities` | `[UTILITY]` | Lists utilities. |
| `GET /create-utility` | `[UTILITY]` | Utility create form page. |
| `POST /create-utility` | `[UTILITY]` | Creates a utility record. |
| `GET /payments` | `[PAYMENT]` | Lists payments (scoped for non-admin users). |
| `GET /pay-bill/:billId` | `[PAYMENT]` | Pay bill page with ownership check. |
| `POST /pay-bill/:billId` | `[PAYMENT]` | Submits payment and updates bill state via API. |
| `GET /create` | `[USER]` | User create form page (admin). |
| `POST /create` | `[USER]` | Creates a user (admin). |
| `GET /update/:id` | `[USER]` | User update form page (admin). |
| `POST /update/:id` | `[USER]` | Updates user profile/role (admin). |
| `GET /delete/:id` | `[USER]` | Deletes a user (admin). |
| `GET /create-meter` | `[METER]` | Meter create form page. |
| `POST /create-meter` | `[METER]` | Creates meter with validation/error fallback. |
| `GET /create-bill` | `[BILL]` | Bill create form page. |
| `POST /create-bill` | `[BILL]` | Creates bill record. |

## `SQliteDB.js` Functions

### Core helpers

| Function | Tag | Description |
|---|---|---|
| `normalizeUserRole(role)` | `[AUTH]` | Sanitizes role value to allowed set. |
| `getAll(table, res)` | `[CRUD]` | Generic `SELECT *` helper for tables. |
| `getById(table, idField, id, res)` | `[CRUD]` | Generic lookup by primary key. |
| `deleteById(table, idField, id, res)` | `[CRUD]` | Generic delete by primary key. |

### API route handlers

| Route | Tag | Description |
|---|---|---|
| `GET /users` | `[USER]` | Returns all users (safe fields). |
| `GET /users/:id` | `[USER]` | Returns one user by ID (safe fields). |
| `POST /auth/login` | `[AUTH]` | Validates credentials and returns user payload. |
| `POST /users` | `[USER]` | Creates user with role normalization and duplicate email handling. |
| `PUT /users/:id` | `[USER]` | Updates user profile and optional role. |
| `DELETE /users/:id` | `[USER]` | Deletes user by ID. |
| `GET /utilities` | `[UTILITY]` | Returns utilities list. |
| `POST /utilities` | `[UTILITY]` | Creates utility. |
| `DELETE /utilities/:id` | `[UTILITY]` | Deletes utility. |
| `GET /meters` | `[METER]` | Returns meters list. |
| `POST /meters` | `[METER]` | Creates meter with FK/unique validation. |
| `DELETE /meters/:id` | `[METER]` | Deletes meter. |
| `GET /bills` | `[BILL]` | Returns all bills. |
| `GET /bills/:id` | `[BILL]` | Returns one bill by ID. |
| `POST /bills` | `[BILL]` | Creates bill record. |
| `DELETE /bills/:id` | `[BILL]` | Deletes bill. |
| `GET /payments` | `[PAYMENT]` | Returns all payments. |
| `POST /payments` | `[PAYMENT]` | Creates payment in transaction and marks bill as paid. |
| `DELETE /payments/:id` | `[PAYMENT]` | Deletes payment. |

### Runtime/system

| Block | Tag | Description |
|---|---|---|
| SQLite schema bootstrap (`db.serialize`) | `[SYSTEM]` | Ensures tables, FK rules, and default seed users. |
| Server start + error handling | `[SYSTEM]` | Starts API server and handles `EADDRINUSE`. |
