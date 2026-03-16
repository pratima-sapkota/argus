"""BigQuery tool functions exposed to Gemini via function calling."""

import datetime
import json
import logging

from google.cloud import bigquery
from google.cloud import exceptions as gcp_exceptions

from app.config import db

logger = logging.getLogger(__name__)

_bq_client = bigquery.Client()


def _human_bytes(n: int) -> str:
    """Return a compact, speakable byte size string, e.g. '6 MB', '650 KB'."""
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{round(n)} {unit}"
        n /= 1024
    return f"{round(n)} TB"


def _make_json_safe(obj):
    """Recursively convert non-JSON-serializable types (Firestore timestamps, etc.)."""
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_json_safe(item) for item in obj]
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def get_high_severity_threats(limit: int = 5) -> list[dict]:
    """Query network_logs for the most recent MALICIOUS threat entries.

    Fetches rows from the argus_soc.network_logs BigQuery table where
    threat_intel_status is 'MALICIOUS', ordered by most recent first.

    Args:
        limit: Maximum number of rows to return. Defaults to 5.

    Returns:
        A list of dicts with keys log_id, src_ip, dest_ip, dest_port,
        timestamp, bytes, and threat_intel_status. On error, returns a single-element list
        containing {"error": "<message>"}.
    """
    query = """
        SELECT log_id, src_ip, dest_ip, dest_port, timestamp, bytes, threat_intel_status
        FROM argus_soc.network_logs
        WHERE threat_intel_status = 'MALICIOUS'
        ORDER BY timestamp DESC
        LIMIT @limit
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
        ]
    )
    try:
        result = _bq_client.query(query, job_config=job_config).result()
        return [_make_json_safe(dict(row)) for row in result]
    except gcp_exceptions.GoogleCloudError as e:
        return [{"error": str(e)}]


def filter_network_logs(
    src_ip: str | None = None,
    dest_ip: str | None = None,
    dest_port: int | None = None,
    threat_intel_status: str | None = None,
    min_bytes: int | None = None,
    max_bytes: int | None = None,
    limit: int = 10,
) -> list[dict]:
    """Query network_logs with arbitrary column filters specified by the user.

    All filter arguments are optional; only provided ones are applied.
    Results are ordered by most recent timestamp first.

    Args:
        src_ip: Filter by exact source IP address.
        dest_ip: Filter by exact destination IP address.
        dest_port: Filter by destination port number.
        threat_intel_status: Filter by status string — CLEAN, SUSPICIOUS, or MALICIOUS.
        min_bytes: Include only rows where bytes >= this value.
        max_bytes: Include only rows where bytes <= this value.
        limit: Maximum number of rows to return. Defaults to 10.

    Returns:
        A list of dicts containing all schema columns. On error, returns a
        single-element list containing {"error": "<message>"}.
    """
    conditions = []
    params: list[bigquery.ScalarQueryParameter] = [
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
    ]

    if src_ip is not None:
        conditions.append("src_ip = @src_ip")
        params.append(bigquery.ScalarQueryParameter("src_ip", "STRING", src_ip))
    if dest_ip is not None:
        conditions.append("dest_ip = @dest_ip")
        params.append(bigquery.ScalarQueryParameter("dest_ip", "STRING", dest_ip))
    if dest_port is not None:
        conditions.append("dest_port = @dest_port")
        params.append(bigquery.ScalarQueryParameter("dest_port", "INT64", dest_port))
    if threat_intel_status is not None:
        conditions.append("threat_intel_status = @threat_intel_status")
        params.append(bigquery.ScalarQueryParameter("threat_intel_status", "STRING", threat_intel_status))
    if min_bytes is not None:
        conditions.append("bytes >= @min_bytes")
        params.append(bigquery.ScalarQueryParameter("min_bytes", "INT64", min_bytes))
    if max_bytes is not None:
        conditions.append("bytes <= @max_bytes")
        params.append(bigquery.ScalarQueryParameter("max_bytes", "INT64", max_bytes))

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT log_id, src_ip, dest_ip, dest_port, timestamp, bytes, threat_intel_status
        FROM argus_soc.network_logs
        {where_clause}
        ORDER BY timestamp DESC
        LIMIT @limit
    """
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    try:
        result = _bq_client.query(query, job_config=job_config).result()
        return [_make_json_safe(dict(row)) for row in result]
    except gcp_exceptions.GoogleCloudError as e:
        return [{"error": str(e)}]


async def get_active_connections(limit: int = 20) -> list[dict]:
    """Fetch active device connections from Firestore.

    Retrieves documents from the active_connections Firestore collection,
    returning up to `limit` records. Each document is returned with its
    device_id (document ID) merged into the data fields.

    Args:
        limit: Maximum number of connection documents to return. Defaults to 20.

    Returns:
        A list of dicts containing device_id and all stored connection fields.
        On error, returns a single-element list containing {"error": "<message>"}.
    """
    try:
        docs = db.collection("active_connections").limit(limit).stream()
        result = []
        async for doc in docs:
            data = doc.to_dict() or {}
            data["device_id"] = doc.id
            result.append(_make_json_safe(data))
        return result if result else [{"info": "No active connections found."}]
    except Exception as e:
        logger.error("get_active_connections failed: %s", e)
        return [{"error": str(e)}]


