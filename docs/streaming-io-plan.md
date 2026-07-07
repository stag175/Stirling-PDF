# Streaming I/O for large files — plan (roadmap C3)

> **C3**: "Replace whole-file `Files.readAllBytes`/`readAllLines` with streaming for the 100 GB+ goal."
>
> Grounded in `app/common/.../util/WebResponseUtils.java` and the ~15 `Files.readAllBytes(tempFile)`
> response call sites. The good news: **the streaming response infrastructure already exists** — the
> remaining work is converting the *buffering* callers, which is correctness-critical (a premature
> temp-file delete breaks the stream) and whose memory benefit must be validated with the F1 load harness.

## What already exists (verified)

`WebResponseUtils` already provides **streaming, file-backed** responses:
- `fileToWebResponse(Path tempFile, …)` → wraps the file in `ManagedTempFileResource`.
- `pdfFileToWebResponse(…)`, `zipFileToWebResponse(…)` → same family.
- `pdfDocToWebResponse(PDDocument, …)` (the `Resource` overload) — a synchronous equivalent of the old
  `StreamingResponseBody` path.

`ManagedTempFileResource extends FileSystemResource`: Spring's `ResourceHttpMessageConverter` calls
`getInputStream()` **once** and streams the bytes; a wrapping `ClosingInputStream` **deletes the backing
temp file when the stream is closed** (i.e. *after* Spring has finished writing the body). So the
file never has to be loaded into a `byte[]`, and cleanup is handled automatically.

The **buffering** path is the other half of the same util — `bytesToWebResponse(byte[]…)` /
`baosToWebResponse(ByteArrayOutputStream…)` / `multiPartFileToWebResponse` — used by callers that do
`byte[] out = Files.readAllBytes(tempOutput); return WebResponseUtils.bytesToWebResponse(out, …)`.

## The conversion (and its pitfall)

For each buffering call site of the form:
```java
byte[] bytes = Files.readAllBytes(tempOutput);   // whole file into heap
return WebResponseUtils.bytesToWebResponse(bytes, name);
// ... finally { Files.deleteIfExists(tempOutput); }
```
the streaming form is:
```java
return WebResponseUtils.fileToWebResponse(tempOutput, name, mediaType); // streams + auto-deletes on close
// and REMOVE the manual finally-delete of tempOutput
```

**Critical pitfall:** the manual `finally { Files.deleteIfExists(tempOutput); }` must be **removed** when
converting. With the buffering path it ran safely (the bytes were already in heap); with streaming it would
delete the file **before** Spring streams it, breaking the response. `ManagedTempFileResource` owns the
file's lifetime once handed off. Conversely, on an *error before* returning the resource, the file must
still be cleaned (so the deletion responsibility moves, it isn't dropped).

This correctness property **is** unit-testable here (no load rig needed): a test that drains the returned
`Resource.getInputStream()` fails if the temp file was deleted prematurely — see the existing
`drainBody(...)` pattern in `CropControllerTest`. The *memory* benefit (bounded heap at the 100 GB+ target)
is what needs the **F1 k6 harness** (`testing/load/api-load-test.js`) + heap profiling.

## Candidate call sites (`Files.readAllBytes(tempfile)` → response)

`ConvertEbookToPDFController`, `ConvertImgPDFController`, `ConvertPdfToVideoController`,
`ExtractImageScansController`, `MobileScannerController`, `ConvertPdfJsonController`, `ConvertPDFToPDFA`
(two), `GeneralUtils`-mediated paths, etc. Many sit behind **native tools** (Calibre/Ghostscript/ffmpeg),
so full end-to-end verification needs those tools; the response-handoff conversion + its drain test do not.

## Staged plan

1. **Add a streaming-handoff test helper** + convert ONE simple, native-tool-free buffering controller
   (e.g. a path that already has a real fixture) to `fileToWebResponse`, removing its manual finally-delete
   and adding a drain test that proves the file streams and is cleaned exactly once. This pins the pattern.
2. **Convert the remaining `readAllBytes(tempfile)` response sites** one at a time, each with a drain test;
   audit each `finally` block to move (not drop) cleanup responsibility to `ManagedTempFileResource`.
3. **Also replace input-side whole-file reads** where a stream suffices (e.g. hashing/scanning) with
   `Files.lines`/`BufferedInputStream` in try-with-resources.
4. **Validate memory** with the F1 harness at high concurrency + large inputs; confirm heap stays bounded
   (this is the actual 100 GB+ goal and needs the load rig).

**Net:** C3's infrastructure is already in place (`ManagedTempFileResource`); the work is a careful,
per-call-site handoff conversion (correctness-testable here via drain tests, memory-validated via F1) plus
the input-side stream conversions. The premature-delete pitfall is why this is staged + tested per site,
not a blind bulk find/replace.
