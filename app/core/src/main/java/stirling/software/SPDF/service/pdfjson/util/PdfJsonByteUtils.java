package stirling.software.SPDF.service.pdfjson.util;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Stateless byte/stream helpers extracted from {@code PdfJsonConversionService} as part of
 * decomposing that ~7k-line god-class (roadmap C1). Behaviour is identical to the original methods;
 * only the location and the visibility (now public, for cross-package testing) changed.
 */
public final class PdfJsonByteUtils {

    private PdfJsonByteUtils() {}

    /**
     * Returns true when {@code value} is a control byte that should be stripped from decoded text.
     * NUL and C0 control characters are stripped, except tab (0x09), line feed (0x0A) and carriage
     * return (0x0D).
     */
    public static boolean isStrippedControlByte(byte value) {
        if (value == 0) {
            return true;
        }
        int unsigned = Byte.toUnsignedInt(value);
        if (unsigned <= 0x1F) {
            return !(unsigned == 0x09 || unsigned == 0x0A || unsigned == 0x0D);
        }
        return false;
    }

    /**
     * Functional accessor for {@code PDFont#readCode(InputStream)} so the bounded counting loop can
     * be exercised in isolation without instantiating a {@code PDFont}.
     */
    @FunctionalInterface
    public interface CodeReader {
        int readCode(InputStream stream) throws IOException;
    }

    /**
     * Count how many codes the supplied {@code reader} can extract from {@code inputStream}, with
     * two safety nets that PDFBox's raw {@code PDFont#readCode(InputStream)} loop lacks:
     *
     * <ol>
     *   <li>Stop when the stream is empty (a corrupt CMap can otherwise loop forever returning
     *       successfully-matched zero-bytes from an exhausted {@link ByteArrayInputStream}).
     *   <li>Stop when a {@code readCode} call did not consume any bytes, even if it returned a
     *       non-{@code -1} value.
     * </ol>
     *
     * <p>Both conditions were observed in the wild on round-tripped fallback fonts where the
     * embedded ToUnicode CMap matched 0x00 sequences, hanging the JSON&rarr;PDF rebuild.
     */
    public static int countCodesProtected(ByteArrayInputStream inputStream, CodeReader reader)
            throws IOException {
        int count = 0;
        int previousAvailable = inputStream.available();
        while (previousAvailable > 0) {
            int code = reader.readCode(inputStream);
            if (code == -1) {
                break;
            }
            int currentAvailable = inputStream.available();
            if (currentAvailable >= previousAvailable) {
                // No progress made; break to avoid infinite loop on corrupt CMaps.
                break;
            }
            count++;
            previousAvailable = currentAvailable;
        }
        return count;
    }
}