async def get_connections_by_status(status: str, limit: int = 20) -> list[dict]:
    """Fetch connections from Firestore filtered by status.

    Queries the active_connections Firestore collection for documents whose
    'status' field matches the given value (e.g. ACTIVE, BLOCKED, SUSPICIOUS).

    Args:
        status: The connection status to filter on (ACTIVE, BLOCKED, SUSPICIOUS).
        limit: Maximum number of documents to return. Defaults to 20.

    Returns:
        A list of dicts containing device_id and all stored connection fields.
        On error, returns a single-element list containing {"error": "<message>"}.
    """
    try:
        docs = (
            db.collection("active_connections")
            .where("status", "==", status.upper())
            .limit(limit)
            .stream()
        )
        result = []
        async for doc in docs:
            data = doc.to_dict() or {}
            data["device_id"] = doc.id
            result.append(_make_json_safe(data))
        return result if result else [{"info": f"No connections with status '{status.upper()}' found."}]
    except Exception as e:
        logger.error("get_connections_by_status failed for status=%s: %s", status, e)
        return [{"error": str(e)}]


async def get_connection_details(device_id: str) -> list[dict]:
    """Fetch connection details for a specific device ID from Firestore.

    Retrieves the document for the given device_id from the active_connections
    Firestore collection.

    Args:
        device_id: The device ID or IP address to look up.

    Returns:
        A single-element list containing the connection document fields plus
        device_id. If the document does not exist, returns
        [{"info": "Device not found."}]. On error, returns [{"error": "<message>"}].
    """
    try:
        doc = await db.collection("active_connections").document(device_id).get()
        if not doc.exists:
            return [{"info": f"Device '{device_id}' not found in active connections."}]
        data = doc.to_dict() or {}
        data["device_id"] = doc.id
        return [_make_json_safe(data)]
    except Exception as e:
        logger.error("get_connection_details failed for %s: %s", device_id, e)
        return [{"error": str(e)}]


async def block_device(device_id: str) -> list[dict]:
    """Blocks a specific device ID or IP address from accessing the network by updating the firewall rules."""
    try:
        doc_ref = db.collection("active_connections").document(device_id)
        await doc_ref.set({"status": "BLOCKED"}, merge=True)
        return [{"blocked": device_id}]
    except Exception as e:
        logger.error("block_device failed for %s: %s", device_id, e)
        return [{"error": str(e)}]


async def unblock_device(device_id: str) -> list[dict]:
    """Unblocks a previously blocked device ID or IP address, restoring its network access."""
    try:
        doc_ref = db.collection("active_connections").document(device_id)
        doc = await doc_ref.get()
        if not doc.exists:
            return [{"error": f"Device '{device_id}' not found in active connections."}]
        if (doc.to_dict() or {}).get("status") != "BLOCKED":
            return [{"info": f"Device '{device_id}' is not currently blocked."}]
        await doc_ref.update({"status": "ALLOWED"})
        return [{"unblocked": device_id}]
    except Exception as e:
        logger.error("unblock_device failed for %s: %s", device_id, e)
        return [{"error": str(e)}]


def get_network_summary() -> list[dict]:
    """Return an at-a-glance summary of the entire network_logs dataset.

    Runs three aggregate BigQuery queries in sequence:
      1. Threat distribution — COUNT(*) per threat_intel_status.
      2. Top 5 destination ports — by hit count and total bytes.
      3. Top 5 source IPs — by hit count, with malicious hit count.

    Returns:
        A single-element list containing a dict with keys
        threat_distribution, top_ports, top_source_ips, and total_events.
        On error, returns [{"error": "<message>"}].
    """
    try:
        dist_rows = _bq_client.query("""
            SELECT threat_intel_status AS status, COUNT(*) AS count
            FROM argus_soc.network_logs
            GROUP BY threat_intel_status
            ORDER BY count DESC
        """).result()
        threat_distribution = [_make_json_safe(dict(r)) for r in dist_rows]
        total_events = sum(r["count"] for r in threat_distribution)

        port_rows = _bq_client.query("""
            SELECT dest_port AS port,
                   COUNT(*)   AS total_hits,
                   SUM(bytes) AS total_bytes
            FROM argus_soc.network_logs
            GROUP BY dest_port
            ORDER BY total_hits DESC
            LIMIT 5
        """).result()
        top_ports = [_make_json_safe(dict(r)) for r in port_rows]

        ip_rows = _bq_client.query("""
            SELECT src_ip,
                   COUNT(*) AS total_hits,
                   COUNTIF(threat_intel_status = 'MALICIOUS') AS malicious_hits
            FROM argus_soc.network_logs
            GROUP BY src_ip
            ORDER BY total_hits DESC
            LIMIT 5
        """).result()
        top_source_ips = [_make_json_safe(dict(r)) for r in ip_rows]

        return [{
            "total_events": total_events,
            "threat_distribution": threat_distribution,
            "top_ports": top_ports,
            "top_source_ips": top_source_ips,
        }]
    except gcp_exceptions.GoogleCloudError as e:
        return [{"error": str(e)}]


def get_traffic_by_port(port: int, limit: int = 5) -> list[dict]:
    """Query network_logs for traffic targeting a specific destination port.

    Fetches rows from the argus_soc.network_logs BigQuery table filtered
    by dest_port, ordered by most recent first.

    Args:
        port: The destination port number to filter on.
        limit: Maximum number of rows to return. Defaults to 5.

    Returns:
        A list of dicts with keys log_id, src_ip, threat_intel_status,
        timestamp, and bytes. On error, returns a single-element list
        containing {"error": "<message>"}.
    """
    query = """
        SELECT log_id, src_ip, threat_intel_status, timestamp, bytes
        FROM argus_soc.network_logs
        WHERE dest_port = @port
        ORDER BY timestamp DESC
        LIMIT @limit
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("port", "INT64", port),
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
        ]
    )
    try:
        result = _bq_client.query(query, job_config=job_config).result()
        return [_make_json_safe(dict(row)) for row in result]
    except gcp_exceptions.GoogleCloudError as e:
        return [{"error": str(e)}]
