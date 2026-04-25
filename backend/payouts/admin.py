from django.contrib import admin

from payouts.models import BankAccount, IdempotencyKey, LedgerEntry, Merchant, Payout


admin.site.register(Merchant)
admin.site.register(BankAccount)
admin.site.register(Payout)
admin.site.register(LedgerEntry)
admin.site.register(IdempotencyKey)
