import uuid
from concurrent.futures import ThreadPoolExecutor

from django.db import connections
from django.test import TestCase, TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient

from payouts.ledger import balance_queryset
from payouts.models import BankAccount, LedgerEntry, Merchant, Payout
from payouts.services import create_payout_with_idempotency


class PayoutConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.merchant = Merchant.objects.create(name="Race Condition Studio")
        self.bank_account = BankAccount.objects.create(
            merchant=self.merchant,
            account_holder_name="Race Condition Studio",
            bank_name="HDFC Bank",
            last4="1234",
        )
        LedgerEntry.objects.create(
            merchant=self.merchant,
            kind=LedgerEntry.Kind.CREDIT,
            amount_paise=10000,
            description="Opening balance",
        )

    def tearDown(self):
        connections.close_all()

    def _request_payout(self):
        try:
            body, code = create_payout_with_idempotency(
                merchant_id=self.merchant.id,
                idempotency_key=str(uuid.uuid4()),
                payload={"amount_paise": 6000, "bank_account_id": str(self.bank_account.id)},
            )
            return code, body
        finally:
            connections.close_all()

    def test_concurrent_payouts_cannot_overdraw_available_balance(self):
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: self._request_payout(), range(2)))

        codes = sorted(code for code, _body in results)
        self.assertEqual(codes, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])
        self.assertEqual(Payout.objects.count(), 1)
        self.assertEqual(balance_queryset(self.merchant.id), {"available_paise": 4000, "held_paise": 6000})


class PayoutIdempotencyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.merchant = Merchant.objects.create(name="Replay Safe LLC")
        self.bank_account = BankAccount.objects.create(
            merchant=self.merchant,
            account_holder_name="Replay Safe LLC",
            bank_name="ICICI Bank",
            last4="5678",
        )
        LedgerEntry.objects.create(
            merchant=self.merchant,
            kind=LedgerEntry.Kind.CREDIT,
            amount_paise=50000,
            description="Opening balance",
        )

    def test_replaying_same_idempotency_key_returns_exact_same_response(self):
        key = str(uuid.uuid4())
        payload = {"amount_paise": 12000, "bank_account_id": str(self.bank_account.id)}
        headers = {"HTTP_X_MERCHANT_ID": str(self.merchant.id), "HTTP_IDEMPOTENCY_KEY": key}

        first = self.client.post("/api/v1/payouts", payload, format="json", **headers)
        second = self.client.post("/api/v1/payouts", payload, format="json", **headers)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(Payout.objects.count(), 1)
