import { Button, Stack, Text, Group, Divider, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import type { SignatureSettings } from "@app/components/tools/certSign/SignatureSettingsInput";
import type { FileState } from "@app/types/file";

interface ReviewSessionStepProps {
  selectedFile: FileState;
  participantCount: number;
  signatureSettings: SignatureSettings;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export const ReviewSessionStep: React.FC<ReviewSessionStepProps> = ({
  selectedFile,
  participantCount,
  signatureSettings,
  dueDate,
  onDueDateChange,
  onBack,
  onSubmit,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Text size="sm" fw={600} c="dimmed">
        {t("groupSigning.steps.review.title", "Review Session Details")}
      </Text>

      {/* Document Info */}
      <div>
        <Group gap="xs" mb="xs">
          <LocalIcon
            icon="picture-as-pdf-rounded"
            width={18}
            height={18}
            style={{ color: "var(--mantine-color-red-6)" }}
          />
          <Text size="sm" fw={600}>
            {t("groupSigning.steps.review.document", "Document")}
          </Text>
        </Group>
        <div
          style={{
            padding: "12px",
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-default)",
            backgroundColor: "var(--mantine-color-default-hover)",
          }}
        >
          <Text size="sm">{selectedFile.name}</Text>
          {selectedFile.size && (
            <Text size="xs" c="dimmed">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </Text>
          )}
        </div>
      </div>

      <Divider />

      {/* Participants */}
      <div>
        <Group gap="xs" mb="xs">
          <LocalIcon icon="group-rounded" width={18} height={18} />
          <Text size="sm" fw={600}>
            {t("groupSigning.steps.review.participants", "Participants")}
          </Text>
        </Group>
        <Text size="sm">
          {t("groupSigning.steps.review.participantCount", {
            count: participantCount,
            defaultValue: "{{count}} participant(s) will sign in order",
          })}
        </Text>
      </div>

      <Divider />

      {/* Signature Settings */}
      <div>
        <Group gap="xs" mb="xs">
          <LocalIcon icon="draw-rounded" width={18} height={18} />
          <Text size="sm" fw={600}>
            {t(
              "groupSigning.steps.review.signatureSettings",
              "Signature Settings",
            )}
          </Text>
        </Group>
        <Stack gap="xs">
          <Text size="sm">
            <strong>
              {t("groupSigning.steps.review.visibility", "Visibility:")}
            </strong>{" "}
            {signatureSettings.showSignature
              ? t(
                  "groupSigning.steps.review.visible",
                  "Visible on page {{page}}",
                  {
                    page: signatureSettings.pageNumber || 1,
                  },
                )
              : t(
                  "groupSigning.steps.review.invisible",
                  "Invisible (metadata only)",
                )}
          </Text>
          {signatureSettings.showSignature && signatureSettings.reason && (
            <Text size="sm">
              <strong>
                {t("groupSigning.steps.review.reason", "Reason:")}
              </strong>{" "}
              {signatureSettings.reason}
            </Text>
          )}
          {signatureSettings.showSignature && signatureSettings.location && (
            <Text size="sm">
              <strong>
                {t("groupSigning.steps.review.location", "Location:")}
              </strong>{" "}
              {signatureSettings.location}
            </Text>
          )}
          {signatureSettings.showSignature && (
            <Text size="sm">
              <strong>{t("groupSigning.steps.review.logo", "Logo:")}</strong>{" "}
              {signatureSettings.showLogo
                ? t(
                    "groupSigning.steps.review.logoShown",
                    "Stirling PDF logo shown",
                  )
                : t("groupSigning.steps.review.logoHidden", "No logo")}
            </Text>
          )}
        </Stack>
      </div>

      <Divider />

      {/* Due Date */}
      <div>
        <Group gap="xs" mb="xs">
          <LocalIcon icon="calendar-today-rounded" width={18} height={18} />
          <Text size="sm" fw={600}>
            {t("groupSigning.steps.review.dueDate", "Due Date (Optional)")}
          </Text>
        </Group>
        <TextInput
          type="date"
          value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          disabled={disabled}
          placeholder={t(
            "groupSigning.steps.review.dueDatePlaceholder",
            "Select due date...",
          )}
        />
      </div>

      <Group gap="sm" mt="md">
        <Button
          variant="default"
          onClick={onBack}
          leftSection={
            <LocalIcon icon="arrow-back-rounded" width={16} height={16} />
          }
        >
          {t("groupSigning.steps.back", "Back")}
        </Button>
        <Button
          onClick={onSubmit}
          disabled={disabled}
          style={{ flex: 1 }}
          leftSection={<LocalIcon icon="send-rounded" width={16} height={16} />}
          color="green"
        >
          {t("groupSigning.steps.review.send", "Send Signing Requests")}
        </Button>
      </Group>
    </Stack>
  );
};
