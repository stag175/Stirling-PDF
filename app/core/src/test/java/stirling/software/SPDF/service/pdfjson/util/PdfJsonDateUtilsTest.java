package stirling.software.SPDF.service.pdfjson.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.Calendar;
import java.util.Optional;
import java.util.TimeZone;

import org.junit.jupiter.api.Test;

/** Unit tests for the date/time helpers extracted from PdfJsonConversionService. */
class PdfJsonDateUtilsTest {

    @Test
    void formatCalendar_null_returnsNull() {
        assertNull(PdfJsonDateUtils.formatCalendar(null));
    }

    @Test
    void formatCalendar_epoch_returnsIsoInstant() {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        cal.setTimeInMillis(0L);
        assertEquals("1970-01-01T00:00:00Z", PdfJsonDateUtils.formatCalendar(cal));
    }

    @Test
    void formatCalendar_knownInstant_roundTripsString() {
        Calendar cal = PdfJsonDateUtils.toCalendar(Instant.parse("2021-06-15T12:30:00Z"));
        assertEquals("2021-06-15T12:30:00Z", PdfJsonDateUtils.formatCalendar(cal));
    }

    @Test
    void parseInstant_valid_returnsInstant() {
        Optional<Instant> parsed = PdfJsonDateUtils.parseInstant("2020-01-02T03:04:05Z");
        assertTrue(parsed.isPresent());
        assertEquals(Instant.parse("2020-01-02T03:04:05Z"), parsed.get());
    }

    @Test
    void parseInstant_unparseable_returnsEmpty() {
        assertTrue(PdfJsonDateUtils.parseInstant("not-a-real-date").isEmpty());
    }

    @Test
    void parseInstant_emptyString_returnsEmpty() {
        assertTrue(PdfJsonDateUtils.parseInstant("").isEmpty());
    }

    @Test
    void toCalendar_setsUtcEpochMillis() {
        Instant instant = Instant.parse("1999-12-31T23:59:58Z");
        Calendar cal = PdfJsonDateUtils.toCalendar(instant);

        assertEquals(instant.toEpochMilli(), cal.getTimeInMillis());
        assertEquals("UTC", cal.getTimeZone().getID());
    }

    @Test
    void roundTrip_parseToCalendarFormat_preservesValue() {
        String iso = "2024-02-29T08:15:30Z"; // leap-day, whole seconds
        String result =
                PdfJsonDateUtils.parseInstant(iso)
                        .map(PdfJsonDateUtils::toCalendar)
                        .map(PdfJsonDateUtils::formatCalendar)
                        .orElse(null);
        assertEquals(iso, result);
    }
}
