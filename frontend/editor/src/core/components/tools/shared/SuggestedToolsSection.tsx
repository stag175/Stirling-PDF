import React from "react";
import { Stack, Text, Divider, Card, Group, Anchor } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useSuggestedTools } from "@app/hooks/useSuggestedTools";
import { ToolIcon } from "@app/components/shared/ToolIcon";
import LocalIcon from "@app/components/shared/LocalIcon";

export function SuggestedToolsSection(): React.ReactElement {
  const { t } = useTranslation();
  const suggestedTools = useSuggestedTools();

  return (
    <Stack gap="md">
      <Divider />

      <Text size="lg" fw={600}>
        {t("editYourNewFiles", "Edit your new file(s)")}
      </Text>

      <Stack gap="xs">
        {suggestedTools.map((tool) => {
          return (
            <Anchor
              key={tool.id}
              href={tool.href}
              onClick={tool.onClick}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card p="sm" withBorder style={{ cursor: "pointer" }}>
                <Group gap="xs">
                  <ToolIcon
                    icon={
                      <LocalIcon
                        icon={tool.icon}
                        width="1.5rem"
                        height="1.5rem"
                      />
                    }
                  />
                  <Text size="sm" fw={500}>
                    {tool.title}
                  </Text>
                </Group>
              </Card>
            </Anchor>
          );
        })}
      </Stack>
    </Stack>
  );
}
