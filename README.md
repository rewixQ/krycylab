# Cat Management Lab

Secure Node.js + Prisma lab that demonstrates cat inventory management with MFA, audit logging, and strict role-based access (superadmin > admin > caretaker). The stack uses pnpm, Express 5, TypeScript, Prisma, pglite (SQLite) for local work, PostgreSQL for production, and server-rendered Nunjucks views.

## Getting Started

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Copy environment defaults**
   ```bash
   cp env.example .env
   ```
   Update `DATABASE_URL`, `SESSION_SECRET`, and the superadmin credentials.
3. **Generate Prisma client**
   ```bash
   pnpm prisma generate
   ```
4. **Create the database & run migrations**
   ```bash
   set DATABASE_URL=file:./dev.db && pnpm prisma:migrate
   ```
5. **Seed roles + superadmin**
   ```bash
   set DATABASE_URL=file:./dev.db && pnpm seed
   ```
6. **Start development server**
   ```bash
   pnpm dev
   ```

## Switching to PostgreSQL

1. Ensure PostgreSQL is running and create an empty database.
2. Set `DATABASE_URL` (and optionally `POSTGRES_DATABASE_URL`) in `.env`, e.g.  
   `DATABASE_URL="postgresql://user:pass@localhost:5432/cats"`
3. Update `prisma/schema.prisma` datasource provider to `"postgresql"` (the PostgreSQL block is commented in the file for easy toggling).
4. Run `pnpm prisma:deploy` (or `pnpm prisma:migrate` for dev) against Postgres.
5. Re-run `pnpm seed` to load base roles and accounts.

## Useful Scripts

- `pnpm dev` – run the Express server via tsx + live reload.
- `pnpm build` – emit compiled JavaScript into `dist`.
- `pnpm start` – run the compiled server.
- `pnpm prisma:migrate` – apply schema changes in development.
- `pnpm prisma:deploy` – apply migrations in production environments.
- `pnpm seed` – populate required roles and the superadmin account.
- `pnpm tailwind` – compile Tailwind styles to `public/assets/tailwind.css`.

## Project Layout

- `src/server.ts` – main Express entry point (auth, routes, middleware).
- `src/routes` – route modules for auth, cats, assignments, admin, etc.
- `src/views` – Nunjucks templates rendered on the server side.
- `src/lib` – auth helpers, Prisma client, policy checks, logging utilities.
- `prisma/schema.prisma` – database schema reflecting `db_schema.sql`.
- `prisma/migrations` – generated migrations.
- `prisma/seed.ts` – seeds roles + superadmin.
- `public/assets` – compiled Tailwind CSS and static assets.

Refer to `setup-instructions.md` for the detailed lab requirements.

## Security Highlights

- Passport local auth + bcrypt hashing, login attempt tracking, and automatic lockouts.
- Mandatory MFA (TOTP via Speakeasy) enforcement with trusted-device support.
- Centralized role guard middleware (superadmin > admin > caretaker) and audit logging of key events.
- HTTPS redirect middleware for production plus Helmet hardening and session file store.
- Prisma-backed audit logs covering user, cat, and MFA operations with change metadata.

