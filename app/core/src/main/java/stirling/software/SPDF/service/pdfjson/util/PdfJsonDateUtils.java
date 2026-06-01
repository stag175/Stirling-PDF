package stirling.software.SPDF.service.pdfjson.util;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Calendar;
import java.util.Optional;
import java.util.TimeZone;

import lombok.extern.slf4j.Slf4j;

/**
 * Stateless date/time conversion helpers extracted from {@code PdfJsonConversionService} as part of
 * decomposing that ~7k-line god-class (roadmap C1). These bridge PDF metadata dates (ISO-8601
 * strings) and {@link Calendar}/{@link Instant}. Behaviour is identical to the original private
 * methods; only the location (and the logger category for parse warnings) changed.
 */
@Slf4j
public final class PdfJsonDateUtils {

    private PdfJsonDateUtils() {}

    /**
     * Formats a {@link Calendar} as an ISO-8601 instant string, or {@code null} if the input is
     * null.
     */
    public static String formatCalendar(Calendar calendar) {
        if (calendar == null) {
            return null;
        }
        return calendar.toInstant().toString();
    }

    /**
     * Parses an ISO-8601 instant string into an {@link Instant}, returning empty (and logging a
     * warning) when the value is unparseable.
     */
    public static Optional<Instant> parseInstant(String value) {
        try {
            return Optional.of(Instant.parse(value));
        } catch (DateTimeParseException ex) {
            log.warn("Failed to parse instant '{}': {}", value, ex.getMessage());
            return Optional.empty();
        }
    }

    /** Converts an {@link Instant} to a UTC {@link Calendar}. */
    public static Calendar toCalendar(Instant instant) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        calendar.setTimeInMillis(instant.toEpochMilli());
        return calendar;
    }
}
