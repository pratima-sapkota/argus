import os
from dotenv import load_dotenv

load_dotenv()


class _Settings:
    def __init__(self):
        self.GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT")
        self.GOOGLE_CLOUD_LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
        self.ALLOWED_ORIGINS = [
            o.strip()
            for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
            if o.strip()
        ]
        if not self.GOOGLE_CLOUD_PROJECT:
            raise ValueError("GOOGLE_CLOUD_PROJECT is not set. Check backend/.env")


settings = _Settings()

from google.cloud import firestore  # noqa: E402
db: firestore.AsyncClient = firestore.AsyncClient(
    project=settings.GOOGLE_CLOUD_PROJECT
)
