"""Tests for pure utility functions in app.tools."""

import datetime

from app.tools import _human_bytes, _make_json_safe


class TestHumanBytes:
    def test_bytes(self):
        assert _human_bytes(0) == "0 B"
        assert _human_bytes(512) == "512 B"
        assert _human_bytes(1023) == "1023 B"

    def test_kilobytes(self):
        assert _human_bytes(1024) == "1 KB"
        assert _human_bytes(1536) == "2 KB"
        assert _human_bytes(500_000) == "488 KB"

    def test_megabytes(self):
        assert _human_bytes(1_048_576) == "1 MB"
        assert _human_bytes(6_000_000) == "6 MB"

    def test_gigabytes(self):
        assert _human_bytes(1_073_741_824) == "1 GB"

    def test_terabytes(self):
        assert _human_bytes(1_099_511_627_776) == "1 TB"


class TestMakeJsonSafe:
    def test_primitives_unchanged(self):
        assert _make_json_safe("hello") == "hello"
        assert _make_json_safe(42) == 42
        assert _make_json_safe(3.14) == 3.14
        assert _make_json_safe(True) is True
        assert _make_json_safe(None) is None

    def test_dict_passthrough(self):
        data = {"key": "value", "count": 5}
        assert _make_json_safe(data) == data

    def test_list_passthrough(self):
        data = [1, "two", 3.0]
        assert _make_json_safe(data) == data

    def test_datetime_converted(self):
        dt = datetime.datetime(2025, 1, 15, 12, 30, 0, tzinfo=datetime.timezone.utc)
        assert _make_json_safe(dt) == "2025-01-15T12:30:00+00:00"

    def test_date_converted(self):
        d = datetime.date(2025, 6, 1)
        assert _make_json_safe(d) == "2025-06-01"

    def test_nested_datetime_in_dict(self):
        data = {"name": "incident", "created_at": datetime.datetime(2025, 3, 1)}
        result = _make_json_safe(data)
        assert result["name"] == "incident"
        assert isinstance(result["created_at"], str)

    def test_nested_datetime_in_list(self):
        data = [datetime.datetime(2025, 1, 1), "plain"]
        result = _make_json_safe(data)
        assert result[0] == "2025-01-01T00:00:00"
        assert result[1] == "plain"

    def test_tuple_becomes_list(self):
        data = (1, 2, datetime.date(2025, 1, 1))
        result = _make_json_safe(data)
        assert isinstance(result, list)
        assert result[2] == "2025-01-01"

    def test_non_serializable_becomes_str(self):
        obj = object()
        result = _make_json_safe(obj)
        assert isinstance(result, str)
