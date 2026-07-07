package stirling.software.proprietary.model.api.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.proprietary.model.api.ai.AiEngineProgressDetail.WholeDocSliceDone;

class AiWorkflowProgressEventTest {

    // -------------------------------------------------------------------------
    // of(phase)
    // -------------------------------------------------------------------------

    @Test
    void of_setsPhase_andLeavesOtherFieldsNull() {
        long before = System.currentTimeMillis();
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.of(AiWorkflowPhase.ANALYZING);
        long after = System.currentTimeMillis();

        assertEquals(AiWorkflowPhase.ANALYZING, event.getPhase());
        assertNull(event.getTool());
        assertNull(event.getStepIndex());
        assertNull(event.getStepCount());
        assertNull(event.getEngineDetail());
        assertTrue(
                event.getTimestamp() >= before && event.getTimestamp() <= after,
                "timestamp should be captured within the call window");
    }

    @ParameterizedTest
    @EnumSource(AiWorkflowPhase.class)
    void of_preservesEveryPhaseValue(AiWorkflowPhase phase) {
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.of(phase);

        assertEquals(phase, event.getPhase());
        assertNull(event.getTool());
        assertNull(event.getStepIndex());
        assertNull(event.getStepCount());
        assertNull(event.getEngineDetail());
    }

    @Test
    void of_acceptsNullPhase() {
        // The factory does not validate; a null phase flows straight through.
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.of(null);

        assertNull(event.getPhase());
        assertNull(event.getTool());
        assertNull(event.getStepIndex());
        assertNull(event.getStepCount());
        assertNull(event.getEngineDetail());
    }

    // -------------------------------------------------------------------------
    // executingTool(tool, stepIndex, stepCount)
    // -------------------------------------------------------------------------

    @Test
    void executingTool_setsExecutingPhase_andToolFields() {
        long before = System.currentTimeMillis();
        AiWorkflowProgressEvent event =
                AiWorkflowProgressEvent.executingTool("/api/v1/split", 2, 5);
        long after = System.currentTimeMillis();

        assertEquals(AiWorkflowPhase.EXECUTING_TOOL, event.getPhase());
        assertEquals("/api/v1/split", event.getTool());
        assertEquals(2, event.getStepIndex());
        assertEquals(5, event.getStepCount());
        assertNull(event.getEngineDetail());
        assertTrue(event.getTimestamp() >= before && event.getTimestamp() <= after);
    }

    @Test
    void executingTool_boxesPrimitiveIntsIntoIntegerFields() {
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.executingTool("tool", 7, 9);

        // Getters return Integer; verify identity of unboxed value rather than reference.
        assertEquals(Integer.valueOf(7), event.getStepIndex());
        assertEquals(Integer.valueOf(9), event.getStepCount());
    }

    @Test
    void executingTool_acceptsNullTool() {
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.executingTool(null, 1, 1);

        assertEquals(AiWorkflowPhase.EXECUTING_TOOL, event.getPhase());
        assertNull(event.getTool());
        assertEquals(1, event.getStepIndex());
        assertEquals(1, event.getStepCount());
    }

    @Test
    void executingTool_acceptsEmptyTool() {
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.executingTool("", 0, 0);

        assertEquals("", event.getTool());
        assertEquals(0, event.getStepIndex());
        assertEquals(0, event.getStepCount());
    }

    @Test
    void executingTool_acceptsNegativeAndBoundaryIndices() {
        AiWorkflowProgressEvent event =
                AiWorkflowProgressEvent.executingTool("tool", -1, Integer.MAX_VALUE);

        assertEquals(-1, event.getStepIndex());
        assertEquals(Integer.MAX_VALUE, event.getStepCount());
    }

    // -------------------------------------------------------------------------
    // engineProgress(detail)
    // -------------------------------------------------------------------------

    @Test
    void engineProgress_setsEnginePhase_andRetainsDetail() {
        WholeDocSliceDone detail =
                new WholeDocSliceDone("whole_doc_slice_done", 3, 10, "1-5", 120, 4, 2);

        long before = System.currentTimeMillis();
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.engineProgress(detail);
        long after = System.currentTimeMillis();

        assertEquals(AiWorkflowPhase.ENGINE_PROGRESS, event.getPhase());
        assertSame(detail, event.getEngineDetail());
        assertNull(event.getTool());
        assertNull(event.getStepIndex());
        assertNull(event.getStepCount());
        assertTrue(event.getTimestamp() >= before && event.getTimestamp() <= after);
    }

    @Test
    void engineProgress_acceptsNullDetail() {
        AiWorkflowProgressEvent event = AiWorkflowProgressEvent.engineProgress(null);

        assertEquals(AiWorkflowPhase.ENGINE_PROGRESS, event.getPhase());
        assertNull(event.getEngineDetail());
        assertNull(event.getTool());
        assertNull(event.getStepIndex());
        assertNull(event.getStepCount());
    }

