package stirling.software.SPDF.controller.api.security;

import java.net.URI;
import java.util.Locale;

/**
 * Pure Time-Stamping-Authority (TSA) URL validation/normalization extracted from {@link
 * TimestampController} so the security-relevant allow-list logic can be unit-tested directly.
 * Behaviour is identical to the original private methods.
 *
 * <p>{@link #normalizeTsaUrl(String)} is used on both the configured allow-list entries and the
 * requested URL before an {@code allow-list.contains(...)} check, so any change here affects which
 * TSA endpoints are permitted — hence it is pinned by tests.
 */
public final class TsaUrlUtils {

    private TsaUrlUtils() {}

    /** True only for {@code http://} or {@code https://} URLs (case-insensitive, no trimming). */
    public static boolean isValidTsaUrlProtocol(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    /**
     * Canonicalizes a URL to {@code scheme://host[:port]path} with scheme and host lower-cased
     * (path case preserved) for stable allow-list comparison. A URL that cannot be parsed falls
     * back to its lower-cased form.
     */
    public static String normalizeTsaUrl(String url) {
        try {
            URI uri = URI.create(url.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            String path = uri.getPath() == null ? "" : uri.getPath();
            return scheme + "://" + host + (port == -1 ? "" : ":" + port) + path;
        } catch (Exception e) {
            return url.toLowerCase(Locale.ROOT);
        }
    }
}
