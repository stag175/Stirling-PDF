"""Tests for the pure Markdown-table repair helpers in the pdf_to_markdown agent."""

from __future__ import annotations

import pytest

from stirling.agents.pdf_to_markdown.agent import (
    _fix_markdown_tables,
    _is_sep_row,
    _merge_orphaned_table_rows,
    _remove_extra_separators,
)


class TestIsSepRow:
    @pytest.mark.parametrize(
        "line",
        ["| --- | --- |", "| :--- | ---: | :---: |", "|---|---|", "| - |"],
    )
    def test_separator_rows(self, line: str) -> None:
        assert _is_sep_row(line) is True

    @pytest.mark.parametrize(
        "line",
        [
            "| a | b |",  # data row
            "| --- | data |",  # mixed
            "no pipe here",  # not a pipe row
            "|  |",  # no non-empty cells
            "",  # empty
        ],
    )
    def test_non_separator_rows(self, line: str) -> None:
        assert _is_sep_row(line) is False


class TestFixMarkdownTables:
    def test_removes_blank_line_between_table_rows(self) -> None:
        assert _fix_markdown_tables("| a |\n\n| b |") == "| a |\n| b |"

    def test_keeps_blank_line_before_prose(self) -> None:
        # blank not between two table rows -> preserved
        assert _fix_markdown_tables("| a |\n\ntext") == "| a |\n\ntext"

    def test_leaves_non_table_content_unchanged(self) -> None:
        assert _fix_markdown_tables("hello\n\nworld") == "hello\n\nworld"


class TestRemoveExtraSeparators:
    def test_keeps_only_first_separator_in_a_block(self) -> None:
        md = "| h |\n| --- |\n| --- |\n| d |"
        assert _remove_extra_separators(md) == "| h |\n| --- |\n| d |"

    def test_separators_in_distinct_blocks_are_both_kept(self) -> None:
        md = "| h1 |\n| --- |\nprose\n| h2 |\n| --- |"
        assert _remove_extra_separators(md) == md


class TestMergeOrphanedTableRows:
    def test_merges_orphan_block_and_drops_intervening_prose(self) -> None:
        md = "| h |\n| --- |\n| a |\n\nSome prose\n| b |"
        assert (
            _merge_orphaned_table_rows(md) == "| h |\n| --- |\n| a |\n| b |"
        )

    def test_orphan_without_a_preceding_table_is_left_alone(self) -> None:
        md = "intro\n| x |\n| y |"
        assert _merge_orphaned_table_rows(md) == md

    def test_well_formed_table_is_unchanged(self) -> None:
        md = "| h |\n| --- |\n| a |"
        assert _merge_orphaned_table_rows(md) == md
