from django.db.models import BigIntegerField, Case, F, Sum, Value, When
from django.db.models.functions import Coalesce

from payouts.models import LedgerEntry


AVAILABLE_KINDS = {
    LedgerEntry.Kind.CREDIT: 1,
    LedgerEntry.Kind.RELEASE: 1,
    LedgerEntry.Kind.HOLD: -1,
}

HELD_KINDS = {
    LedgerEntry.Kind.HOLD: 1,
    LedgerEntry.Kind.PAYOUT: -1,
    LedgerEntry.Kind.RELEASE: -1,
}


def signed_sum_case(kind_weights):
    zero = Value(0, output_field=BigIntegerField())
    whens = [
        When(kind=kind, then=F("amount_paise") * Value(weight))
        for kind, weight in kind_weights.items()
    ]
    return Coalesce(Sum(Case(*whens, default=zero, output_field=BigIntegerField())), zero)


def balance_queryset(merchant_id):
    return LedgerEntry.objects.filter(merchant_id=merchant_id).aggregate(
        available_paise=signed_sum_case(AVAILABLE_KINDS),
        held_paise=signed_sum_case(HELD_KINDS),
    )
