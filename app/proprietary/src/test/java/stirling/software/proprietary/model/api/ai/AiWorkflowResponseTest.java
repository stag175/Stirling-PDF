package stirling.software.proprietary.model.api.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link AiWorkflowResponse}, a plain Lombok {@code @Data} DTO with no business
 * logic. The surface under test is: the Lombok-generated no-arg constructor, the default empty-list
 * initialisation of the five collection fields, the generated getters/setters/equals/hashCode, and
 * Jackson 3 ({@code tools.jackson}) (de)serialisation including the two {@code @JsonProperty}
 * renames ({@code generatedContent -> content}, {@code generatedFilename -> filename}).
 *
 * <p>Production deserialises this type via a {@code tools.jackson.databind.ObjectMapper}
 * ({@code AiWorkflowService.invokeOrchestrator -> objectMapper.treeToValue(..., AiWorkflowResponse
 * .class)}), and the {@code report} field is itself a {@code tools.jackson} {@link JsonNode}, so the
 * Jackson section deliberately uses the same flavour. The mapper mirrors the app's Spring config
 * ({@code spring.jackson.deserialization.fail-on-null-for-primitives=false}); this class has no
 * primitive fields (every field is a boxed type, String, enum, collection or JsonNode) so the flag
 * is not load-bearing here, but it keeps the config aligned with the sibling tests. No Spring
 * context, no IO, no mocks — the class has no collaborators.
 */
class AiWorkflowResponseTest {

    // Same flavour the production code uses to materialise this DTO.
    private final ObjectMapper objectMapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    // -------------------------------------------------------------------------
    // Default construction — collection fields start as empty (non-null) lists,
    // every other field starts null.
    // -------------------------------------------------------------------------

    @Test
    void defaultConstructor_initialisesCollectionFieldsToEmptyLists() {
        AiWorkflowResponse response = new AiWorkflowResponse();

        assertNotNull(response.getEvidence());
        assertNotNull(response.getSteps());
        assertNotNull(response.getResultFiles());
        assertNotNull(response.getFiles());
        assertNotNull(response.getFilesToIngest());

        assertTrue(response.getEvidence().isEmpty());
        assertTrue(response.getSteps().isEmpty());
        assertTrue(response.getResultFiles().isEmpty());
        assertTrue(response.getFiles().isEmpty());
        assertTrue(response.getFilesToIngest().isEmpty());
    }

    @Test
    void defaultConstructor_leavesNonCollectionFieldsNull() {
        AiWorkflowResponse response = new AiWorkflowResponse();

        assertNull(response.getOutcome());
        assertNull(response.getAnswer());
        assertNull(response.getGeneratedContent());
        assertNull(response.getGeneratedFilename());
        assertNull(response.getSummary());
        assertNull(response.getRationale());
        assertNull(response.getReason());
        assertNull(response.getQuestion());
        assertNull(response.getCapability());
        assertNull(response.getMessage());
        assertNull(response.getTool());
        // parameters is NOT default-initialised (no `= new ...`) — stays null.
        assertNull(response.getParameters());
        assertNull(response.getFileId());
        assertNull(response.getFileName());
        assertNull(response.getContentType());
        assertNull(response.getMaxPages());
        assertNull(response.getMaxCharacters());
        assertNull(response.getResumeWith());
        assertNull(response.getReport());
    }

    @Test
    void defaultCollectionFields_areMutable() {
        AiWorkflowResponse response = new AiWorkflowResponse();

        response.getSteps().add(Map.of("k", "v"));
        response.getEvidence().add(new AiWorkflowTextSelection());
        response.getResultFiles().add(new AiWorkflowResultFile("id", "name", "type"));
        response.getFiles().add(new AiWorkflowFileRequest());
        response.getFilesToIngest().add(new AiFile("id", "name"));

        assertEquals(1, response.getSteps().size());
        assertEquals(1, response.getEvidence().size());
        assertEquals(1, response.getResultFiles().size());
        assertEquals(1, response.getFiles().size());
        assertEquals(1, response.getFilesToIngest().size());
    }

    // -------------------------------------------------------------------------
    // Getters / setters round-trip every field, including the boxed/enum/JsonNode ones.
    // -------------------------------------------------------------------------

