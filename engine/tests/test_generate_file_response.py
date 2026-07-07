"""Tests for GenerateFileResponse — focused on the security-relevant filename guard.

The ``filename`` field is constrained to ``^[^/\\]+$`` (one or more characters, none of them a
path separator) so a model-generated output filename cannot smuggle a path-traversal sequence
("../", a subdirectory, or an absolute path) into Java's file packaging. These tests pin that
guard plus the response defaults. Backslash cases are built from ``chr(92)`` to keep the source
free of ambiguous backslash escapes.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from stirling.contracts.common import GenerateFileResponse, WorkflowOutcome

_BS = chr(92)  # a single backslash

_REJECTED_FILENAMES = [
    "../etc/passwd",  # parent-dir traversal via forward slash
    "sub/dir/file.pdf",  # nested forward-slash path
    "a/b",
    "/abs.pdf",  # leading slash (absolute-ish)
    "",  # empty: the pattern requires >= 1 non-separator char
    "a" + _BS + "b",  # backslash separator
    ".." + _BS + "win" + _BS + "x",  # backslash traversal
]

_ACCEPTED_FILENAMES = [
    "report.pdf",
    "my file with spaces.pdf",
    "résumé.docx",  # unicode, no separators
    "a.b.c.tar.gz",
    ".hiddenfile",
]


def test_valid_response_round_trips_with_defaults() -> None:
    resp = GenerateFileResponse(content="hello world", filename="report.pdf")
    assert resp.outcome == WorkflowOutcome.GENERATE_FILE
    assert resp.content == "hello world"
    assert resp.filename == "report.pdf"
    assert resp.summary is None


def test_summary_is_optional_but_settable() -> None:
    resp = GenerateFileResponse(content="c", filename="a.txt", summary="done")
    assert resp.summary == "done"


@pytest.mark.parametrize("filename", _REJECTED_FILENAMES)
def test_filename_with_path_separators_is_rejected(filename: str) -> None:
    with pytest.raises(ValidationError):
        GenerateFileResponse(content="c", filename=filename)


@pytest.mark.parametrize("filename", _ACCEPTED_FILENAMES)
def test_filename_without_separators_is_accepted(filename: str) -> None:
    resp = GenerateFileResponse(content="c", filename=filename)
    assert resp.filename == filename
