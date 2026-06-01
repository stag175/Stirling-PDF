import { useState, useEffect } from "react";
import {
  ActionIcon,
  Button,
  Paper,
  Group,
  NumberInput,
  Slider,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import { Tooltip } from "@app/components/shared/Tooltip";
import LocalIcon from "@app/components/shared/LocalIcon";

interface PdfViewerToolbarProps {
  // Page navigation props (placeholders for now)
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function PdfViewerToolbar({
  currentPage = 1,
  totalPages: _totalPages = 1,
  onPageChange,
}: PdfViewerToolbarProps) {
  const { t } = useTranslation();
  const {
    getScrollState,
    getZoomState,
    getSpreadState,
    scrollActions,
    zoomActions,
    spreadActions,
    registerImmediateZoomUpdate,
    registerImmediateScrollUpdate,
    registerImmediateSpreadUpdate,
    pdfRenderMode,
    cyclePdfRenderMode,
  } = useViewer();

  const scrollState = getScrollState();
  const zoomState = getZoomState();
  const spreadState = getSpreadState();
  const [pageInput, setPageInput] = useState(
    scrollState.currentPage || currentPage,
  );
  const [displayZoomPercent, setDisplayZoomPercent] = useState(
    zoomState.zoomPercent || 140,
  );
  const [isDualPageActive, setIsDualPageActive] = useState(
    spreadState.isDualPage,
  );

  // Register for immediate scroll updates and sync with actual scroll state
  useEffect(() => {
    const unregister = registerImmediateScrollUpdate(
      (currentPage, _totalPages) => {
        setPageInput(currentPage);
      },
    );
    setPageInput(scrollState.currentPage);
    return () => {
      unregister?.();
    };
  }, [registerImmediateScrollUpdate, scrollState.currentPage]);

  // Register for immediate zoom updates and sync with actual zoom state
  useEffect(() => {
    const unregister = registerImmediateZoomUpdate(setDisplayZoomPercent);
    setDisplayZoomPercent(zoomState.zoomPercent || 140);
    return () => {
      unregister?.();
    };
  }, [registerImmediateZoomUpdate, zoomState.zoomPercent]);

  useEffect(() => {
    const unregister = registerImmediateSpreadUpdate((_mode, isDual) => {
      setIsDualPageActive(isDual);
    });
    setIsDualPageActive(spreadState.isDualPage);
    return () => {
      unregister?.();
    };
  }, [registerImmediateSpreadUpdate, spreadState.isDualPage]);

  const handleZoomOut = () => {
    zoomActions.zoomOut();
  };

  const handleZoomIn = () => {
    zoomActions.zoomIn();
  };

  const handlePageNavigation = (page: number) => {
    scrollActions.scrollToPage(page);
    if (onPageChange) {
      onPageChange(page);
    }
    setPageInput(page);
  };

  const handleDualPageToggle = () => {
    spreadActions.toggleSpreadMode();
  };

  const handleFirstPage = () => {
    scrollActions.scrollToFirstPage();
  };

  const handlePreviousPage = () => {
    const { currentPage: cur } = getScrollState();
    if (cur > 1) scrollActions.scrollToPage(cur - 1);
  };

  const handleNextPage = () => {
    const { currentPage: cur, totalPages: tot } = getScrollState();
    if (cur < tot) scrollActions.scrollToPage(cur + 1);
  };

  const handleLastPage = () => {
    scrollActions.scrollToLastPage();
  };

  return (
    <Paper
      radius="xl xl 0 0"
      shadow="sm"
      p={12}
      pb={12}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
        pointerEvents: "auto",
        minWidth: "30rem",
      }}
    >
      {/* First Page Button */}
      <Button
        variant="subtle"
        color="blue"
        size="md"
        px={8}
        radius="xl"
        onClick={handleFirstPage}
        disabled={scrollState.currentPage === 1}
        style={{ minWidth: "2.5rem" }}
        title={t("viewer.firstPage", "First Page")}
      >
        <LocalIcon icon="first-page-rounded" width="1.25rem" height="1.25rem" />
      </Button>

      {/* Previous Page Button */}
      <Button
        variant="subtle"
        color="blue"
        size="md"
        px={8}
        radius="xl"
        onClick={handlePreviousPage}
        disabled={scrollState.currentPage === 1}
        style={{ minWidth: "2.5rem" }}
        title={t("viewer.previousPage", "Previous Page")}
      >
        <LocalIcon
          icon="arrow-back-ios-rounded"
          width="1.25rem"
          height="1.25rem"
        />
      </Button>

      {/* Page Input */}
      <NumberInput
        value={pageInput}
        onChange={(value) => {
          const page = Number(value);
          setPageInput(page);
          if (!isNaN(page) && page >= 1 && page <= scrollState.totalPages) {
            handlePageNavigation(page);
          }
        }}
        min={1}
        max={scrollState.totalPages}
        hideControls
        styles={{
          input: {
            width: 48,
            textAlign: "center",
            fontWeight: 500,
            fontSize: 16,
          },
        }}
      />

      <span style={{ fontWeight: 500, fontSize: 16 }}>
        / {scrollState.totalPages}
      </span>

      {/* Next Page Button */}
      <Button
        variant="subtle"
        color="blue"
        size="md"
        px={8}
        radius="xl"
        onClick={handleNextPage}
        disabled={scrollState.currentPage === scrollState.totalPages}
        style={{ minWidth: "2.5rem" }}
        title={t("viewer.nextPage", "Next Page")}
      >
        <LocalIcon
          icon="arrow-forward-ios-rounded"
          width="1.25rem"
          height="1.25rem"
        />
      </Button>

      {/* Last Page Button */}
      <Button
        variant="subtle"
        color="blue"
        size="md"
        px={8}
        radius="xl"
        onClick={handleLastPage}
        disabled={scrollState.currentPage === scrollState.totalPages}
        style={{ minWidth: "2.5rem" }}
        title={t("viewer.lastPage", "Last Page")}
      >
        <LocalIcon icon="last-page-rounded" width="1.25rem" height="1.25rem" />
      </Button>

      {/* Dual Page Toggle */}
      <Tooltip
        content={
          isDualPageActive
            ? t("viewer.singlePageView", "Single Page View")
            : t("viewer.dualPageView", "Dual Page View")
        }
        position="top"
        arrow
      >
        <Button
          variant={isDualPageActive ? "filled" : "light"}
          color="blue"
          size="md"
          radius="xl"
          onClick={handleDualPageToggle}
          disabled={scrollState.totalPages <= 1}
          style={{ minWidth: "2.5rem" }}
        >
          {isDualPageActive ? (
            <LocalIcon
              icon="description-rounded"
              width="1.25rem"
              height="1.25rem"
            />
          ) : (
            <LocalIcon icon="view-week" width="1.25rem" height="1.25rem" />
          )}
        </Button>
      </Tooltip>

      {/* PDF Render Mode Toggle */}
      <Tooltip
        content={
          pdfRenderMode === "normal"
            ? t("viewer.enableDarkFilter", "Enable Dark Filter")
            : pdfRenderMode === "dark"
              ? t("viewer.enableSepiaFilter", "Enable Sepia Filter")
              : t("viewer.disableColorFilter", "Disable Color Filter")
        }
        position="top"
        arrow
      >
        <Button
          variant={pdfRenderMode !== "normal" ? "filled" : "light"}
          color="blue"
          size="md"
          radius="xl"
          onClick={cyclePdfRenderMode}
          style={{ minWidth: "2.5rem" }}
          aria-label={
            pdfRenderMode === "normal"
              ? t("viewer.enableDarkFilter", "Enable Dark Filter")
              : pdfRenderMode === "dark"
                ? t("viewer.enableSepiaFilter", "Enable Sepia Filter")
                : t("viewer.disableColorFilter", "Disable Color Filter")
          }
        >
          {pdfRenderMode === "normal" && (
            <LocalIcon
              icon="dark-mode-rounded"
              width="1.25rem"
              height="1.25rem"
            />
          )}
          {pdfRenderMode === "dark" && (
            <LocalIcon
              icon="wb-twilight-rounded"
              width="1.25rem"
              height="1.25rem"
            />
          )}
          {pdfRenderMode === "sepia" && (
            <LocalIcon
              icon="wb-sunny-rounded"
              width="1.25rem"
              height="1.25rem"
            />
          )}
        </Button>
      </Tooltip>

      {/* Zoom Controls */}
      <Group gap={4} align="center" style={{ marginLeft: 16 }}>
        <ActionIcon
          variant="subtle"
          color="blue"
          radius="md"
          onClick={handleZoomOut}
          aria-label={t("viewer.zoomOut", "Zoom out")}
        >
          <LocalIcon icon="zoom-out-rounded" width="1.25rem" height="1.25rem" />
        </ActionIcon>
        <Slider
          value={Math.min(Math.max(displayZoomPercent, 20), 500)}
          min={20}
          max={500}
          step={5}
          onChange={(val) => zoomActions.setZoomLevel?.(val / 100)}
          size="xs"
          styles={{
            root: { width: "6rem" },
            thumb: { width: 14, height: 14 },
            track: { height: 3 },
          }}
          label={null}
        />
        <ActionIcon
          variant="subtle"
          color="blue"
          radius="md"
          onClick={handleZoomIn}
          aria-label={t("viewer.zoomIn", "Zoom in")}
        >
          <LocalIcon icon="zoom-in-rounded" width="1.25rem" height="1.25rem" />
        </ActionIcon>
        <span
          style={{
            minWidth: "2.5rem",
            textAlign: "center",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {displayZoomPercent}%
        </span>
      </Group>
    </Paper>
  );
}