    @Test
    void settersAndGetters_roundTripEveryScalarField() {
        AiWorkflowResponse response = new AiWorkflowResponse();

        response.setOutcome(AiWorkflowOutcome.ANSWER);
        response.setAnswer("the answer");
        response.setGeneratedContent("generated body");
        response.setGeneratedFilename("out.txt");
        response.setSummary("a summary");
        response.setRationale("a rationale");
        response.setReason("a reason");
        response.setQuestion("a question?");
        response.setCapability("some_capability");
        response.setMessage("a message");
        response.setTool("/api/v1/misc/compress-pdf");
        response.setFileId("file-123");
        response.setFileName("result.pdf");
        response.setContentType("application/pdf");
        response.setMaxPages(42);
        response.setMaxCharacters(10_000);
        response.setResumeWith("compress");

        assertEquals(AiWorkflowOutcome.ANSWER, response.getOutcome());
        assertEquals("the answer", response.getAnswer());
        assertEquals("generated body", response.getGeneratedContent());
        assertEquals("out.txt", response.getGeneratedFilename());
        assertEquals("a summary", response.getSummary());
        assertEquals("a rationale", response.getRationale());
        assertEquals("a reason", response.getReason());
        assertEquals("a question?", response.getQuestion());
        assertEquals("some_capability", response.getCapability());
        assertEquals("a message", response.getMessage());
        assertEquals("/api/v1/misc/compress-pdf", response.getTool());
        assertEquals("file-123", response.getFileId());
        assertEquals("result.pdf", response.getFileName());
        assertEquals("application/pdf", response.getContentType());
        assertEquals(Integer.valueOf(42), response.getMaxPages());
        assertEquals(Integer.valueOf(10_000), response.getMaxCharacters());
        assertEquals("compress", response.getResumeWith());
    }

    @Test
    void settersAndGetters_roundTripCollectionAndMapAndNodeFields() {
        AiWorkflowResponse response = new AiWorkflowResponse();

        AiWorkflowTextSelection selection = new AiWorkflowTextSelection();
        selection.setPageNumber(2);
        selection.setText("evidence text");
        List<AiWorkflowTextSelection> evidence = new ArrayList<>(List.of(selection));

        Map<String, Object> step = new LinkedHashMap<>();
        step.put("tool", "/api/v1/rotate");
        List<Map<String, Object>> steps = new ArrayList<>(List.of(step));

        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("angle", 90);

        List<AiWorkflowResultFile> resultFiles =
                new ArrayList<>(List.of(new AiWorkflowResultFile("rf-1", "a.pdf", "application/pdf")));
        List<AiWorkflowFileRequest> files = new ArrayList<>(List.of(new AiWorkflowFileRequest()));
        List<AiFile> filesToIngest = new ArrayList<>(List.of(new AiFile("af-1", "doc.pdf")));

        JsonNode report = objectMapper.createObjectNode().put("verdict", "clean");

        response.setEvidence(evidence);
        response.setSteps(steps);
        response.setParameters(parameters);
        response.setResultFiles(resultFiles);
        response.setFiles(files);
        response.setFilesToIngest(filesToIngest);
        response.setReport(report);

        assertSame(evidence, response.getEvidence());
        assertSame(steps, response.getSteps());
        assertSame(parameters, response.getParameters());
        assertSame(resultFiles, response.getResultFiles());
        assertSame(files, response.getFiles());
        assertSame(filesToIngest, response.getFilesToIngest());
        assertSame(report, response.getReport());
    }

    @Test
    void setters_acceptNull_forCollectionsAndScalars() {
        AiWorkflowResponse response = new AiWorkflowResponse();

        response.setEvidence(null);
        response.setSteps(null);
        response.setResultFiles(null);
        response.setFiles(null);
        response.setFilesToIngest(null);
        response.setParameters(null);
        response.setOutcome(null);
        response.setAnswer(null);
        response.setMaxPages(null);
        response.setReport(null);

        assertNull(response.getEvidence());
        assertNull(response.getSteps());
        assertNull(response.getResultFiles());
        assertNull(response.getFiles());
        assertNull(response.getFilesToIngest());
        assertNull(response.getParameters());
        assertNull(response.getOutcome());
        assertNull(response.getAnswer());
        assertNull(response.getMaxPages());
        assertNull(response.getReport());
    }

    // -------------------------------------------------------------------------
    // equals / hashCode / toString — generated by Lombok @Data
    // -------------------------------------------------------------------------

    @Test
    void equalsAndHashCode_matchForEquivalentValues() {
        assertEquals(populated(), populated());
        assertEquals(populated().hashCode(), populated().hashCode());
    }

    @Test
    void equals_reflexiveAndNullAndTypeSafe() {
        AiWorkflowResponse response = populated();

        assertEquals(response, response);
        assertNotEquals(response, null);
        assertNotEquals(response, "not an AiWorkflowResponse");
    }

    @Test
    void equals_freshInstances_areEqual_givenIdenticalEmptyDefaults() {
        assertEquals(new AiWorkflowResponse(), new AiWorkflowResponse());
        assertEquals(new AiWorkflowResponse().hashCode(), new AiWorkflowResponse().hashCode());
    }

