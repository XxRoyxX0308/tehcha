# BMS 手搖飲管理系統

See [PLAN.md](PLAN.md) for scope, design direction and decisions. Source spec: `資料庫系統.pdf`.

```
frontend/   Vue 3 + Vite + TypeScript app (customer / staff / admin ends)
backend/    Laravel + PostgreSQL REST API (not started yet)
```

## Front end

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
npm test        # pricing / state-machine unit tests
npm run build   # type-check + production build
```

Needs Node 18+. Demo customer login: `demo` / `demo1234`. Data is kept in `localStorage`;
clear the `bms-*` keys to reset.

## Status

- Done: customer end (menu, customize, cart, checkout, order tracking, history, points, review, account).
- Next: employee end (`/staff`), operations end (`/admin`).
- Back end: the real API replaces `frontend/src/api/index.ts` only (it is currently a mock).
