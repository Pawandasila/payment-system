import uuid
import os

from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from payouts.ledger import balance_queryset
from payouts.models import BankAccount, IdempotencyKey, LedgerEntry, Merchant, Payout
from payouts.serializers import (
    BankAccountSerializer,
    LedgerEntrySerializer,
    MerchantSerializer,
    PayoutCreateSerializer,
    PayoutSerializer,
)
from payouts.services import create_payout_with_idempotency


def merchant_from_request(request):
    merchant_id = request.headers.get("X-Merchant-Id")
    if not merchant_id:
        return None
    try:
        return Merchant.objects.get(id=merchant_id)
    except (Merchant.DoesNotExist, ValueError):
        return None


class MerchantsView(APIView):
    def get(self, request):
        merchants = Merchant.objects.order_by("name")
        return Response(MerchantSerializer(merchants, many=True).data)


class DashboardView(APIView):
    def get(self, request):
        merchant = merchant_from_request(request)
        if merchant is None:
            return Response({"detail": "Missing or invalid X-Merchant-Id header."}, status=400)

        balances = balance_queryset(merchant.id)
        ledger_entries = LedgerEntry.objects.filter(merchant=merchant).order_by("-created_at")[:20]
        payouts = Payout.objects.filter(merchant=merchant).select_related("bank_account").order_by("-created_at")[:20]
        bank_accounts = BankAccount.objects.filter(merchant=merchant).order_by("created_at")
        return Response(
            {
                "merchant": MerchantSerializer(merchant).data,
                "balance": balances,
                "bank_accounts": BankAccountSerializer(bank_accounts, many=True).data,
                "ledger_entries": LedgerEntrySerializer(ledger_entries, many=True).data,
                "payouts": PayoutSerializer(payouts, many=True).data,
            }
        )


class PayoutsView(APIView):
    def post(self, request):
        merchant = merchant_from_request(request)
        if merchant is None:
            return Response({"detail": "Missing or invalid X-Merchant-Id header."}, status=400)

        key = request.headers.get("Idempotency-Key")
        if not key:
            return Response({"detail": "Idempotency-Key header is required."}, status=400)
        try:
            uuid.UUID(key)
        except ValueError:
            return Response({"detail": "Idempotency-Key must be a UUID."}, status=400)

        serializer = PayoutCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        response_body, status_code = create_payout_with_idempotency(
            merchant_id=merchant.id,
            idempotency_key=key,
            payload=serializer.validated_data,
        )
        return Response(response_body, status=status_code)

    def get(self, request):
        merchant = merchant_from_request(request)
        if merchant is None:
            return Response({"detail": "Missing or invalid X-Merchant-Id header."}, status=400)
        payouts = Payout.objects.filter(merchant=merchant).select_related("bank_account").order_by("-created_at")
        return Response(PayoutSerializer(payouts, many=True).data)


class CleanupIdempotencyKeysView(APIView):
    def post(self, request):
        deleted, _ = IdempotencyKey.objects.filter(expires_at__lt=timezone.now()).delete()
        return Response({"deleted": deleted}, status=status.HTTP_200_OK)


class BootstrapSetupView(APIView):
    def post(self, request):
        expected_token = os.getenv("BOOTSTRAP_TOKEN", "").strip()
        provided_token = request.headers.get("X-Bootstrap-Token", "").strip()

        if not expected_token:
            return Response(
                {"detail": "Bootstrap endpoint is disabled. Set BOOTSTRAP_TOKEN."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if provided_token != expected_token:
            return Response({"detail": "Invalid bootstrap token."}, status=status.HTTP_403_FORBIDDEN)

        call_command("migrate", interactive=False, verbosity=0)

        if request.query_params.get("seed", "1") != "0":
            call_command("seed_demo", verbosity=0)

        return Response(
            {
                "ok": True,
                "migrated": True,
                "seeded": request.query_params.get("seed", "1") != "0",
            },
            status=status.HTTP_200_OK,
        )
