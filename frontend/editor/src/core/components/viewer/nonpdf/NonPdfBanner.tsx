import { Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";

interface NonPdfBannerProps {
  onConvertToPdf?: () => void;
}

export function NonPdfBanner({ onConvertToPdf }: NonPdfBannerProps) {
  const { t } = useTranslation();

  if (!onConvertToPdf) return null;

  return (
    <Button
      size="xs"
      variant="light"
      color="orange"
      leftSection={
        <LocalIcon
          icon="picture-as-pdf-rounded"
          width="0.9rem"
          height="0.9rem"
        />
      }
      onClick={onConvertToPdf}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
      }}
    >
      {t("viewer.nonPdf.convertToPdf")}
    </Button>
  );
}
