// src/App.tsx
import { Button } from "./ui/Button";
import { projectsApi } from "./api";
import { Container } from "./ui/Container";
import { Resizable } from "./ui/Resizable";
import { Tabs } from "./ui/Tabs";
import { useState } from "react";
import { Play, Save as SaveIcon, Settings as SettingsIcon, FolderCog } from "lucide-react";
import { SettingsModal } from "./components/SettingsModal";
import { ProjectSettingsModal } from "./components/ProjectSettingsModal";
import { ProjectSelector } from "./components/ProjectSelector";
import { GameView } from "./components/GameView";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const handleSelectProject = (project: string) => {
    setCurrentProject(project || null);
    setGameUrl(null);
    setBuildError(null);
  };

  const runGame = async () => {
    if (!currentProject) return;
    setIsBuilding(true);
    setBuildError(null);
    setGameUrl(null);
    try {
      const result = await projectsApi.build(currentProject);
      if (result.url) {
        setGameUrl(result.url);
      } else {
        setBuildError(result.error ?? "Build did not return a URL");
      }
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Build failed");
    } finally {
      setIsBuilding(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProject) return;

    await projectsApi.remove(currentProject);

    const { projects } = await projectsApi.list();
    setCurrentProject(projects[0] ?? null);

    setGameUrl(null);
    setBuildError(null);
  };

  return (
    <main className="flex h-screen min-h-screen flex-col gap-3 bg-[var(--color-bg)] p-3 text-[var(--color-text)]">
      <div className="flex shrink-0 items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold tracking-wide text-[var(--color-text)]">
            Editor
          </span>
          <ProjectSelector currentProject={currentProject} onSelect={handleSelectProject} />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={runGame} disabled={!currentProject || isBuilding}>
            <span className="flex items-center gap-1.5">
              <Play size={16} />
              {isBuilding ? "Building…" : "Run"}
            </span>
          </Button>
          <Button>
            <span className="flex items-center gap-1.5">
              <SaveIcon size={16} />
              Save
            </span>
          </Button>
          <Button
            onClick={() => setProjectSettingsOpen(true)}
            disabled={!currentProject}
            aria-label="Project settings"
          >
            <FolderCog size={16} />
          </Button>
          <Button onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <SettingsIcon size={16} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <Resizable axis="x" handle="end" defaultSize={224} min={160} max={480}>
          <Container
            title="Explorer"
            description="Browse project files, scenes, and assets."
            bodyClassName="p-0"
          >
            <Tabs
              tabs={[
                { id: "files", label: "Files", content: <PlaceholderPanel label="File tree" /> },
                { id: "search", label: "Search", content: <PlaceholderPanel label="Search results" /> },
              ]}
            />
          </Container>
        </Resizable>

        <div className="min-w-0 flex-1">
          <Container title="Viewport" bodyClassName="p-0">
            <GameView
              project={currentProject}
              gameUrl={gameUrl}
              isBuilding={isBuilding}
              error={buildError}
            />
          </Container>
        </div>

        <Resizable axis="x" handle="start" defaultSize={256} min={200} max={480}>
          <Container
            title="Inspector"
            description="Edit properties of the currently selected object."
            bodyClassName="p-0"
          >
            <Tabs
              tabs={[
                { id: "properties", label: "Properties", content: <PlaceholderPanel label="Properties" /> },
                { id: "style", label: "Style", content: <PlaceholderPanel label="Style" /> },
              ]}
            />
          </Container>
        </Resizable>
      </div>

      <Resizable axis="y" handle="start" defaultSize={160} min={100} max={400}>
        <Container
          title="Console"
          description="Logs, warnings, and errors emitted while running."
          bodyClassName="p-0"
        >
          <Tabs
            tabs={[
              { id: "output", label: "Output", content: <PlaceholderPanel label="Output log" /> },
              { id: "problems", label: "Problems", content: <PlaceholderPanel label="Problems" /> },
              { id: "assets", label: "Assets", content: <PlaceholderPanel label="Assets" /> },
            ]}
          />
        </Container>
      </Resizable>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {currentProject && (
        <ProjectSettingsModal
          open={projectSettingsOpen}
          onClose={() => setProjectSettingsOpen(false)}
          projectName={currentProject}
          onDelete={handleDeleteProject}
      />
      )}
    </main>
  );
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-xs text-[var(--color-text-faint)]">
      {label}
    </div>
  );
}

export default App;