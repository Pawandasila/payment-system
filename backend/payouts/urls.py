from django.urls import path

from payouts.views import CleanupIdempotencyKeysView, DashboardView, MerchantsView, PayoutsView


urlpatterns = [
    path("merchants", MerchantsView.as_view()),
    path("dashboard", DashboardView.as_view()),
    path("payouts", PayoutsView.as_view()),
    path("maintenance/idempotency-keys/cleanup", CleanupIdempotencyKeysView.as_view()),
]
