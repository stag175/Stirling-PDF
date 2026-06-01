package stirling.software.proprietary.security.database.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.mail.MessagingException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium.EnterpriseFeatures.DatabaseNotifications;
import stirling.software.proprietary.security.service.EmailService;

/**
 * Unit tests for {@link DatabaseNotificationService}.
 *
 * <p>The service is constructor-injected with an {@code Optional<EmailService>}, a real {@link
 * ApplicationProperties} (whose nested config classes are all Lombok {@code @Data} POJOs) and a
 * {@code runningEE} boolean. The constructor snapshots the {@link DatabaseNotifications} config at
 * construction time, so flag combinations are configured on the real properties object before each
 * service is built. {@code EmailService} is a non-final concrete class and is mocked so that no real
 * mail server, network or JavaMailSender is required.
 */
@ExtendWith(MockitoExtension.class)
class DatabaseNotificationServiceTest {

    private static final String MAIL_FROM = "no-reply@stirling-software.com";
    private static final String SUBJECT = "Backup subject";
    private static final String MESSAGE = "Backup message body";

    @Mock private EmailService emailService;

    private ApplicationProperties props;
    private DatabaseNotifications notifications;

    @BeforeEach
    void setUp() {
        props = new ApplicationProperties();
        props.getMail().setFrom(MAIL_FROM);
        notifications = props.getPremium().getEnterpriseFeatures().getDatabaseNotifications();
    }

    private DatabaseNotificationService newService(
            Optional<EmailService> service, boolean runningEE) {
        return new DatabaseNotificationService(service, props, runningEE);
    }

    // ----------------------------------------------------------------------
    // Backups - success
    // ----------------------------------------------------------------------

    @Test
    void notifyBackupsSuccess_flagOnAndRunningEE_sendsMail() throws MessagingException {
        notifications.getBackups().setSuccessful(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyBackupsSuccess(SUBJECT, MESSAGE);

        verify(emailService).sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
    }

    @Test
    void notifyBackupsSuccess_flagOffButRunningEE_doesNotSendMail() {
        // backups.successful defaults to false
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyBackupsSuccess(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    @Test
    void notifyBackupsSuccess_flagOnButNotRunningEE_doesNotSendMail() {
        notifications.getBackups().setSuccessful(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), false);

        service.notifyBackupsSuccess(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    @Test
    void notifyBackupsSuccess_flagOnRunningEEButNoEmailService_doesNothing() {
        notifications.getBackups().setSuccessful(true);
        DatabaseNotificationService service = newService(Optional.empty(), true);

        // No EmailService present: must not throw, simply a no-op.
        assertDoesNotThrow(() -> service.notifyBackupsSuccess(SUBJECT, MESSAGE));
    }

    // ----------------------------------------------------------------------
    // Backups - failure
    // ----------------------------------------------------------------------

    @Test
    void notifyBackupsFailure_flagOnAndRunningEE_sendsMail() throws MessagingException {
        notifications.getBackups().setFailed(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyBackupsFailure(SUBJECT, MESSAGE);

        verify(emailService).sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
    }

    @Test
    void notifyBackupsFailure_flagOffButRunningEE_doesNotSendMail() {
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyBackupsFailure(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    @Test
    void notifyBackupsFailure_flagOnButNotRunningEE_doesNotSendMail() {
        notifications.getBackups().setFailed(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), false);

        service.notifyBackupsFailure(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    @Test
    void notifyBackupsFailure_successFlagOnFailFlagOff_doesNotSendMail() {
        // Only the "successful" flag is set; failure path must check its own flag.
        notifications.getBackups().setSuccessful(true);
        notifications.getBackups().setFailed(false);
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyBackupsFailure(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    // ----------------------------------------------------------------------
    // Imports - success
    // ----------------------------------------------------------------------

    @Test
    void notifyImportsSuccess_flagOnAndRunningEE_sendsMail() throws MessagingException {
        notifications.getImports().setSuccessful(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyImportsSuccess(SUBJECT, MESSAGE);

        verify(emailService).sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
    }

    @Test
    void notifyImportsSuccess_flagOffButRunningEE_doesNotSendMail() {
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyImportsSuccess(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    @Test
    void notifyImportsSuccess_flagOnButNotRunningEE_doesNotSendMail() {
        notifications.getImports().setSuccessful(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), false);

        service.notifyImportsSuccess(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    // ----------------------------------------------------------------------
    // Imports - failure
    // ----------------------------------------------------------------------

    @Test
    void notifyImportsFailure_flagOnAndRunningEE_sendsMail() throws MessagingException {
        notifications.getImports().setFailed(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyImportsFailure(SUBJECT, MESSAGE);

        verify(emailService).sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
    }

    @Test
    void notifyImportsFailure_flagOffButRunningEE_doesNotSendMail() {
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyImportsFailure(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    @Test
    void notifyImportsFailure_flagOnButNotRunningEE_doesNotSendMail() {
        notifications.getImports().setFailed(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), false);

        service.notifyImportsFailure(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    // ----------------------------------------------------------------------
    // Cross-channel isolation: backup flags must not trigger import notifications.
    // ----------------------------------------------------------------------

    @Test
    void importsFlagsDoNotAffectBackupNotifications() {
        notifications.getImports().setSuccessful(true);
        notifications.getImports().setFailed(true);
        // backups flags remain false
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyBackupsSuccess(SUBJECT, MESSAGE);
        service.notifyBackupsFailure(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    @Test
    void backupFlagsDoNotAffectImportNotifications() {
        notifications.getBackups().setSuccessful(true);
        notifications.getBackups().setFailed(true);
        // imports flags remain false
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyImportsSuccess(SUBJECT, MESSAGE);
        service.notifyImportsFailure(SUBJECT, MESSAGE);

        verifyNoInteractions(emailService);
    }

    // ----------------------------------------------------------------------
    // Error path: a MessagingException from EmailService is swallowed (logged, not rethrown).
    // ----------------------------------------------------------------------

    @Nested
    class MessagingExceptionIsSwallowed {

        @Test
        void notifyBackupsSuccess_swallowsMessagingException() throws MessagingException {
            notifications.getBackups().setSuccessful(true);
            doThrow(new MessagingException("smtp down"))
                    .when(emailService)
                    .sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
            DatabaseNotificationService service = newService(Optional.of(emailService), true);

            assertDoesNotThrow(() -> service.notifyBackupsSuccess(SUBJECT, MESSAGE));
            verify(emailService).sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
        }

        @Test
        void notifyImportsFailure_swallowsMessagingException() throws MessagingException {
            notifications.getImports().setFailed(true);
            doThrow(new MessagingException("smtp down"))
                    .when(emailService)
                    .sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
            DatabaseNotificationService service = newService(Optional.of(emailService), true);

            assertDoesNotThrow(() -> service.notifyImportsFailure(SUBJECT, MESSAGE));
            verify(emailService).sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
        }
    }

    // ----------------------------------------------------------------------
    // The configured mail "from" address is used as the recipient.
    // ----------------------------------------------------------------------

    @Test
    void sendMail_usesConfiguredFromAddressAsRecipient() throws MessagingException {
        props.getMail().setFrom("admin@example.org");
        notifications.getBackups().setSuccessful(true);
        DatabaseNotificationService service = newService(Optional.of(emailService), true);

        service.notifyBackupsSuccess(SUBJECT, MESSAGE);

        verify(emailService).sendSimpleMail("admin@example.org", SUBJECT, MESSAGE);
        verify(emailService, never()).sendSimpleMail(MAIL_FROM, SUBJECT, MESSAGE);
    }
}
