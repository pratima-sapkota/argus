"""BigQuery tool functions exposed to Gemini via function calling."""

import datetime

from google.cloud import bigquery
from google.cloud import exceptions as gcp_exceptions

_bq_client = bigquery.Client()


def _human_bytes(n: int) -> str:
    """Return a compact, speakable byte size string, e.g. '6 MB', '650 KB'."""
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{round(n)} {unit}"
        n /= 1024
    return f"{round(n)} TB"


def _serialize_row(row: dict) -> dict:
    """Convert a BigQuery row dict to JSON-safe types."""
    out = {}
    for k, v in row.items():
        if isinstance(v, (datetime.datetime, datetime.date)):
            out[k] = v.strftime("%b %-d, %Y")
        elif k == "bytes" and isinstance(v, int):
            out[k] = _human_bytes(v)
        else:
            out[k] = v
    return out


def get_high_severity_threats(limit: int = 5) -> list[dict]:
    """Query network_logs for the most recent MALICIOUS threat entries.

    Fetches rows from the argus_soc.network_logs BigQuery table where
    threat_intel_status is 'MALICIOUS', ordered by most recent first.

    Args:
        limit: Maximum number of rows to return. Defaults to 5.

    Returns:
        A list of dicts with keys log_id, src_ip, dest_ip, dest_port,
        timestamp, and bytes. On error, returns a single-element list
        containing {"error": "<message>"}.
    """
    query = """
        SELECT log_id, src_ip, dest_ip, dest_port, timestamp, bytes
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
        return [_serialize_row(dict(row)) for row in result]
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
        return [_serialize_row(dict(row)) for row in result]
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
        return [_serialize_row(dict(row)) for row in result]
    except gcp_exceptions.GoogleCloudError as e:
        return [{"error": str(e)}]
