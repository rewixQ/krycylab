# Node.js Cat Management App – Setup Instructions

This guide will walk you through setting up a secure Node.js web application using PostgreSQL (and pglite for development/testing), Prisma ORM, a modern frontend with Tailwind CSS, and robust authentication and authorization—including MFA with TOTP (Google Authenticator-compatible). These steps reflect both the database schema and lab requirements.

---

## 1. Initial Setup

### Prerequisites
- Node.js (v18+) and npm
- [pglite](https://pglite.dev/) for local development
- PostgreSQL for production
- [Prisma ORM](https://www.prisma.io/)
- [Tailwind CSS](https://tailwindcss.com/)
- A template engine (recommended: [EJS](https://ejs.co/) or [Nunjucks](https://mozilla.github.io/nunjucks/))

---

## 2. Project Initialization

```bash
npm init -y
npm install express prisma @prisma/client ejs tailwindcss pglite pg passport passport-local speakeasy session-file-store express-session bcryptjs
```

---

## 3. Database Setup
- Place the SQL file you received (db_schema.sql) in the root of your app folder (this file is linked in your project).
- For **local development**, use pglite. For **production**, use PostgreSQL.

### Prisma Configuration
Create your Prisma schema with both pglite and PostgreSQL connection options. Example:

```prisma
// schema.prisma
// For pglite
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
// For PostgreSQL
// datasource db {
//   provider = "postgresql"
//   url      = env("DATABASE_URL")
// }
```

You can switch providers by commenting/uncommenting.

---

## 4. Frontend Setup

- Use EJS or Nunjucks in Express to render server-side templates.
- Integrate Tailwind CSS for a modern, responsive UI:

```bash
npx tailwindcss init
```
Configure Tailwind in your template files:

```html
<link href="/tailwind.css" rel="stylesheet">
```

---

## 5. Security Foundations

- Always use HTTPS (TLS 1.2+) for all connections with your application server.
- Validate user input server-side before accepting into the database.
- Log all authentication, authorization, and error events to audit logs per schema.
- Use a reverse proxy (e.g., Nginx with appropriate modules or a node package) to filter and block suspicious requests (DOS, Path Traversal, etc.).

---

## 6. Authentication & MFA

- Use `passport` + `passport-local` for user sessions.
- Store passwords as bcrypt hashes.
- Implement TOTP (Google Authenticator-compatible) using `speakeasy`:

```js
const speakeasy = require('speakeasy');
const secret = speakeasy.generateSecret({ length: 20 });
// Store secret in MFA tokens table, generate QR for setup
```

- Enforce password change on first login for the super admin, upon expiration, or if policy requires.
- Enforce MFA setup at login if not previously enabled.

---

## 7. Roles & Policy Hierarchy

- Create a script to seed roles & the super admin account:

```js
// seed.js
const prisma = require('@prisma/client').PrismaClient;
(async () => {
  await prisma.role.createMany({ data: [
    { role_name: 'superadmin' },
    { role_name: 'admin' },
    { role_name: 'caretaker' }
  ]});
  await prisma.user.create({
    data: { username: 'admin', password: bcrypt.hashSync('admin', 10), role: { connect: { role_name: 'superadmin' } } }
  });
  console.log('Seeded roles and superadmin.');
})();
```

- Implement logic: superadmin cannot be deleted/edited by admins; can view audit logs, manage admins, policies are checked before each action.
- Use middleware to check user roles in routes:

```js
function authorize(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role < role) return res.status(403).send('Forbidden');
    next();
  }
}
```

---

## 8. App Structure & Views

- Route structure:
  - /         – Homepage (public)
  - /login    – Login (MFA step if enabled)
  - /cats     – List/search cats (Caretaker, Admin, Superadmin)
  - /cat/:id  – Cat details
  - /account  – Profile edit

- Admin views:
  - Advanced cat management (add/edit)
  - Assignment panel (manage caretakers for cats)
  - User panel (manage caregivers)

- Superadmin views:
  - All admin views, edit admins, view all logs, immune to edit/delete by admins.

---

## 9. Security Features per Schema

- Audit all user/session/password/MFA/cat assignment operations.
- Store MFA TOTP secrets securely (never reveal to user after QR setup).
- Rotate keys periodically for MFA (if configured).
- Policy enforcement per role; hierarchy: superadmin > admin > caretaker.

---

## 10. Final Notes

- Follow secure coding practices (escaping output, input validation, etc).
- Keep logic for role/policy checks centralized and scalable.
- Ensure separation: app code never runs on same host as database, even in dev.
- Keep the SQL structure file linked in the repository for setup consistency.

---

# See db_schema.sql in project folder for reference structure.

---

For more, review Prisma, pglite, and Tailwind documentation, and keep your codebase up to date with latest security patches.
