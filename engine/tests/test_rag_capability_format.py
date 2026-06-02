"""Tests for the pure static formatters on RagCapability.

`_format_results` renders vector-search hits into the numbered, metadata-annotated block the model
reads (1-indexed, `unknown`/`?` fallbacks for missing source/chunk, 3-dp relevance, `\\n\\n---\\n\\n`
separators). `_static_instructions_text` builds the knowledge-base tool instructions listing the
available collections. Both are static, so they're exercised directly on the class.
"""

from __future__ import annotations

from stirling.documents.rag_capability import RagCapability
from stirling.documents.store import Document, SearchResult
from stirling.models import FileId


def _result(text: str, source: str, chunk: str, score: float) -> SearchResult:
    return SearchResult(
        document=Document(
            id="x", text=text, metadata={"source": source, "chunk_index": chunk}
        ),
        score=score,
    )


def test_format_single_result_with_full_metadata() -> None:
    out = RagCapability._format_results([_result("Body text", "a.pdf", "3", 0.987)])
    assert out == "[Result 1 | source: a.pdf, chunk: 3, relevance: 0.987]\nBody text"


def test_format_falls_back_to_unknown_and_question_mark() -> None:
    # Empty metadata -> source "unknown", chunk "?".
    result = SearchResult(document=Document(id="1", text="X", metadata={}), score=0.5)
    out = RagCapability._format_results([result])
    assert out == "[Result 1 | source: unknown, chunk: ?, relevance: 0.500]\nX"


def test_format_numbers_results_and_joins_with_separator() -> None:
    out = RagCapability._format_results(
        [
            _result("First", "a", "0", 0.9),
            _result("Second", "b", "1", 0.8),
        ]
    )
    assert out == (
        "[Result 1 | source: a, chunk: 0, relevance: 0.900]\nFirst"
        "\n\n---\n\n"
        "[Result 2 | source: b, chunk: 1, relevance: 0.800]\nSecond"
    )


def test_format_rounds_score_to_three_decimals() -> None:
    out = RagCapability._format_results([_result("t", "s", "0", 0.12349)])
    assert "relevance: 0.123]" in out
    out_one = RagCapability._format_results([_result("t", "s", "0", 1.0)])
    assert "relevance: 1.000]" in out_one


def test_format_empty_results_is_empty_string() -> None:
    assert RagCapability._format_results([]) == ""


def test_static_instructions_lists_collections_and_tool_name() -> None:
    text = RagCapability._static_instructions_text(
        [FileId("colA"), FileId("colB")]
    )
    assert "collections: colA, colB" in text
    assert "search_knowledge" in text


def test_static_instructions_with_single_collection() -> None:
    text = RagCapability._static_instructions_text([FileId("only")])
    assert "collections: only" in text
