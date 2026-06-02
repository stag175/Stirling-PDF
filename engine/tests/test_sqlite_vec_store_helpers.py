"""Tests for the pure static helpers on SqliteVecStore.

`_sanitize_table_name` is the SQL-identifier safety guard: a caller-supplied collection name is
folded to ``vec_<only [A-Za-z0-9_]>`` before being interpolated into table DDL/DML, so quotes,
semicolons, spaces, and unicode can't break out of the identifier. `_normalize` L2-normalizes an
embedding, returning the vector unchanged when its norm is 0 (avoiding division by zero).
"""

from __future__ import annotations

import math

import pytest

from stirling.documents.sqlite_vec_store import SqliteVecStore


class TestSanitizeTableName:
    @pytest.mark.parametrize(
        ("collection", "expected"),
        [
            ("docs", "vec_docs"),
            ("123", "vec_123"),
            ("with_underscores", "vec_with_underscores"),
            ("my-collection", "vec_my_collection"),  # hyphen -> _
            ("a b.c", "vec_a_b_c"),  # space and dot -> _
            ("", "vec_"),  # empty collection
            ("café", "vec_caf_"),  # non-ASCII -> _
        ],
    )
    def test_sanitizes_to_vec_prefixed_identifier(
        self, collection: str, expected: str
    ) -> None:
        assert SqliteVecStore._sanitize_table_name(collection) == expected

    def test_sql_injection_characters_are_neutralised(self) -> None:
        out = SqliteVecStore._sanitize_table_name('x"; DROP TABLE t;--')
        assert out.startswith("vec_")
        # Everything after the prefix is a safe identifier char => can't break out.
        assert all(ch.isalnum() or ch == "_" for ch in out)


class TestNormalize:
    def test_normalizes_3_4_to_unit_vector(self) -> None:
        assert SqliteVecStore._normalize([3.0, 4.0]) == pytest.approx([0.6, 0.8])

    def test_zero_vector_is_returned_unchanged(self) -> None:
        # norm == 0 guard: avoid division by zero, return the (zero) vector as-is.
        assert SqliteVecStore._normalize([0.0, 0.0]) == [0.0, 0.0]

    def test_empty_vector_is_returned_unchanged(self) -> None:
        assert SqliteVecStore._normalize([]) == []

    def test_already_unit_vector_is_preserved(self) -> None:
        assert SqliteVecStore._normalize([1.0, 0.0, 0.0]) == pytest.approx(
            [1.0, 0.0, 0.0]
        )

    def test_result_has_unit_l2_norm(self) -> None:
        result = SqliteVecStore._normalize([2.0, 3.0, 6.0])  # norm = 7
        assert math.sqrt(sum(x * x for x in result)) == pytest.approx(1.0)
