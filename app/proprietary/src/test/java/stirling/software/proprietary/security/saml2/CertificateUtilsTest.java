package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

/**
 * Pure unit tests for {@link CertificateUtils}.
 *
 * <p>The class is annotated with {@code @ConditionalOnProperty}, but that annotation only affects
 * Spring bean registration; the static methods can be invoked directly with no application context.
 * All fixtures are self-contained, deterministic PEM blocks generated once with OpenSSL (a
 * self-signed RSA X.509 certificate, the matching RSA private key in both PKCS#1 "traditional" and
 * PKCS#8 encodings, an unrelated EC private key in PKCS#8 form, and the RSA public key). No keys
 * are generated at test time, so the tests are stable across runs.
 */
class CertificateUtilsTest {

    // Self-signed certificate: subject/issuer = CN=stirling-test, O=Stirling, C=US.
    private static final String CERTIFICATE_PEM =
            """
            -----BEGIN CERTIFICATE-----
            MIIDUTCCAjmgAwIBAgIUUpMV2cGU6+gVDotxpYfz/ZF3zfUwDQYJKoZIhvcNAQEL
            BQAwODEWMBQGA1UEAwwNc3RpcmxpbmctdGVzdDERMA8GA1UECgwIU3Rpcmxpbmcx
            CzAJBgNVBAYTAlVTMB4XDTI2MDYwMTE3MTQ0OVoXDTM2MDUyOTE3MTQ0OVowODEW
            MBQGA1UEAwwNc3RpcmxpbmctdGVzdDERMA8GA1UECgwIU3RpcmxpbmcxCzAJBgNV
            BAYTAlVTMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvCdYnJv6W3Hb
            RawTZd5Gq993Pd1bgWKKRLhvUMIK8j0g5n/XJHPqCN77q2LvMBEVcDoRSl67vnVg
            KWt/ueiPx008rwM0TvA4IV70Dr4bH3OacgIy9QHBkrBxZ+WCEtWGMrba9z38VTg+
            hgP87C7WzVft0DuXtLJfK3TV8A+xCMFUNK1RfTVL4RrVHcby5N+3NwRMzlw8JZdV
            wIOGk/IsQJJUMg6qWuLaEQm3u+qBA2HgobFtn9MnDZ0Jhl2Q9YKJyr1l+QXopfau
            1R5y7TuTgQXq9xIfJAr8rCaaHl8DcI3OXTzF6Hv+JtxKFFqfnaVIk9YqJXEsXsjJ
            ssCsnNYQwQIDAQABo1MwUTAdBgNVHQ4EFgQUS26fkap9nLgfFvzUPBUVtRuQo/4w
            HwYDVR0jBBgwFoAUS26fkap9nLgfFvzUPBUVtRuQo/4wDwYDVR0TAQH/BAUwAwEB
            /zANBgkqhkiG9w0BAQsFAAOCAQEAUSudWuodR1AMWENlvL5sgg7tZtNhfWVf2H89
            VlUwaNSx/ySudTW3CASLbLkWavYQywwIwc+wVnbtUk/7yO3jOO6pf08fmaeoj+Ra
            WRm/hOFU2HujG3gZ2lBn7HDZvN/CjKh/m8sj4/8vBn5S8oJNrs5I10irXdB5rsKk
            ttl3/4vUIJ4QAMLsgiD7bGEnX0pgWvXM+LhzrV0j14MdukqqK0u4D7u5MdMPuSF3
            IalE/EXKxT65TnRRAy8HRdbfvSa/hPPTES7WPsh78vNwP8pPeyNeGHUbq07KcTFK
            0rBQhOMrMMZccQmb2pYdUz1Vq4GsR5hjS2nuYeTs3WCWas42KA==
            -----END CERTIFICATE-----
            """;

