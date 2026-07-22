import { Resizable } from "../../ui/Resizable";
import { Container } from "../../ui/Container";
import { Tabs } from "../../ui/Tabs";
import { GameConsolePanel } from "../../components/panels/GameConsolePanel";

export function OutputPanel() {
  return (
    <Resizable axis="y" handle="start" defaultSize={260}>
      <Container title="Output" bodyClassName="p-0">
        <Tabs
          tabs={[
            { id: "console", label: "Console", content: <GameConsolePanel /> },
            { id: "assets", label: "Assets", content: <PlaceholderPanel label="Assets" /> },
          ]}
        />
      </Container>
    </Resizable>
  );
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-xs text-[var(--color-text-faint)]">
      {label}
    </div>
  );
}