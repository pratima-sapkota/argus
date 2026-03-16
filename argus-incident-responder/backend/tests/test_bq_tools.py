"""Tests for BigQuery-backed tool functions in app.tools."""

from unittest.mock import MagicMock

import pytest

from app.tools import (
    filter_network_logs,
    get_high_severity_threats,
    get_network_summary,
    get_traffic_by_port,
)


def _fake_bq_rows(rows: list[dict]):
    """Build a mock that mimics bigquery result iteration."""
    mock_result = MagicMock()
    mock_result.__iter__ = lambda self: iter(rows)
    mock_job = MagicMock()
    mock_job.result.return_value = mock_result
    return mock_job


class TestGetHighSeverityThreats:
    def test_returns_rows(self, mock_bq):
        rows = [
            {"log_id": "L1", "src_ip": "10.0.0.1", "dest_ip": "1.2.3.4", "dest_port": 443, "timestamp": "2025-01-01", "bytes": 1024, "threat_intel_status": "MALICIOUS"},
        ]
        mock_bq.query.return_value = _fake_bq_rows(rows)

        result = get_high_severity_threats(limit=5)

        assert len(result) == 1
        assert result[0]["threat_intel_status"] == "MALICIOUS"
        mock_bq.query.assert_called_once()

    def test_returns_empty(self, mock_bq):
        mock_bq.query.return_value = _fake_bq_rows([])

        result = get_high_severity_threats()

        assert result == []

    def test_error_returns_error_dict(self, mock_bq):
        from tests.conftest import FakeGoogleCloudError
        mock_bq.query.side_effect = FakeGoogleCloudError("BQ down")

        result = get_high_severity_threats()

        assert len(result) == 1
        assert "error" in result[0]


class TestFilterNetworkLogs:
    def test_no_filters(self, mock_bq):
        rows = [{"log_id": "L1", "src_ip": "10.0.0.1"}]
        mock_bq.query.return_value = _fake_bq_rows(rows)

        result = filter_network_logs()

        assert len(result) == 1

    def test_with_all_filters(self, mock_bq):
        mock_bq.query.return_value = _fake_bq_rows([])

        result = filter_network_logs(
            src_ip="10.0.0.1",
            dest_ip="1.2.3.4",
            dest_port=443,
            threat_intel_status="MALICIOUS",
            min_bytes=100,
            max_bytes=10000,
            limit=5,
        )

        assert result == []
        call_args = mock_bq.query.call_args
        query_str = call_args[0][0]
        assert "src_ip = @src_ip" in query_str
        assert "dest_ip = @dest_ip" in query_str
        assert "dest_port = @dest_port" in query_str
        assert "bytes >= @min_bytes" in query_str
        assert "bytes <= @max_bytes" in query_str


class TestGetTrafficByPort:
    def test_returns_rows(self, mock_bq):
        rows = [{"log_id": "L1", "src_ip": "10.0.0.1", "threat_intel_status": "CLEAN", "timestamp": "2025-01-01", "bytes": 512}]
        mock_bq.query.return_value = _fake_bq_rows(rows)

        result = get_traffic_by_port(port=443)

        assert len(result) == 1


class TestGetNetworkSummary:
    def test_aggregates_three_queries(self, mock_bq):
        dist_rows = [{"status": "MALICIOUS", "count": 10}, {"status": "CLEAN", "count": 90}]
        port_rows = [{"port": 443, "total_hits": 50, "total_bytes": 100000}]
        ip_rows = [{"src_ip": "10.0.0.1", "total_hits": 30, "malicious_hits": 5}]

        mock_bq.query.side_effect = [
            _fake_bq_rows(dist_rows),
            _fake_bq_rows(port_rows),
            _fake_bq_rows(ip_rows),
        ]

        result = get_network_summary()

        assert len(result) == 1
        summary = result[0]
        assert summary["total_events"] == 100
        assert len(summary["threat_distribution"]) == 2
        assert len(summary["top_ports"]) == 1
        assert len(summary["top_source_ips"]) == 1
        assert mock_bq.query.call_count == 3