    // Same RSA key as the certificate, PKCS#1 ("traditional") -> parsed as PEMKeyPair.
    private static final String RSA_PKCS1_PEM =
            """
            -----BEGIN RSA PRIVATE KEY-----
            MIIEowIBAAKCAQEAvCdYnJv6W3HbRawTZd5Gq993Pd1bgWKKRLhvUMIK8j0g5n/X
            JHPqCN77q2LvMBEVcDoRSl67vnVgKWt/ueiPx008rwM0TvA4IV70Dr4bH3OacgIy
            9QHBkrBxZ+WCEtWGMrba9z38VTg+hgP87C7WzVft0DuXtLJfK3TV8A+xCMFUNK1R
            fTVL4RrVHcby5N+3NwRMzlw8JZdVwIOGk/IsQJJUMg6qWuLaEQm3u+qBA2HgobFt
            n9MnDZ0Jhl2Q9YKJyr1l+QXopfau1R5y7TuTgQXq9xIfJAr8rCaaHl8DcI3OXTzF
            6Hv+JtxKFFqfnaVIk9YqJXEsXsjJssCsnNYQwQIDAQABAoIBABtwLMrF2k18kz/x
            TJuLPcjHBqIVxkgzgRDCyVpAZI1CidTjVBIDpLT/eORbl0ruAC+EtaHKooavTO3Y
            DeEkFNeOdWjbnESzYP7I1JQpIqvEVYOxELz3Bm4TCgQJ4vKb2H1Lz4RvsdJm/diC
            +17L+SoqhkqFbjr9KhtxvIMiHqyKbkInk4dGmh1UcMOXu+0CXaqrQWBYlBoaEu9N
            0LFEGkSCbz1hhzFxwnCXmPDJXTWtOGIJRhrWJddd8eODlvM2rzDbyiVERPBu3mhb
            6BC2BP7lYdPCazVZOnQKZ3jhhP8IWbnNOQ3+EJOExquAfUkVsVZJru46x9nmCuZq
            xxTr8wsCgYEA33ugbDu5/JspSJ7QrLVBRGgZ8cRwMN4NaAO6+770Thz0FjpA/v5f
            4EzCh/F+H4rPRwMrOURR4QdzDUyjsfPgzEsepbcRRETjMAn+gqeDkkF1IhnCystO
            nnl+GJUfVfMPm6vUgY7XbmHB4pEV9cC6AkEAJev2yAOoTPLlaXE6z0cCgYEA14fD
            hfV/ylSsqmbeLfOOdz6yPwyHyzBNMKTGuJARQEfb3/Zc+BB4rMzzip8NhsmaTKxs
            DGqR5OEOtuv79UMUihg9R8tRRIYeHspG7GTlRuPiWyBrqB9G1L8OrnnHql5Drl/F
            +Aoch9WjfbBRfIVZ4+zQ2Y+ZU/CudHphu8dZc7cCgYALCqqkblcEGg5yHhalUddF
            r/cIMPJyF6aF6xlD8u1TJq8QohQwBRVrmZ9K5C2dFVikY42xKKT6/0k58P1tf2Ut
            8tAy09awjs7CwtumTOx9P2qwIqGzL1RVFB+cy1FfB8FPqa+4LvyJ4Z6YuR5ipAEM
            t3VwajYpL7UTCDU5fnSvZQKBgQDOuSYdN5Jhc4PFUTMrad8smpMGjDM2/VYcIP+F
            iJEzUXkgQEF9oPbN7ypsvA+SR43amsprwk+68u5VHtUksjliFsu4L9f73JPJPoR2
            OnP64Zp7gwYfVBhw9+vSB3Yt/4n1F2FffftNgej1JgeSYqkMR1kuQ2ByNXhuue9B
            13wB0wKBgCxiaw7Ps+x+Cl2qnAF5ov+GwSV6RLXyfdpM0BDT5r8K6Xp6o8dpRBJT
            rEfFr4ps+8zH8YuKwonQwBn30yGtNKn+td6V01Hg2UVkWUxUovuY2KDigtWgJv1m
            zYALN6AlmGV+uKMoRPqOkDeGLdPGhvnwH+EsYTjGn/ek8QO6j52V
            -----END RSA PRIVATE KEY-----
            """;

