package stirling.software.common.cluster;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

class ClusterConfigValidationTest {

    @Test
    void validationPassesWhenDisabled() {
        ApplicationProperties props = new ApplicationProperties();
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> config.validate());
    }

    @Test
    void validationFailsWhenValkeyEnabledWithoutUrl() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("valkey");
        ClusterConfig config = new ClusterConfig(props);
        assertThrows(IllegalStateException.class, () -> config.validate());
    }

    @Test
    void validationPassesWhenValkeyEnabledWithUrl() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("valkey");
        cluster.getValkey().setUrl("redis://localhost:6379");
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> config.validate());
    }

    @Test
    void validationPassesWhenInProcessEnabled() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("inprocess");
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> config.validate());
    }
}
