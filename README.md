# Playto Payout Engine

Minimal payout engine for the Playto Founding Engineer Challenge 2026.

The system models merchant balances as an immutable ledger in paise, accepts idempotent payout requests, holds funds before processing, and uses a Celery worker to simulate bank settlement with retries.

## Stack

- Backend: Django 5, Django REST Framework
- Database: PostgreSQL
- Worker: Celery with Redis
- Frontend: React, Vite, Tailwind

## Run Locally (No Docker)

Prerequisites:

- Python 3.11+
- Node 20+
- PostgreSQL
- Redis

### 1) Start backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Set environment variables (PowerShell example):

```powershell
$env:POSTGRES_DB="playto"
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD="postgres"
$env:POSTGRES_HOST="localhost"
$env:POSTGRES_PORT="5432"
$env:CELERY_BROKER_URL="redis://localhost:6379/0"
$env:CELERY_RESULT_BACKEND="redis://localhost:6379/1"
$env:CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
```

Run migrations, seed data, and start API:

```bash
python manage.py migrate
python manage.py seed_demo
gunicorn config.wsgi:application --bind 0.0.0.0:8000
```

In separate terminals from `backend/`, start worker and beat:

```bash
celery -A config.celery worker -l info
celery -A config.celery beat -l info
```

### 2) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Deploy Without Docker (Render)

You can deploy this project directly on Render using `render.yaml` in the repo root.

Important: Render free tier does not include background workers. This project needs Celery worker and beat for payout processing, so full Render deployment requires paid worker instances.

### Services created from `render.yaml`

- `playto-api` (Python web service)
- `playto-worker` (Celery worker, starter plan)
- `playto-beat` (Celery beat, starter plan)
- `playto-frontend` (static site)
- `playto-postgres` (managed PostgreSQL)
- `playto-redis` (managed Redis)

### One-time steps

1. Push this repo to GitHub.
2. In Render, create a Blueprint deployment and select this repo.
3. During setup, set these prompted env vars:
  - `CORS_ALLOWED_ORIGINS` as your frontend Render URL
  - `VITE_API_URL` as your backend API URL ending with `/api/v1`
4. After first deploy, run in Render Shell for `playto-api`:

```bash
python manage.py migrate
python manage.py seed_demo
```

5. Open the frontend Render URL.

## Fully Free Deployment Path

If you must stay fully free for all services (API + worker + beat + Postgres + Redis), use a single free VM provider and run all processes there (for example, Oracle Cloud Always Free). This project already supports that setup without Docker by running gunicorn, celery worker, and celery beat as separate processes.

## API

All merchant-scoped endpoints use `X-Merchant-Id`.

List seeded merchants:

```bash
curl http://localhost:8000/api/v1/merchants
```

Dashboard:

```bash
curl http://localhost:8000/api/v1/dashboard \
  -H "X-Merchant-Id: <merchant-id>"
```

Create payout:

```bash
curl -X POST http://localhost:8000/api/v1/payouts \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: <merchant-id>" \
  -H "Idempotency-Key: 2d3c0830-4f7e-4ea7-94e9-e817dd261f63" \
  -d '{"amount_paise":600000,"bank_account_id":"<bank-account-id>"}'
```

## Tests

```bash
cd backend
python manage.py test payouts
```

The important tests are:

- `PayoutConcurrencyTests`: two simultaneous 60 rupee payout requests against a 100 rupee balance result in exactly one created payout.
- `PayoutIdempotencyTests`: replaying the same `Idempotency-Key` returns the exact same response and creates no duplicate payout.

## Worker

Celery beat runs `payouts.tasks.process_pending_payouts` every five seconds. The worker locks eligible rows with `select_for_update(skip_locked=True)`, simulates settlement, and retries stuck processing payouts after 30 seconds with exponential backoff up to three attempts.

## Notes

- Amounts are stored as `BigIntegerField` in paise.
- No `FloatField` or `DecimalField` is used for money.
- Balances are derived with database aggregation over ledger entries.
- Payout request idempotency keys are scoped by merchant and expire after 24 hours.
