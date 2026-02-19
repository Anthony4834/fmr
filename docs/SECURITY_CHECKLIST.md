# Security checklist for new routes

Use this when adding or changing API routes or auth-sensitive code.

## New API route

- [ ] **Auth**: If the route is not public, enforce `auth()` and role/ownership checks at the top (before any DB/external calls).
- [ ] **Admin/debug**: Routes under `/api/admin/*`, `/api/debug/*`, `/api/test-coverage/*` must require `session.user.role === 'admin'`.
- [ ] **Errors**: Do not return `error?.message`, `details`, `stack`, or internal data in JSON responses. Log server-side only; return a generic message to the client.
- [ ] **CORS**: CORS is allowlist-based (site origin + chrome-extension + `CORS_ALLOWED_ORIGINS`). No code change needed unless you add a new origin.
- [ ] **Input**: Validate and sanitize query/body params. Use parameterized queries for SQL; avoid template literals in SQL strings.
- [ ] **Cron**: Cron routes must use `CRON_SECRET` via `Authorization: Bearer` header only (no `?secret=` in URL). Validate any query params (e.g. digits-only for numeric options).

## New page that should be admin-only

- [ ] Add a server layout or server component that calls `auth()` and redirects when `session.user.role !== 'admin'`, or place the page under `/admin` and rely on the admin layout.

## Logging

- [ ] Do not log tokens, session payloads, or user identifiers in production. Gate verbose auth logs with `process.env.NODE_ENV === 'development'`.

## Rate limiting

- [ ] Client IP is taken from `X-Real-IP` / `CF-Connecting-IP` first, then `X-Forwarded-For`. Deploy behind a trusted proxy (e.g. Vercel) for reliable rate limiting.