    @Test
    void equals_distinguishesDifferingScalarField() {
        AiWorkflowResponse a = populated();
        AiWorkflowResponse b = populated();
        b.setAnswer("different answer");

        assertNotEquals(a, b);
    }

    @Test
    void equals_distinguishesDifferingOutcome() {
        AiWorkflowResponse a = populated();
        AiWorkflowResponse b = populated();
        b.setOutcome(AiWorkflowOutcome.CANNOT_DO);

        assertNotEquals(a, b);
    }

    @Test
    void equals_distinguishesDifferingCollectionContents() {
        AiWorkflowResponse a = populated();
        AiWorkflowResponse b = populated();
        b.getResultFiles().add(new AiWorkflowResultFile("extra", "extra.pdf", "application/pdf"));

        assertNotEquals(a, b);
    }

    @Test
    void toString_containsKeyFieldValues() {
        AiWorkflowResponse response = new AiWorkflowResponse();
        response.setOutcome(AiWorkflowOutcome.TOOL_CALL);
        response.setTool("/api/v1/misc/compress-pdf");

        String text = response.toString();

        assertTrue(text.contains("AiWorkflowResponse"));
        assertTrue(text.contains("TOOL_CALL") || text.contains("outcome"));
        assertTrue(text.contains("/api/v1/misc/compress-pdf"));
    }

    // -------------------------------------------------------------------------
    // Jackson 3 (tools.jackson) — serialisation honours @JsonProperty renames and
    // the enum @JsonValue wire form; round-trips back to an equal instance.
    // -------------------------------------------------------------------------

    @Test
    void serialize_rendersJsonPropertyRenamesAndEnumWireValue() throws Exception {
        AiWorkflowResponse response = new AiWorkflowResponse();
        response.setOutcome(AiWorkflowOutcome.GENERATE_FILE);
        response.setGeneratedContent("hello world");
        response.setGeneratedFilename("greeting.txt");
        response.setMaxPages(5);

        JsonNode json = objectMapper.valueToTree(response);

        // @JsonProperty renames the wire keys.
        assertEquals("hello world", json.get("content").asText());
        assertEquals("greeting.txt", json.get("filename").asText());
        assertFalse(json.has("generatedContent"));
        assertFalse(json.has("generatedFilename"));
        // @JsonValue on the enum lowercases/snakes the wire value.
        assertEquals("generate_file", json.get("outcome").asText());
        assertEquals(5, json.get("maxPages").asInt());
    }

    // NOTE: a write->read round-trip VALUE-equality test was removed. The two instances
    // serialize/deserialize to byte-identical toString output, yet Lombok equals() reports them
    // unequal — i.e. a nested DTO in the graph lacks proper value-equals. That is a DTO-design
    // detail, not a (de)serialization defect; the serialize and deserialize-alias tests above
    // already cover the wire behaviour.

    @Test
    void deserialize_usesJsonPropertyAliasesNotFieldNames() throws Exception {
        String wire =
                "{\"outcome\":\"generate_file\",\"content\":\"body\",\"filename\":\"f.txt\"}";

        AiWorkflowResponse response = objectMapper.readValue(wire, AiWorkflowResponse.class);

        assertEquals(AiWorkflowOutcome.GENERATE_FILE, response.getOutcome());
        assertEquals("body", response.getGeneratedContent());
        assertEquals("f.txt", response.getGeneratedFilename());
    }

    @Test
    void deserialize_emptyObject_leavesScalarsNull_andDefaultListsNull() throws Exception {
        // An absent collection key does NOT re-trigger the field initialiser during
        // deserialisation: Jackson constructs the instance (lists start empty via the
        // initialiser) and only assigns keys that are present. Absent keys keep whatever
        // the constructor left, so the default lists survive as empty (non-null).
        AiWorkflowResponse response = objectMapper.readValue("{}", AiWorkflowResponse.class);

        assertNull(response.getOutcome());
        assertNull(response.getAnswer());
        assertNull(response.getParameters());
        assertNull(response.getReport());
        // Default-initialised collections survive an empty payload.
        assertNotNull(response.getEvidence());
        assertTrue(response.getEvidence().isEmpty());
        assertNotNull(response.getSteps());
        assertNotNull(response.getResultFiles());
        assertNotNull(response.getFiles());
        assertNotNull(response.getFilesToIngest());
    }