    // Same RSA key, PKCS#8 -> parsed as PrivateKeyInfo.
    private static final String RSA_PKCS8_PEM =
            """
            -----BEGIN PRIVATE KEY-----
            MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC8J1icm/pbcdtF
            rBNl3kar33c93VuBYopEuG9QwgryPSDmf9ckc+oI3vurYu8wERVwOhFKXru+dWAp
            a3+56I/HTTyvAzRO8DghXvQOvhsfc5pyAjL1AcGSsHFn5YIS1YYyttr3PfxVOD6G
            A/zsLtbNV+3QO5e0sl8rdNXwD7EIwVQ0rVF9NUvhGtUdxvLk37c3BEzOXDwll1XA
            g4aT8ixAklQyDqpa4toRCbe76oEDYeChsW2f0ycNnQmGXZD1gonKvWX5Beil9q7V
            HnLtO5OBBer3Eh8kCvysJpoeXwNwjc5dPMXoe/4m3EoUWp+dpUiT1iolcSxeyMmy
            wKyc1hDBAgMBAAECggEAG3AsysXaTXyTP/FMm4s9yMcGohXGSDOBEMLJWkBkjUKJ
            1ONUEgOktP945FuXSu4AL4S1ocqihq9M7dgN4SQU1451aNucRLNg/sjUlCkiq8RV
            g7EQvPcGbhMKBAni8pvYfUvPhG+x0mb92IL7Xsv5KiqGSoVuOv0qG3G8gyIerIpu
            QieTh0aaHVRww5e77QJdqqtBYFiUGhoS703QsUQaRIJvPWGHMXHCcJeY8MldNa04
            YglGGtYl113x44OW8zavMNvKJURE8G7eaFvoELYE/uVh08JrNVk6dApneOGE/whZ
            uc05Df4Qk4TGq4B9SRWxVkmu7jrH2eYK5mrHFOvzCwKBgQDfe6BsO7n8mylIntCs
            tUFEaBnxxHAw3g1oA7r7vvROHPQWOkD+/l/gTMKH8X4fis9HAys5RFHhB3MNTKOx
            8+DMSx6ltxFEROMwCf6Cp4OSQXUiGcLKy06eeX4YlR9V8w+bq9SBjtduYcHikRX1
            wLoCQQAl6/bIA6hM8uVpcTrPRwKBgQDXh8OF9X/KVKyqZt4t8453PrI/DIfLME0w
            pMa4kBFAR9vf9lz4EHiszPOKnw2GyZpMrGwMapHk4Q626/v1QxSKGD1Hy1FEhh4e
            ykbsZOVG4+JbIGuoH0bUvw6ueceqXkOuX8X4ChyH1aN9sFF8hVnj7NDZj5lT8K50
            emG7x1lztwKBgAsKqqRuVwQaDnIeFqVR10Wv9wgw8nIXpoXrGUPy7VMmrxCiFDAF
            FWuZn0rkLZ0VWKRjjbEopPr/STnw/W1/ZS3y0DLT1rCOzsLC26ZM7H0/arAiobMv
            VFUUH5zLUV8HwU+pr7gu/Inhnpi5HmKkAQy3dXBqNikvtRMINTl+dK9lAoGBAM65
            Jh03kmFzg8VRMytp3yyakwaMMzb9Vhwg/4WIkTNReSBAQX2g9s3vKmy8D5JHjdqa
            ymvCT7ry7lUe1SSyOWIWy7gv1/vck8k+hHY6c/rhmnuDBh9UGHD369IHdi3/ifUX
            YV99+02B6PUmB5JiqQxHWS5DYHI1eG6570HXfAHTAoGALGJrDs+z7H4KXaqcAXmi
            /4bBJXpEtfJ92kzQENPmvwrpenqjx2lEElOsR8Wvimz7zMfxi4rCidDAGffTIa00
            qf613pXTUeDZRWRZTFSi+5jYoOKC1aAm/WbNgAs3oCWYZX64oyhE+o6QN4Yt08aG
            +fAf4SxhOMaf96TxA7qPnZU=
            -----END PRIVATE KEY-----
            """;

    // Unrelated EC key (P-256), PKCS#8. Parses as PrivateKeyInfo but is NOT an RSA key, so the
    // (RSAPrivateKey) cast inside readPrivateKey fails.
    private static final String EC_PKCS8_PEM =
            """
            -----BEGIN PRIVATE KEY-----
            MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgtmZhT2r1+j2p1woi
            /UVtX5vzfgf4Q3tUW9GhJaFxMbehRANCAAQA9raa9e3Qg7ThtDPvz9J5qDTOBv9Y
            iA+uqFs07MXAC5qVp/qn9kbiOYgM3pmbMccVKxGZ9Ke1sJf/FxGtmiTX
            -----END PRIVATE KEY-----
            """;

    // RSA public key. Parses as a SubjectPublicKeyInfo: neither PEMKeyPair nor PrivateKeyInfo, so
    // readPrivateKey takes the "Unsupported key format" branch.
    private static final String RSA_PUBLIC_PEM =
            """
            -----BEGIN PUBLIC KEY-----
            MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvCdYnJv6W3HbRawTZd5G
            q993Pd1bgWKKRLhvUMIK8j0g5n/XJHPqCN77q2LvMBEVcDoRSl67vnVgKWt/ueiP
            x008rwM0TvA4IV70Dr4bH3OacgIy9QHBkrBxZ+WCEtWGMrba9z38VTg+hgP87C7W
            zVft0DuXtLJfK3TV8A+xCMFUNK1RfTVL4RrVHcby5N+3NwRMzlw8JZdVwIOGk/Is
            QJJUMg6qWuLaEQm3u+qBA2HgobFtn9MnDZ0Jhl2Q9YKJyr1l+QXopfau1R5y7TuT
            gQXq9xIfJAr8rCaaHl8DcI3OXTzF6Hv+JtxKFFqfnaVIk9YqJXEsXsjJssCsnNYQ
            wQIDAQAB
            -----END PUBLIC KEY-----
            """;

