import os
from dotenv import load_dotenv

load_dotenv()


class _Settings:
    def __init__(self):
        self.GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
        self.GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT")
        if not self.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY is not set. Check backend/.env")


settings = _Settings()

from google.cloud import firestore  # noqa: E402
db: firestore.AsyncClient = firestore.AsyncClient(
    project=settings.GOOGLE_CLOUD_PROJECT
)
