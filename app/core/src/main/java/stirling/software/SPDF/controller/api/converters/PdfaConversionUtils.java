package stirling.software.SPDF.controller.api.converters;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Pure, stateless helpers extracted from {@link ConvertPDFToPDFA} (roadmap C2 — thinning the
 * ~2,565-LoC controller). None of these touch PDFBox, IO, or Spring, so they are unit-tested
 * directly (see {@code PdfaConversionUtilsTest}) instead of via reflection on the controller.
 */
public final class PdfaConversionUtils {

    private PdfaConversionUtils() {}

    private static final Pattern NON_PRINTABLE_ASCII = Pattern.compile("[^\\x20-\\x7E]");

    static final String DEFAULT_MIME_TYPE = "application/octet-stream";

    private static final Map<String, String> MIME_TYPE_MAP =
            Map.ofEntries(
                    Map.entry(".xml", "application/xml"),
                    Map.entry(".json", "application/json"),
                    Map.entry(".txt", "text/plain"),
                    Map.entry(".csv", "text/csv"),
                    Map.entry(".pdf", "application/pdf"),
                    Map.entry(".png", "image/png"),
                    Map.entry(".jpg", "image/jpeg"),
                    Map.entry(".jpeg", "image/jpeg"),
                    Map.entry(".gif", "image/gif"),
                    Map.entry(".html", "text/html"),
                    Map.entry(".htm", "text/html"),
                    Map.entry(".zip", "application/zip"),
                    Map.entry(".doc", "application/msword"),
                    Map.entry(
                            ".docx",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                    Map.entry(".xls", "application/vnd.ms-excel"),
                    Map.entry(
                            ".xlsx",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                    Map.entry(".ppt", "application/vnd.ms-powerpoint"),
                    Map.entry(
                            ".pptx",
                            "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
                    Map.entry(".svg", "image/svg+xml"),
                    Map.entry(".webp", "image/webp"),
                    Map.entry(".mp3", "audio/mpeg"),
                    Map.entry(".mp4", "video/mp4"),
                    Map.entry(".wav", "audio/wav"),
                    Map.entry(".avi", "video/x-msvideo"),
                    Map.entry(".tar", "application/x-tar"),
                    Map.entry(".gz", "application/gzip"),
                    Map.entry(".rar", "application/vnd.rar"),
                    Map.entry(".7z", "application/x-7z-compressed"));

    /**
     * Count glyphs in a Type1/CFF {@code CharSet} string of the form {@code /g1/g2/g3...} (one
     * leading slash per glyph). {@code null}/empty -> 0.
     */
    public static int countGlyphs(String charSet) {
        if (charSet == null || charSet.isEmpty()) {
            return 0;
        }
        // CharSet format: /glyph1/glyph2/glyph3...
        return (int) charSet.chars().filter(c -> c == '/').count();
    }

    /**
     * Strip characters outside printable ASCII (0x20–0x7E) — used to sanitize custom metadata
     * values for PDF/A. {@code null} in -> {@code null} out (callers null-guard before invoking).
     */
    public static String stripNonPrintableAscii(String value) {
        if (value == null) {
            return null;
        }
        return NON_PRINTABLE_ASCII.matcher(value).replaceAll("");
    }

    /**
     * Map a filename's extension to a MIME type for PDF/A embedded-file (associated-file) metadata.
     * Unknown/blank/null -> {@link #DEFAULT_MIME_TYPE}.
     */
    public static String detectMimeTypeFromFilename(String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return DEFAULT_MIME_TYPE;
        }
        String lowerName = fileName.toLowerCase(Locale.ROOT);
        return MIME_TYPE_MAP.entrySet().stream()
                .filter(entry -> lowerName.endsWith(entry.getKey()))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElse(DEFAULT_MIME_TYPE);
    }
}
