import uuid

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Merchant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class BankAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, related_name="bank_accounts", on_delete=models.CASCADE)
    account_holder_name = models.CharField(max_length=120)
    bank_name = models.CharField(max_length=120)
    last4 = models.CharField(max_length=4)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.bank_name} ****{self.last4}"


class Payout(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, related_name="payouts", on_delete=models.CASCADE)
    bank_account = models.ForeignKey(BankAccount, related_name="payouts", on_delete=models.PROTECT)
    amount_paise = models.BigIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    processing_started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.amount_paise <= 0:
            raise ValidationError("Payout amount must be positive.")

    def __str__(self):
        return f"{self.id} {self.status} {self.amount_paise}"


class LedgerEntry(models.Model):
    class Kind(models.TextChoices):
        CREDIT = "credit", "Credit"
        HOLD = "hold", "Hold"
        PAYOUT = "payout", "Payout"
        RELEASE = "release", "Release"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, related_name="ledger_entries", on_delete=models.CASCADE)
    payout = models.ForeignKey(Payout, related_name="ledger_entries", null=True, blank=True, on_delete=models.PROTECT)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    amount_paise = models.BigIntegerField()
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(check=Q(amount_paise__gt=0), name="ledger_amount_positive"),
        ]
        indexes = [
            models.Index(fields=["merchant", "-created_at"]),
            models.Index(fields=["payout", "kind"]),
        ]

    def __str__(self):
        return f"{self.kind} {self.amount_paise}"


class IdempotencyKey(models.Model):
    merchant = models.ForeignKey(Merchant, related_name="idempotency_keys", on_delete=models.CASCADE)
    key = models.UUIDField()
    request_hash = models.CharField(max_length=64)
    response_body = models.JSONField(null=True, blank=True)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    payout = models.ForeignKey(Payout, null=True, blank=True, on_delete=models.SET_NULL)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["merchant", "key"], name="unique_idempotency_key_per_merchant"),
        ]
