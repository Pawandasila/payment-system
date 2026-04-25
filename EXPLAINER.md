# EXPLAINER

## 1. The Ledger

Balance calculation query:

```python
def balance_queryset(merchant_id):
    return LedgerEntry.objects.filter(merchant_id=merchant_id).aggregate(
        available_paise=signed_sum_case({
            LedgerEntry.Kind.CREDIT: 1,
            LedgerEntry.Kind.RELEASE: 1,
            LedgerEntry.Kind.HOLD: -1,
        }),
        held_paise=signed_sum_case({
            LedgerEntry.Kind.HOLD: 1,
            LedgerEntry.Kind.PAYOUT: -1,
            LedgerEntry.Kind.RELEASE: -1,
        }),
    )
```

I modeled the ledger as append-only rows because money systems need an audit trail. A customer payment is a `credit`. Creating a payout writes a `hold`, which reduces available balance and increases held balance. A successful bank settlement writes a `payout`, which removes held funds permanently. A failed payout writes a `release`, which moves held funds back to available.

## 2. The Lock

The overdraft prevention is in `create_payout_with_idempotency`:

```python
with transaction.atomic():
    merchant = Merchant.objects.select_for_update().get(id=merchant_id)
    ...
    balances = balance_queryset(merchant.id)
    if balances["available_paise"] < amount_paise:
        return {"detail": "Insufficient available balance."}, 400
    payout = Payout.objects.create(...)
    LedgerEntry.objects.create(kind=LedgerEntry.Kind.HOLD, ...)
```

The primitive is PostgreSQL row-level locking via `SELECT ... FOR UPDATE` on the merchant row. Every payout request for the same merchant must acquire that lock before calculating balance and writing the hold ledger entry. That serializes check-and-hold, so two concurrent requests cannot both see the same available balance.

## 3. The Idempotency

The system stores `IdempotencyKey(merchant, key)` with a unique constraint, request hash, status code, and response body. On a replay, it locks that idempotency row and returns the stored response body/status code.

If the first request is still in flight when the second arrives, the second request is forced to wait behind the merchant/idempotency row locks. Once the first request commits the response, the second reads and returns the exact stored response instead of creating another payout. If the same key is reused with a different payload, the API returns a validation error.

## 4. The State Machine

Illegal transitions are blocked in `transition_payout`:

```python
LEGAL_TRANSITIONS = {
    Payout.Status.PENDING: {Payout.Status.PROCESSING},
    Payout.Status.PROCESSING: {Payout.Status.COMPLETED, Payout.Status.FAILED},
    Payout.Status.COMPLETED: set(),
    Payout.Status.FAILED: set(),
}

if new_status not in LEGAL_TRANSITIONS[payout.status]:
    raise ValidationError(f"Illegal payout transition {payout.status} -> {new_status}.")
```

Because `Payout.Status.FAILED` maps to an empty set, `failed -> completed` is rejected. The failed transition also writes the release ledger entry in the same transaction as the status update, so returning funds is atomic with marking the payout failed.

## 5. The AI Audit

A subtly wrong version I considered was this:

```python
available = merchant.balance_paise
if available >= amount_paise:
    merchant.balance_paise -= amount_paise
    merchant.save()
```

That is wrong for two reasons. First, it stores a mutable balance instead of deriving balance from the ledger. Second, two concurrent requests can both read the same balance before either save happens.

I replaced it with a transaction, PostgreSQL row lock, database aggregate balance query, and an append-only `HOLD` ledger entry:

```python
with transaction.atomic():
    merchant = Merchant.objects.select_for_update().get(id=merchant_id)
    balances = balance_queryset(merchant.id)
    if balances["available_paise"] < amount_paise:
        return {"detail": "Insufficient available balance."}, 400
    LedgerEntry.objects.create(
        merchant=merchant,
        payout=payout,
        kind=LedgerEntry.Kind.HOLD,
        amount_paise=amount_paise,
    )
```

This makes the database serialize payout requests for one merchant and keeps the balance explainable from ledger history.
