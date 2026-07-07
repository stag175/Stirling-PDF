"""Tests for the shared page-text helpers (stirling.agents._page_text)."""

from __future__ import annotations

from stirling.agents._page_text import (
    format_page_text,
    get_extracted_text_artifact,
    has_page_text,
)
from stirling.contracts import (
    ExtractedFileText,
    ExtractedTextArtifact,
    OrchestratorRequest,
    PdfTextSelection,
)


def _sel(text: str, page: int | None = 1) -> PdfTextSelection:
    return PdfTextSelection(page_number=page, text=text)


def _ftext(name: str, *sels: PdfTextSelection) -> ExtractedFileText:
    return ExtractedFileText(file_name=name, pages=list(sels))


class TestHasPageText:
    def test_empty_list_has_no_text(self) -> None:
        assert has_page_text([]) is False

    def test_file_with_no_pages_has_no_text(self) -> None:
        assert has_page_text([_ftext("a.pdf")]) is False

    def test_blank_only_selection_has_no_text(self) -> None:
        assert has_page_text([_ftext("a.pdf", _sel("   \n\t"))]) is False

    def test_any_non_blank_selection_counts(self) -> None:
        assert has_page_text([_ftext("a.pdf", _sel("   "), _sel("hi"))]) is True


class TestFormatPageText:
    def test_returns_default_empty_marker_when_no_text(self) -> None:
        assert format_page_text([]) == "None"

    def test_returns_custom_empty_marker(self) -> None:
        assert format_page_text([_ftext("a.pdf")], empty="EMPTY") == "EMPTY"

    def test_formats_single_selection(self) -> None:
        assert (
            format_page_text([_ftext("a.pdf", _sel("hello", 1))])
            == "[File: a.pdf, Page 1]\nhello"
        )

    def test_missing_page_number_renders_question_mark(self) -> None:
        assert (
            format_page_text([_ftext("a.pdf", _sel("hello", None))])
            == "[File: a.pdf, Page ?]\nhello"
        )

    def test_joins_multiple_sections_with_blank_line(self) -> None:
        result = format_page_text(
            [_ftext("a.pdf", _sel("one", 1)), _ftext("b.pdf", _sel("two", 2))]
        )
        assert result == "[File: a.pdf, Page 1]\none\n\n[File: b.pdf, Page 2]\ntwo"


class TestGetExtractedTextArtifact:
    def test_returns_none_when_no_artifacts(self) -> None:
        request = OrchestratorRequest(user_message="hi")
        assert get_extracted_text_artifact(request) is None

    def test_returns_the_extracted_text_artifact(self) -> None:
        artifact = ExtractedTextArtifact(files=[_ftext("a.pdf", _sel("x"))])
        request = OrchestratorRequest(user_message="hi", artifacts=[artifact])
        assert get_extracted_text_artifact(request) is artifact

    def test_returns_the_first_extracted_text_artifact(self) -> None:
        first = ExtractedTextArtifact(files=[_ftext("a.pdf", _sel("1"))])
        second = ExtractedTextArtifact(files=[_ftext("b.pdf", _sel("2"))])
        request = OrchestratorRequest(user_message="hi", artifacts=[first, second])
        assert get_extracted_text_artifact(request) is first
