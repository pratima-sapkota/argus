from datetime import datetime, timezone

from app.config import db
from app.tools import _make_json_safe


async def create_incident(title: str) -> dict:
    data = {
        "title": title,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
        "closed_at": None,
        "summary": None,
    }
    _, doc_ref = await db.collection("incidents").add(data)
    return _make_json_safe({"id": doc_ref.id, **data})


async def get_incident(incident_id: str) -> dict | None:
    doc = await db.collection("incidents").document(incident_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id
    return _make_json_safe(data)


async def list_incidents(status: str | None = None, limit: int = 20) -> list[dict]:
    query = db.collection("incidents").order_by("created_at", direction="DESCENDING").limit(limit)
    if status:
        query = query.where("status", "==", status)
    results = []
    async for doc in query.stream():
        data = doc.to_dict()
        data["id"] = doc.id
        results.append(_make_json_safe(data))
    return results


async def get_transcripts(incident_id: str) -> list[dict]:
    query = db.collection("incidents").document(incident_id) \
        .collection("transcripts").order_by("timestamp")
    results = []
    async for doc in query.stream():
        data = doc.to_dict()
        data["id"] = doc.id
        results.append(_make_json_safe(data))
    return results


async def close_incident(incident_id: str, summary: str | None = None) -> dict | str:
    doc_ref = db.collection("incidents").document(incident_id)
    doc = await doc_ref.get()
    if not doc.exists:
        return "not_found"
    data = doc.to_dict()
    if data.get("status") == "closed":
        return "already_closed"
    update = {
        "status": "closed",
        "closed_at": datetime.now(timezone.utc),
    }
    if summary is not None:
        update["summary"] = summary
    await doc_ref.update(update)
    updated = await doc_ref.get()
    result = updated.to_dict()
    result["id"] = updated.id
    return _make_json_safe(result)
