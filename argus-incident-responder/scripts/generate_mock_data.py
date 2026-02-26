"""
generate_mock_data.py
---------------------
Seeds the BigQuery table `argus_soc.network_logs` with 1,000 rows of
synthetic network traffic data for Project Argus development and testing.

Usage:
    pip install google-cloud-bigquery faker
    python scripts/generate_mock_data.py

Environment variables:
    GOOGLE_CLOUD_PROJECT  - GCP project ID (falls back to gcloud ADC project)
    BQ_DATASET            - BigQuery dataset name (default: argus_soc)
    BQ_TABLE              - BigQuery table name  (default: network_logs)
    ROW_COUNT             - Number of rows to generate (default: 1000)
"""

from __future__ import annotations

import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from faker import Faker
from google.cloud import bigquery

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ID: str = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
DATASET_ID: str = os.environ.get("BQ_DATASET", "argus_soc")
TABLE_ID: str   = os.environ.get("BQ_TABLE", "network_logs")
ROW_COUNT: int  = int(os.environ.get("ROW_COUNT", "1000"))

# ---------------------------------------------------------------------------
# BigQuery schema
# ---------------------------------------------------------------------------
SCHEMA: list[bigquery.SchemaField] = [
    bigquery.SchemaField("log_id",             "STRING",    mode="REQUIRED"),
    bigquery.SchemaField("timestamp",          "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("src_ip",             "STRING",    mode="REQUIRED"),
    bigquery.SchemaField("dest_ip",            "STRING",    mode="REQUIRED"),
    bigquery.SchemaField("dest_port",          "INTEGER",   mode="REQUIRED"),
    bigquery.SchemaField("bytes",              "INTEGER",   mode="REQUIRED"),
    bigquery.SchemaField("threat_intel_status","STRING",    mode="REQUIRED"),
]

# ---------------------------------------------------------------------------
# Data generation constants
# ---------------------------------------------------------------------------
fake = Faker()

# Internal RFC-1918 prefixes used as source IPs
INTERNAL_PREFIXES: list[str] = ["10.0.", "10.1.", "192.168.1.", "172.16.0."]

# A small pool of known-bad external IPs to repeat across MALICIOUS rows
MALICIOUS_IPS: list[str] = [
    "185.220.101.45",
    "45.142.212.100",
    "91.108.4.0",
    "198.51.100.22",
    "203.0.113.99",
]

# Destination port weights: (port, relative_weight)
PORT_POOL: list[tuple[int, int]] = [
    (80,   30),
    (443,  40),
    (22,   10),
    (3389,  5),
    (8080,  5),
    (53,    5),
    (21,    3),
    (25,    2),
]
PORTS, PORT_WEIGHTS = zip(*PORT_POOL)

# Threat status distribution targeting ~7% MALICIOUS, ~13% SUSPICIOUS
THREAT_STATUS_POOL: list[tuple[str, int]] = [
    ("CLEAN",      80),
    ("SUSPICIOUS", 13),
    ("MALICIOUS",   7),
]
STATUSES, STATUS_WEIGHTS = zip(*THREAT_STATUS_POOL)


def _random_internal_ip() -> str:
    """Return a random RFC-1918 IP address."""
    prefix = random.choice(INTERNAL_PREFIXES)
    return f"{prefix}{random.randint(1, 254)}.{random.randint(1, 254)}"


def _random_external_ip(status: str) -> str:
    """
    Return an external destination IP.
    MALICIOUS rows reuse IPs from the known-bad pool for realism.
    """
    if status == "MALICIOUS":
        return random.choice(MALICIOUS_IPS)
    return fake.ipv4_public()


def _random_timestamp(days_back: int = 30) -> datetime:
    """Return a random UTC timestamp within the last `days_back` days."""
    delta = timedelta(
        seconds=random.randint(0, days_back * 86_400)
    )
    return datetime.now(tz=timezone.utc) - delta


def generate_row() -> dict[str, Any]:
    """Generate a single synthetic network log row."""
    status: str = random.choices(STATUSES, weights=STATUS_WEIGHTS, k=1)[0]
    return {
        "log_id":              str(uuid.uuid4()),
        "timestamp":           _random_timestamp().isoformat(),
        "src_ip":              _random_internal_ip(),
        "dest_ip":             _random_external_ip(status),
        "dest_port":           random.choices(PORTS, weights=PORT_WEIGHTS, k=1)[0],
        "bytes":               random.randint(64, 10_485_760),  # 64 B – 10 MB
        "threat_intel_status": status,
    }


def ensure_table(client: bigquery.Client, table_ref: str) -> bigquery.Table:
    """
    Create the BigQuery table if it does not already exist.
    Returns the Table object.
    """
    try:
        table = client.get_table(table_ref)
        print(f"[INFO]  Table '{table_ref}' already exists — skipping creation.")
        return table
    except Exception:
        print(f"[INFO]  Table '{table_ref}' not found. Creating...")
        table = bigquery.Table(table_ref, schema=SCHEMA)
        table = client.create_table(table)
        print(f"[INFO]  Table '{table_ref}' created successfully.")
        return table


def upload_rows(
    client: bigquery.Client,
    table_ref: str,
    rows: list[dict[str, Any]],
    batch_size: int = 200,
) -> None:
    """
    Insert rows into BigQuery in batches using the streaming insert API.

    Args:
        client:     Authenticated BigQuery client.
        table_ref:  Fully-qualified table reference string.
        rows:       List of row dicts to insert.
        batch_size: Number of rows per streaming batch.
    """
    total = len(rows)
    inserted = 0

    for batch_start in range(0, total, batch_size):
        batch = rows[batch_start : batch_start + batch_size]
        errors = client.insert_rows_json(table_ref, batch)

        if errors:
            print(f"[ERROR] Errors on batch starting at row {batch_start}:")
            for err in errors:
                print(f"        {err}")
        else:
            inserted += len(batch)
            pct = (inserted / total) * 100
            print(f"[INFO]  Uploaded {inserted:>5}/{total} rows  ({pct:.1f}%)")


def print_summary(rows: list[dict[str, Any]]) -> None:
    """Print a quick distribution summary of the generated dataset."""
    from collections import Counter
    counts = Counter(r["threat_intel_status"] for r in rows)
    print("\n[INFO]  Threat status distribution:")
    for status in ("CLEAN", "SUSPICIOUS", "MALICIOUS"):
        n = counts.get(status, 0)
        print(f"        {status:<12} {n:>5} rows  ({n / len(rows) * 100:.1f}%)")


def main() -> None:
    """Entry point: generate mock data and upload to BigQuery."""
    print("=" * 60)
    print(" Project Argus — Mock Network Log Generator")
    print("=" * 60)

    # Resolve project
    client = bigquery.Client(project=PROJECT_ID if PROJECT_ID else None)
    resolved_project = client.project
    table_ref = f"{resolved_project}.{DATASET_ID}.{TABLE_ID}"

    print(f"[INFO]  Project  : {resolved_project}")
    print(f"[INFO]  Target   : {table_ref}")
    print(f"[INFO]  Row count: {ROW_COUNT}")
    print()

    # Ensure table exists
    ensure_table(client, table_ref)

    # Generate rows
    print(f"\n[INFO]  Generating {ROW_COUNT} synthetic network log rows...")
    rows: list[dict[str, Any]] = [generate_row() for _ in range(ROW_COUNT)]
    print_summary(rows)

    # Upload
    print(f"\n[INFO]  Uploading to BigQuery in batches...")
    upload_rows(client, table_ref, rows)

    print()
    print("=" * 60)
    print(f" Done. {ROW_COUNT} rows loaded into {table_ref}")
    print("=" * 60)


if __name__ == "__main__":
    main()
