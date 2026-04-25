from config.celery import app
from payouts.services import process_one_payout


@app.task
def process_pending_payouts():
    processed = 0
    while process_one_payout() is not None:
        processed += 1
    return processed
