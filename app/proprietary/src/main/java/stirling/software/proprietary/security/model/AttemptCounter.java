package stirling.software.proprietary.security.model;

import lombok.Getter;

@Getter
public class AttemptCounter {
    // Package-private (not private) so AttemptCounterTest can seed these fields directly in the
    // same package instead of via reflection. Public read access stays through Lombok @Getter.
    int attemptCount;
    long lastAttemptTime;

    public AttemptCounter() {
        this.attemptCount = 0;
        this.lastAttemptTime = System.currentTimeMillis();
    }

    public void increment() {
        this.attemptCount++;
        this.lastAttemptTime = System.currentTimeMillis();
    }

    public boolean shouldReset(long attemptIncrementTime) {
        long elapsed = System.currentTimeMillis() - lastAttemptTime;
        return elapsed >= attemptIncrementTime;
    }

    public void reset() {
        this.attemptCount = 0;
        this.lastAttemptTime = System.currentTimeMillis();
    }
}
