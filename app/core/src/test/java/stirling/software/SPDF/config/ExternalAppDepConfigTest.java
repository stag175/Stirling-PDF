package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.configuration.RuntimePathConfig;

@ExtendWith(MockitoExtension.class)
class ExternalAppDepConfigTest {

    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private RuntimePathConfig runtimePathConfig;

    private ExternalAppDepConfig config;

    @BeforeEach
    void setUp() {
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/custom/weasyprint");
        when(runtimePathConfig.getUnoConvertPath()).thenReturn("/custom/unoconvert");
        when(runtimePathConfig.getCalibrePath()).thenReturn("/custom/calibre");
        when(runtimePathConfig.getOcrMyPdfPath()).thenReturn("/custom/ocrmypdf");
        lenient()
                .when(endpointConfiguration.getEndpointsForGroup(anyString()))
                .thenReturn(Set.of());

        config = new ExternalAppDepConfig(endpointConfiguration, runtimePathConfig);
    }

    @Test
    void commandToGroupMappingIncludesRuntimePaths() throws Exception {
        Map<String, List<String>> mapping = config.commandToGroupMapping;

        assertEquals(List.of("Weasyprint"), mapping.get("/custom/weasyprint"));
        assertEquals(List.of("Unoconvert"), mapping.get("/custom/unoconvert"));
        assertEquals(List.of("Calibre"), mapping.get("/custom/calibre"));
        assertEquals(List.of("OCRmyPDF"), mapping.get("/custom/ocrmypdf"));
        assertEquals(List.of("Ghostscript"), mapping.get("gs"));
    }

    @Test
    void getAffectedFeaturesFormatsEndpoints() throws Exception {
        Set<String> endpoints = new LinkedHashSet<>(List.of("pdf-to-html", "img-extract"));
        when(endpointConfiguration.getEndpointsForGroup("Ghostscript")).thenReturn(endpoints);

        List<String> features = config.getAffectedFeatures("Ghostscript");

        assertEquals(List.of("PDF To Html", "Image Extract"), features);
    }

    @Test
    void formatEndpointAsFeatureConvertsNames() throws Exception {
        String formatted = config.formatEndpointAsFeature("pdf-img-extract");

        assertEquals("PDF Image Extract", formatted);
    }

    @Test
    void capitalizeWordHandlesSpecialCases() throws Exception {
        String pdf = config.capitalizeWord("pdf");
        String mixed = config.capitalizeWord("tEsT");
        String empty = config.capitalizeWord("");

        assertEquals("PDF", pdf);
        assertEquals("Test", mixed);
        assertEquals("", empty);
    }

    @Test
    void isWeasyprintMatchesConfiguredCommands() throws Exception {
        boolean directMatch = config.isWeasyprint("/custom/weasyprint");
        boolean nameContains = config.isWeasyprint("/usr/bin/weasyprint-cli");
        boolean differentCommand = config.isWeasyprint("qpdf");

        assertTrue(directMatch);
        assertTrue(nameContains);
        assertFalse(differentCommand);
    }

    @Test
    void versionComparisonHandlesDifferentFormats() {
        ExternalAppDepConfig.Version required = new ExternalAppDepConfig.Version("58");
        ExternalAppDepConfig.Version installed = new ExternalAppDepConfig.Version("57.9.2");
        ExternalAppDepConfig.Version beta = new ExternalAppDepConfig.Version("58.beta");

        assertTrue(installed.compareTo(required) < 0);
        assertEquals(0, beta.compareTo(required));
        assertEquals("58.0.0", beta.toString());
    }
}
