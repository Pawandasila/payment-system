import hashlib
import json
import random
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError

from payouts.ledger import balance_queryset
from payouts.models import BankAccount, IdempotencyKey, LedgerEntry, Merchant, Payout
from payouts.serializers import PayoutSerializer


LEGAL_TRANSITIONS = {
    Payout.Status.PENDING: {Payout.Status.PROCESSING},
    Payout.Status.PROCESSING: {Payout.Status.COMPLETED, Payout.Status.FAILED},
    Payout.Status.COMPLETED: set(),
    Payout.Status.FAILED: set(),
}


def hash_payload(payload):
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def create_payout_with_idempotency(*, merchant_id, idempotency_key, payload):
    request_hash = hash_payload(payload)
    expires_at = timezone.now() + timedelta(hours=24)

    with transaction.atomic():
        merchant = Merchant.objects.select_for_update().get(id=merchant_id)
        idem, created = _get_or_create_idempotency_key(merchant, idempotency_key, request_hash, expires_at)
        idem = IdempotencyKey.objects.select_for_update().get(pk=idem.pk)

        if not created and idem.response_body is not None:
            if idem.request_hash != request_hash:
                raise ValidationError("Idempotency-Key was already used with a different payload.")
            return idem.response_body, idem.status_code

        if not created and idem.request_hash != request_hash:
            raise ValidationError("Idempotency-Key was already used with a different payload.")

        amount_paise = int(payload["amount_paise"])
        try:
            bank_account = BankAccount.objects.get(id=payload["bank_account_id"], merchant=merchant)
        except BankAccount.DoesNotExist:
            raise ValidationError("Bank account does not belong to this merchant.")
        balances = balance_queryset(merchant.id)
        if balances["available_paise"] < amount_paise:
            response = {"detail": "Insufficient available balance."}
            idem.response_body = response
            idem.status_code = status.HTTP_400_BAD_REQUEST
            idem.expires_at = expires_at
            idem.save(update_fields=["response_body", "status_code", "expires_at", "updated_at"])
            return response, status.HTTP_400_BAD_REQUEST

        payout = Payout.objects.create(
            merchant=merchant,
            bank_account=bank_account,
            amount_paise=amount_paise,
            status=Payout.Status.PENDING,
        )
        LedgerEntry.objects.create(
            merchant=merchant,
            payout=payout,
            kind=LedgerEntry.Kind.HOLD,
            amount_paise=amount_paise,
            description="Funds held for payout request",
        )
        response = PayoutSerializer(payout).data
        idem.payout = payout
        idem.response_body = response
        idem.status_code = status.HTTP_201_CREATED
        idem.expires_at = expires_at
        idem.save(update_fields=["payout", "response_body", "status_code", "expires_at", "updated_at"])
        return response, status.HTTP_201_CREATED


def _get_or_create_idempotency_key(merchant, key, request_hash, expires_at):
    try:
        with transaction.atomic():
            return IdempotencyKey.objects.create(
                merchant=merchant,
                key=key,
                request_hash=request_hash,
                expires_at=expires_at,
            ), True
    except IntegrityError:
        idem = IdempotencyKey.objects.get(merchant=merchant, key=key)
        if idem.expires_at < timezone.now():
            idem.delete()
            with transaction.atomic():
                return IdempotencyKey.objects.create(
                    merchant=merchant,
                    key=key,
                    request_hash=request_hash,
                    expires_at=expires_at,
                ), True
        return idem, False


@transaction.atomic
def transition_payout(payout, new_status, *, failure_reason=""):
    if new_status not in LEGAL_TRANSITIONS[payout.status]:
        raise ValidationError(f"Illegal payout transition {payout.status} -> {new_status}.")

    payout.status = new_status
    if new_status == Payout.Status.PROCESSING:
        payout.processing_started_at = timezone.now()
    elif new_status == Payout.Status.COMPLETED:
        payout.completed_at = timezone.now()
        LedgerEntry.objects.create(
            merchant=payout.merchant,
            payout=payout,
            kind=LedgerEntry.Kind.PAYOUT,
            amount_paise=payout.amount_paise,
            description="Payout completed",
        )
    elif new_status == Payout.Status.FAILED:
        payout.failed_at = timezone.now()
        payout.failure_reason = failure_reason
        LedgerEntry.objects.create(
            merchant=payout.merchant,
            payout=payout,
            kind=LedgerEntry.Kind.RELEASE,
            amount_paise=payout.amount_paise,
            description="Held payout funds released after failure",
        )
    payout.save()
    return payout


def process_one_payout(payout_id=None):
    now = timezone.now()
    with transaction.atomic():
        queryset = Payout.objects.select_for_update(skip_locked=True).filter(
            status__in=[Payout.Status.PENDING, Payout.Status.PROCESSING],
            next_attempt_at__lte=now,
        )
        if payout_id:
            queryset = queryset.filter(id=payout_id)
        else:
            queryset = queryset.order_by("created_at")
        payout = queryset.first()
        if payout is None:
            return None

        if payout.status == Payout.Status.PROCESSING and payout.processing_started_at:
            if payout.processing_started_at > now - timedelta(seconds=30):
                return None

        if payout.attempts >= 3:
            return transition_payout(payout, Payout.Status.FAILED, failure_reason="Max retry attempts exceeded")

        if payout.status == Payout.Status.PENDING:
            transition_payout(payout, Payout.Status.PROCESSING)

        next_attempt = int(payout.attempts) + 1
        payout.attempts = next_attempt
        payout.next_attempt_at = now + timedelta(seconds=2**next_attempt)
        payout.save(update_fields=["attempts", "next_attempt_at", "updated_at"])
        payout.refresh_from_db()

        outcome = random.choices(["completed", "failed", "processing"], weights=[70, 20, 10], k=1)[0]
        if outcome == "completed":
            return transition_payout(payout, Payout.Status.COMPLETED)
        if outcome == "failed":
            return transition_payout(payout, Payout.Status.FAILED, failure_reason="Bank settlement failed")

        payout.processing_started_at = now - timedelta(seconds=31)
        payout.save(update_fields=["processing_started_at", "updated_at"])
        return payout
