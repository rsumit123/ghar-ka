# gharka

Hyperlocal home-food marketplace. See `docs/SPEC.md`. (Full README lands in a later phase.)

## Local dev

```sh
npm install
npm run setup   # cd backend && uv sync && alembic upgrade head
npm run dev     # API :8000, customer :5173, vendor :5174
```

- Backend settings: copy `backend/.env.example` to `backend/.env` (optional). OTP codes are printed in the API terminal (`SMS_PROVIDER=console`).
- Create an admin: `cd backend && uv run python -m app.cli create-admin --email you@example.com --password '...'`
- Tests: `npm test` (or `cd backend && uv run pytest`).
- Frontend env: `apps/*/.env.example`.