    // -------------------------------------------------------------------------
    // Lombok @AllArgsConstructor + @Data behaviour
    // -------------------------------------------------------------------------

    @Test
    void allArgsConstructor_assignsEveryFieldInOrder() {
        WholeDocSliceDone detail =
                new WholeDocSliceDone("whole_doc_slice_done", 1, 2, "1-2", 50, 1, 1);
        AiWorkflowProgressEvent event =
                new AiWorkflowProgressEvent(
                        AiWorkflowPhase.PROCESSING, 1234L, "tool", 4, 8, detail);

        assertEquals(AiWorkflowPhase.PROCESSING, event.getPhase());
        assertEquals(1234L, event.getTimestamp());
        assertEquals("tool", event.getTool());
        assertEquals(4, event.getStepIndex());
        assertEquals(8, event.getStepCount());
        assertSame(detail, event.getEngineDetail());
    }

    @Test
    void setters_mutateFields() {
        AiWorkflowProgressEvent event =
                new AiWorkflowProgressEvent(AiWorkflowPhase.ANALYZING, 0L, null, null, null, null);

        event.setPhase(AiWorkflowPhase.CALLING_ENGINE);
        event.setTimestamp(999L);
        event.setTool("/api/v1/merge");
        event.setStepIndex(3);
        event.setStepCount(6);
        WholeDocSliceDone detail =
                new WholeDocSliceDone("whole_doc_slice_done", 1, 1, "1", 1, 1, 1);
        event.setEngineDetail(detail);

        assertEquals(AiWorkflowPhase.CALLING_ENGINE, event.getPhase());
        assertEquals(999L, event.getTimestamp());
        assertEquals("/api/v1/merge", event.getTool());
        assertEquals(3, event.getStepIndex());
        assertEquals(6, event.getStepCount());
        assertSame(detail, event.getEngineDetail());
    }

    @Test
    void equals_and_hashCode_areValueBased_ignoringFactoryTimestamp() {
        AiWorkflowProgressEvent a =
                new AiWorkflowProgressEvent(
                        AiWorkflowPhase.EXECUTING_TOOL, 100L, "tool", 1, 2, null);
        AiWorkflowProgressEvent b =
                new AiWorkflowProgressEvent(
                        AiWorkflowPhase.EXECUTING_TOOL, 100L, "tool", 1, 2, null);

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    void equals_distinguishesDifferingTimestamp() {
        AiWorkflowProgressEvent a =
                new AiWorkflowProgressEvent(
                        AiWorkflowPhase.EXECUTING_TOOL, 100L, "tool", 1, 2, null);
        AiWorkflowProgressEvent b =
                new AiWorkflowProgressEvent(
                        AiWorkflowPhase.EXECUTING_TOOL, 200L, "tool", 1, 2, null);

        assertNotEquals(a, b);
    }

    @Test
    void equals_distinguishesDifferingEngineDetail() {
        AiWorkflowProgressEvent a =
                AiWorkflowProgressEvent.engineProgress(
                        new WholeDocSliceDone("whole_doc_slice_done", 1, 2, "1-2", 50, 1, 1));
        AiWorkflowProgressEvent b =
                AiWorkflowProgressEvent.engineProgress(
                        new WholeDocSliceDone("whole_doc_slice_done", 2, 2, "1-2", 50, 1, 1));

        // Align timestamps so only engineDetail differs.
        b.setTimestamp(a.getTimestamp());

        assertNotEquals(a, b);
    }

    @Test
    void toString_containsPhaseAndToolValues() {
        AiWorkflowProgressEvent event =
                AiWorkflowProgressEvent.executingTool("/api/v1/rotate", 1, 3);
        String text = event.toString();

        assertTrue(text.contains("EXECUTING_TOOL") || text.contains("phase"));
        assertTrue(text.contains("/api/v1/rotate"));
    }

    // -------------------------------------------------------------------------
    // AiWorkflowPhase.fromValue — exception path used by the discriminator
    // -------------------------------------------------------------------------

    @Test
    void phaseFromValue_unknownValue_throwsIllegalArgument() {
        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> AiWorkflowPhase.fromValue("definitely_not_a_phase"));

        assertTrue(ex.getMessage().contains("definitely_not_a_phase"));
    }

    @Test
    void phaseFromValue_roundTripsKnownValues() {
        for (AiWorkflowPhase phase : AiWorkflowPhase.values()) {
            assertEquals(phase, AiWorkflowPhase.fromValue(phase.getValue()));
        }
    }
}
