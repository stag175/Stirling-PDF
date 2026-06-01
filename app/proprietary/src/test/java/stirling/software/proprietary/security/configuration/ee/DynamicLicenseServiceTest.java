package stirling.software.proprietary.security.configuration.ee;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.LicenseServiceInterface;

@ExtendWith(MockitoExtension.class)
class DynamicLicenseServiceTest {

    @Mock private LicenseKeyChecker licenseKeyChecker;

    @InjectMocks private DynamicLicenseService service;

    // ----- getCurrentLicense: delegates straight to the checker -----

    @Test
    void getCurrentLicense_returnsNormalFromChecker() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        License result = service.getCurrentLicense();

        assertSame(License.NORMAL, result);
        verify(licenseKeyChecker).getPremiumLicenseEnabledResult();
        verifyNoMoreInteractions(licenseKeyChecker);
    }

    @Test
    void getCurrentLicense_returnsServerFromChecker() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        assertSame(License.SERVER, service.getCurrentLicense());
        verify(licenseKeyChecker).getPremiumLicenseEnabledResult();
    }

    @Test
    void getCurrentLicense_returnsEnterpriseFromChecker() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        assertSame(License.ENTERPRISE, service.getCurrentLicense());
        verify(licenseKeyChecker).getPremiumLicenseEnabledResult();
    }

    // ----- isRunningProOrHigher: true for SERVER and ENTERPRISE, false for NORMAL -----

    @Test
    void isRunningProOrHigher_normal_isFalse() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        assertFalse(service.isRunningProOrHigher());
        verify(licenseKeyChecker).getPremiumLicenseEnabledResult();
    }

    @Test
    void isRunningProOrHigher_server_isTrue() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        assertTrue(service.isRunningProOrHigher());
    }

    @Test
    void isRunningProOrHigher_enterprise_isTrue() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        assertTrue(service.isRunningProOrHigher());
    }

    // ----- isRunningEE: true only for ENTERPRISE -----

    @Test
    void isRunningEE_normal_isFalse() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        assertFalse(service.isRunningEE());
    }

    @Test
    void isRunningEE_server_isFalse() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        assertFalse(service.isRunningEE());
    }

    @Test
    void isRunningEE_enterprise_isTrue() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        assertTrue(service.isRunningEE());
    }

    // ----- getLicenseTypeName: returns the enum constant name -----

    @Test
    void getLicenseTypeName_normal() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        assertEquals("NORMAL", service.getLicenseTypeName());
    }

    @Test
    void getLicenseTypeName_server() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        assertEquals("SERVER", service.getLicenseTypeName());
    }

    @Test
    void getLicenseTypeName_enterprise() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        assertEquals("ENTERPRISE", service.getLicenseTypeName());
    }

    // ----- behaviour reflects live checker state (not cached) -----

    @Test
    void readsCheckerOnEveryCall_reflectingDynamicLicenseChanges() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult())
                .thenReturn(License.NORMAL)
                .thenReturn(License.ENTERPRISE);

        // First read: license is NORMAL.
        assertFalse(service.isRunningEE());
        // Second read: admin updated the key, checker now reports ENTERPRISE.
        assertTrue(service.isRunningEE());

        verify(licenseKeyChecker, times(2)).getPremiumLicenseEnabledResult();
    }

    // ----- implements the shared LicenseServiceInterface contract -----

    @Test
    void isUsableAsLicenseServiceInterface() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        LicenseServiceInterface asInterface = service;

        assertTrue(asInterface.isRunningProOrHigher());
        assertFalse(asInterface.isRunningEE());
        assertEquals("SERVER", asInterface.getLicenseTypeName());
    }
}