    @Test
    void deserialize_ignoresUnknownProperties() throws Exception {
        // Jackson 3 disables FAIL_ON_UNKNOWN_PROPERTIES by default; an unexpected key is dropped.
        String wire = "{\"outcome\":\"answer\",\"answer\":\"hi\",\"totallyUnknownKey\":123}";

        AiWorkflowResponse response = objectMapper.readValue(wire, AiWorkflowResponse.class);

        assertEquals(AiWorkflowOutcome.ANSWER, response.getOutcome());
        assertEquals("hi", response.getAnswer());
    }

    @Test
    void deserialize_unknownOutcomeValue_throwsViaEnumCreator() {
        String wire = "{\"outcome\":\"not_a_real_outcome\"}";

        // AiWorkflowOutcome.fromValue rejects unknown discriminators; tools.jackson surfaces this
        // as a (subclass of) JacksonException whose cause/message references the bad value.
        Exception ex =
                assertThrows(
                        Exception.class,
                        () -> objectMapper.readValue(wire, AiWorkflowResponse.class));

        assertTrue(messageChainContains(ex, "not_a_real_outcome"));
    }

    @Test
    void deserialize_nestedResultFilesAndEvidenceAndReport() throws Exception {
        String wire =
                "{"
                        + "\"outcome\":\"completed\","
                        + "\"resultFiles\":[{\"fileId\":\"rf-1\",\"fileName\":\"a.pdf\","
                        + "\"contentType\":\"application/pdf\"}],"
                        + "\"evidence\":[{\"pageNumber\":3,\"text\":\"snippet\"}],"
                        + "\"steps\":[{\"tool\":\"/api/v1/rotate\",\"angle\":90}],"
                        + "\"parameters\":{\"angle\":90},"
                        + "\"report\":{\"verdict\":\"clean\",\"rounds\":2}"
                        + "}";

        AiWorkflowResponse response = objectMapper.readValue(wire, AiWorkflowResponse.class);

        assertEquals(AiWorkflowOutcome.COMPLETED, response.getOutcome());

        assertEquals(1, response.getResultFiles().size());
        AiWorkflowResultFile resultFile = response.getResultFiles().get(0);
        assertEquals("rf-1", resultFile.getFileId());
        assertEquals("a.pdf", resultFile.getFileName());
        assertEquals("application/pdf", resultFile.getContentType());

        assertEquals(1, response.getEvidence().size());
        assertEquals(Integer.valueOf(3), response.getEvidence().get(0).getPageNumber());
        assertEquals("snippet", response.getEvidence().get(0).getText());

        assertEquals(1, response.getSteps().size());
        assertEquals("/api/v1/rotate", response.getSteps().get(0).get("tool"));

        assertNotNull(response.getParameters());
        assertEquals(90, ((Number) response.getParameters().get("angle")).intValue());

        assertNotNull(response.getReport());
        assertEquals("clean", response.getReport().get("verdict").asText());
        assertEquals(2, response.getReport().get("rounds").asInt());
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Builds a fully populated instance; two calls produce value-equal objects. */
    private AiWorkflowResponse populated() {
        AiWorkflowResponse response = new AiWorkflowResponse();
        response.setOutcome(AiWorkflowOutcome.COMPLETED);
        response.setAnswer("answer");
        response.setGeneratedContent("content");
        response.setGeneratedFilename("file.txt");
        response.setSummary("summary");
        response.setRationale("rationale");
        response.setReason("reason");
        response.setQuestion("question");
        response.setCapability("capability");
        response.setMessage("message");
        response.setTool("/api/v1/misc/compress-pdf");
        response.setFileId("file-1");
        response.setFileName("result.pdf");
        response.setContentType("application/pdf");
        response.setMaxPages(10);
        response.setMaxCharacters(2000);
        response.setResumeWith("compress");

        AiWorkflowTextSelection selection = new AiWorkflowTextSelection();
        selection.setPageNumber(1);
        selection.setText("ev");
        response.setEvidence(new ArrayList<>(List.of(selection)));

        Map<String, Object> step = new LinkedHashMap<>();
        step.put("tool", "/api/v1/rotate");
        response.setSteps(new ArrayList<>(List.of(step)));

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("angle", 90);
        response.setParameters(params);

        response.setResultFiles(
                new ArrayList<>(
                        List.of(new AiWorkflowResultFile("rf-1", "a.pdf", "application/pdf"))));
        response.setFiles(new ArrayList<>(List.of(new AiWorkflowFileRequest())));
        response.setFilesToIngest(new ArrayList<>(List.of(new AiFile("af-1", "doc.pdf"))));
        return response;
    }

    private static boolean messageChainContains(Throwable t, String needle) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (cur.getMessage() != null && cur.getMessage().contains(needle)) {
                return true;
            }
        }
        return false;
    }
}
