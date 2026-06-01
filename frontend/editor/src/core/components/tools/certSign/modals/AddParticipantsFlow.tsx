import { useState } from "react";
import { Modal, Stack, TextInput, Button, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import UserSelector from "@app/components/shared/UserSelector";
import LocalIcon from "@app/components/shared/LocalIcon";

interface AddParticipantsFlowProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (userIds: number[], defaultReason?: string) => Promise<void>;
}

export const AddParticipantsFlow: React.FC<AddParticipantsFlowProps> = ({
  opened,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [defaultReason, setDefaultReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setSelectedUserIds([]);
    setDefaultReason("");
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(selectedUserIds, defaultReason.trim() || undefined);
      handleClose();
    } catch (error) {
      console.error("Failed to add participants:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t(
        "certSign.collab.sessionDetail.addParticipants",
        "Add Participants",
      )}
      size="lg"
    >
      <Stack gap="md">
        <UserSelector
          value={selectedUserIds}
          onChange={setSelectedUserIds}
          placeholder={t(
            "certSign.collab.sessionDetail.selectUsers",
            "Select users...",
          )}
        />

        <TextInput
          label={t("certSign.reason", "Default Reason")}
          description={t(
            "certSign.collab.addParticipants.reasonHelp",
            "Pre-set a signing reason for these participants (optional, they can override when signing)",
          )}
          value={defaultReason}
          onChange={(e) => setDefaultReason(e.currentTarget.value)}
          placeholder={t(
            "certSign.collab.addParticipants.reasonPlaceholder",
            "e.g. Approval, Review...",
          )}
          size="sm"
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={selectedUserIds.length === 0}
            leftSection={
              <LocalIcon icon="add-rounded" width={16} height={16} />
            }
            color="green"
          >
            {t(
              "certSign.collab.addParticipants.add",
              "Add {{count}} Participant(s)",
              {
                count: selectedUserIds.length,
              },
            )}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