    private static Resource pem(String pem) {
        return new ByteArrayResource(pem.getBytes(StandardCharsets.UTF_8));
    }

    @Nested
    @DisplayName("readCertificate")
    class ReadCertificate {

        @Test
        @DisplayName("parses a valid PEM X.509 certificate and exposes its subject")
        void parsesValidCertificate() throws Exception {
            X509Certificate certificate = CertificateUtils.readCertificate(pem(CERTIFICATE_PEM));

            assertNotNull(certificate, "A certificate should be returned");
            assertEquals("X.509", certificate.getType(), "Type should be X.509");
            // RFC 2253 distinguished name; assert by component to stay independent of separator
            // spacing.
            String subjectDn = certificate.getSubjectX500Principal().getName();
            assertTrue(
                    subjectDn.contains("CN=stirling-test"),
                    "Subject DN should contain the expected common name but was: " + subjectDn);
            assertTrue(
                    subjectDn.contains("O=Stirling"),
                    "Subject DN should contain the organization but was: " + subjectDn);
        }

        @Test
        @DisplayName("self-signed certificate: issuer equals subject")
        void selfSignedIssuerEqualsSubject() throws Exception {
            X509Certificate certificate = CertificateUtils.readCertificate(pem(CERTIFICATE_PEM));

            assertEquals(
                    certificate.getSubjectX500Principal(),
                    certificate.getIssuerX500Principal(),
                    "A self-signed certificate has identical subject and issuer");
        }

        @Test
        @DisplayName("non-PEM content yields no PemObject and surfaces a NullPointerException")
        void nonPemContentThrows() {
            // PemReader.readPemObject() returns null for content with no PEM boundaries; the method
            // then dereferences it via getContent().
            Resource garbage = pem("this is not a PEM encoded certificate\n");

            assertThrows(
                    NullPointerException.class, () -> CertificateUtils.readCertificate(garbage));
        }

        @Test
        @DisplayName("empty resource yields no PemObject and surfaces a NullPointerException")
        void emptyContentThrows() {
            Resource empty = pem("");

            assertThrows(NullPointerException.class, () -> CertificateUtils.readCertificate(empty));
        }

        @Test
        @DisplayName("propagates IOException raised while opening the resource stream")
        void propagatesIoException() {
            Resource throwing = new ThrowingResource("boom-cert");

            IOException thrown =
                    assertThrows(
                            IOException.class, () -> CertificateUtils.readCertificate(throwing));
            assertEquals("boom-cert", thrown.getMessage());
        }
    }

    @Nested
    @DisplayName("readPrivateKey")
    class ReadPrivateKey {

        @Test
        @DisplayName("parses a traditional PKCS#1 RSA private key (PEMKeyPair branch)")
        void parsesPkcs1RsaKey() throws Exception {
            RSAPrivateKey key = CertificateUtils.readPrivateKey(pem(RSA_PKCS1_PEM));

            assertNotNull(key, "An RSA private key should be returned");
            assertEquals("RSA", key.getAlgorithm(), "Algorithm should be RSA");
            assertEquals(2048, key.getModulus().bitLength(), "The fixture is a 2048-bit RSA key");
        }

        @Test
        @DisplayName("parses a PKCS#8 RSA private key (PrivateKeyInfo branch)")
        void parsesPkcs8RsaKey() throws Exception {
            RSAPrivateKey key = CertificateUtils.readPrivateKey(pem(RSA_PKCS8_PEM));

            assertNotNull(key, "An RSA private key should be returned");
            assertEquals("RSA", key.getAlgorithm(), "Algorithm should be RSA");
            assertEquals(2048, key.getModulus().bitLength(), "The fixture is a 2048-bit RSA key");
        }

