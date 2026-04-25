# Playto Payout Engine

Minimal payout engine for the Playto Founding Engineer Challenge 2026.

The system models merchant balances as an immutable ledger in paise, accepts idempotent payout requests, holds funds before processing, and uses a Celery worker to simulate bank settlement with retries.

## Stack

- Backend: Django 5, Django REST Framework
- Database: PostgreSQL
- Worker: Celery with Redis
- Frontend: React, Vite, Tailwind

## Run Locally

```bash
docker compose up --build
```

In another terminal:

```bash
docker compose exec api python manage.py migrate
docker compose exec api python manage.py seed_demo
```

The compose file also starts the frontend at `http://localhost:5173`. If you prefer running it outside Docker:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

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
docker compose exec api python manage.py test payouts
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
