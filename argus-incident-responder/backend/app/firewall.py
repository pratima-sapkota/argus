from app.config import db


async def is_blocked(device_id: str) -> bool:
    doc = await db.collection("active_connections").document(device_id).get()
    return doc.exists and (doc.to_dict() or {}).get("status") == "BLOCKED"
