from django.core.management.base import BaseCommand

from payouts.models import BankAccount, LedgerEntry, Merchant


class Command(BaseCommand):
    help = "Seed demo merchants, bank accounts, and credit history."

    def handle(self, *args, **options):
        data = [
            ("Aarav Design Studio", "HDFC Bank", "2041", [1250000, 870000, 640000]),
            ("Blue Kite Media", "ICICI Bank", "8821", [2200000, 350000]),
            ("Northstar SaaS", "Axis Bank", "1190", [5000000, 1100000, 930000]),
        ]
        for name, bank, last4, credits in data:
            merchant, _ = Merchant.objects.get_or_create(name=name)
            BankAccount.objects.get_or_create(
                merchant=merchant,
                last4=last4,
                defaults={
                    "account_holder_name": name,
                    "bank_name": bank,
                },
            )
            if not LedgerEntry.objects.filter(merchant=merchant, kind=LedgerEntry.Kind.CREDIT).exists():
                for amount in credits:
                    LedgerEntry.objects.create(
                        merchant=merchant,
                        kind=LedgerEntry.Kind.CREDIT,
                        amount_paise=amount,
                        description="Simulated international customer payment",
                    )
            self.stdout.write(self.style.SUCCESS(f"Seeded {merchant.name} ({merchant.id})"))
