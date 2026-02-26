"""BigQuery tool functions exposed to Gemini via function calling."""

import datetime

from google.cloud import bigquery
from google.cloud import exceptions as gcp_exceptions

_bq_client = bigquery.Client()


def _serialize_row(row: dict) -> dict:
    """Convert a BigQuery row dict to JSON-safe types."""
    out = {}
    for k, v in row.items():
        if isinstance(v, (datetime.datetime, datetime.date)):
            out[k] = v.isoformat()
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