        @Test
        @DisplayName("PKCS#1 and PKCS#8 encodings of the same key produce the same modulus")
        void pkcs1AndPkcs8YieldSameKey() throws Exception {
            RSAPrivateKey fromPkcs1 = CertificateUtils.readPrivateKey(pem(RSA_PKCS1_PEM));
            RSAPrivateKey fromPkcs8 = CertificateUtils.readPrivateKey(pem(RSA_PKCS8_PEM));

            assertEquals(
                    fromPkcs1.getModulus(),
                    fromPkcs8.getModulus(),
                    "Both encodings describe the same underlying RSA key");
        }

        @Test
        @DisplayName("private key modulus matches the certificate's public key modulus")
        void privateKeyMatchesCertificate() throws Exception {
            X509Certificate certificate = CertificateUtils.readCertificate(pem(CERTIFICATE_PEM));
            RSAPrivateKey privateKey = CertificateUtils.readPrivateKey(pem(RSA_PKCS8_PEM));

            java.security.interfaces.RSAPublicKey publicKey =
                    (java.security.interfaces.RSAPublicKey) certificate.getPublicKey();
            assertEquals(
                    publicKey.getModulus(),
                    privateKey.getModulus(),
                    "The private key belongs to the certificate's key pair");
        }

        @Test
        @DisplayName("a non-RSA (EC) PKCS#8 key parses but fails the RSAPrivateKey cast")
        void ecKeyFailsRsaCast() {
            // The EC key is a valid PrivateKeyInfo, so the converter succeeds, but the resulting
            // key is not an RSAPrivateKey and the cast inside the method throws.
            Resource ecResource = pem(EC_PKCS8_PEM);

            assertThrows(
                    ClassCastException.class, () -> CertificateUtils.readPrivateKey(ecResource));
        }

        @Test
        @DisplayName("a public key PEM is rejected with IllegalArgumentException")
        void publicKeyRejected() {
            // A PUBLIC KEY block parses to a SubjectPublicKeyInfo, matching neither supported
            // branch, so the explicit IllegalArgumentException is raised.
            Resource publicKey = pem(RSA_PUBLIC_PEM);

            IllegalArgumentException thrown =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> CertificateUtils.readPrivateKey(publicKey));
            assertTrue(
                    thrown.getMessage().startsWith("Unsupported key format:"),
                    "Message should describe the unsupported format but was: "
                            + thrown.getMessage());
        }

        @Test
        @DisplayName("non-PEM content gives a null object and the 'null' unsupported message")
        void nonPemContentRejected() {
            // PEMParser.readObject() returns null for content with no PEM object; the method maps
            // that to the IllegalArgumentException with a "null" class description.
            Resource garbage = pem("not a private key at all\n");

            IllegalArgumentException thrown =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> CertificateUtils.readPrivateKey(garbage));
            assertEquals("Unsupported key format: null", thrown.getMessage());
        }

        @Test
        @DisplayName("empty resource gives a null object and the 'null' unsupported message")
        void emptyContentRejected() {
            Resource empty = pem("");

            IllegalArgumentException thrown =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> CertificateUtils.readPrivateKey(empty));
            assertEquals("Unsupported key format: null", thrown.getMessage());
        }

        @Test
        @DisplayName("propagates IOException raised while opening the resource stream")
        void propagatesIoException() {
            Resource throwing = new ThrowingResource("boom-key");

            IOException thrown =
                    assertThrows(
                            IOException.class, () -> CertificateUtils.readPrivateKey(throwing));
            assertEquals("boom-key", thrown.getMessage());
        }
    }

    @Test
    @DisplayName("a ByteArrayResource can be read more than once (fresh stream per read)")
    void byteArrayResourceCanBeReadTwice() throws Exception {
        // ByteArrayResource hands back a new InputStream on each getInputStream() call, so the same
        // resource instance can be parsed repeatedly without being exhausted.
        Resource certResource = pem(CERTIFICATE_PEM);

        X509Certificate first = CertificateUtils.readCertificate(certResource);
        X509Certificate second = CertificateUtils.readCertificate(certResource);

        assertEquals(
                first.getSubjectX500Principal(),
                second.getSubjectX500Principal(),
                "Repeated reads of the same resource should yield the same certificate");
    }

    /**
     * A {@link Resource} whose {@link #getInputStream()} always fails. Implemented on top of {@link
     * AbstractResource} so that the {@code final} methods on {@link ByteArrayResource} are not in
     * the way.
     */
    private static final class ThrowingResource extends AbstractResource {

        private final String message;

        private ThrowingResource(String message) {
            this.message = message;
        }

        @Override
        public String getDescription() {
            return "ThrowingResource[" + message + "]";
        }

        @Override
        public InputStream getInputStream() throws IOException {
            throw new IOException(message);
        }
    }
}
