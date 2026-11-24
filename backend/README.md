# Back end

TypeScript REST API (Hono) over PostgreSQL, run as one Vercel Function (`../api/index.ts`) in
production and as a Node server (`src/server.ts`, port 8787) locally. Setup, deployment and the
list of changes against the SRS are in the root [README](../README.md).

```
src/
  app.ts            routes and the roles each one needs (UMS-N-002)
  auth.ts           bcrypt, signed session cookie, RBAC helpers
  db.ts             pool, parameterised queries, transactions (DBS-N-001)
  domain/           pure rules: pricing, order state machine, business dates
  services/         one file per subsystem: ums, pis, srms, scms, ocs, dis, srs, dbs
db/
  migrations/       schema (applied in order, tracked in schema_migrations)
  seed.sql          sample data
scripts/migrate.mjs npm run db:migrate | db:seed | db:reset
devdb/              local PostgreSQL 17 for development and tests (not deployed)
test/               vitest: unit, integration, concurrency
```

Relative imports use the `.ts` extension: Vercel's TypeScript build rewrites them to `.js`
(`rewriteRelativeImportExtensions`), and its file tracer only finds files that exist under the
imported name.

## API

All bodies are JSON. Errors are `{ "error": "message", "code": "..." }`.

| Area | Routes |
|---|---|
| Public | `GET /health` `GET /status` `GET /catalog` `GET /stores/:id/stock` `GET /stores/:id/reviews` `GET /products/search?q&categoryId&minPrice&maxPrice` `GET /products/:id/also-bought` `POST /quote` |
| Sign-in | `POST /auth/register` `POST /auth/login` `POST /auth/logout` `GET /auth/me` `GET /auth/verify?token` `PATCH /me` `POST /me/password` |
| Customer | `GET /me/points` `GET /me/usual` `GET/POST /cart(/items)` `PATCH/DELETE /cart/items/:id` `POST /cart/merge` `POST /orders` `GET /orders` `GET /orders/:id` `GET /orders/:id/status` `POST /orders/:id/cancel` `POST /orders/:id/review` |
| Staff | `GET /staff/overview` `GET /staff/stores/:id/board` `POST /staff/orders/:id/advance` products, categories, options CRUD; `PUT /staff/stores/:id` `GET/PUT /staff/stores/:id/stock(/:productId)` `GET /staff/alerts` discounts CRUD; `GET /staff/reports/:kind?from&to&storeId&format=csv` (kind: summary, sales, best-sellers, purchases, hourly, category) |
| Admin | `GET/POST /admin/users` `GET/PUT /admin/users/:id` `POST /admin/users/:id/status` `POST /admin/users/:id/warn` `POST /admin/stores` backups list / create / download / restore / delete, `POST /admin/restore` (file) `GET /admin/integrity` `GET/PUT /admin/maintenance` |
| Cron | `GET /cron/backup` (Vercel Cron, `Authorization: Bearer $CRON_SECRET`) |
