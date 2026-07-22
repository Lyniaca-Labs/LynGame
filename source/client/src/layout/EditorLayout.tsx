import { useState } from "react";
import {
  Play,
  Save as SaveIcon,
  Settings as SettingsIcon,
  FolderCog,
} from "lucide-react";

import { useProject } from "../context/ProjectContext";
import { SceneEditorProvider, useSceneEditor } from "../context/SceneEditorContext";
import { GameConsoleProvider } from "../context/GameConsoleContext";
import { projectsApi } from "../api";

import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Resizable } from "../ui/Resizable";

import { Explorer } from "./sections";
import { Inspector } from "./sections";

import { SettingsModal } from "../components/SettingsModal";
import { ProjectSettingsModal } from "../components/ProjectSettingsModal";
import { ProjectSelector } from "../components/ProjectSelector";
import { GameView } from "./sections/GameView";
import { OutputPanel } from "./sections/OutputPanel";

export function EditorLayout() {
  return (
    <EditorLayoutContent />
  );
}

function EditorLayoutContent() {
  const { currentProject, openProject, deleteProject } = useProject();
  const { save, dirty, saving: sceneSaving } = useSceneEditor();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);

  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

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
        setBuildError(result.error ?? "Build failed");
      }
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Build failed");
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <main className="flex h-screen min-h-screen flex-col gap-3 bg-[var(--color-bg)] p-3 text-[var(--color-text)]">
      <div className="flex shrink-0 items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">Editor</span>
          <ProjectSelector currentProject={currentProject} onSelect={openProject} />
        </div>

        <div className="flex gap-2">
          <Button onClick={runGame} disabled={!currentProject || isBuilding}>
            <Play size={16} />
            {isBuilding ? "Building..." : "Run"}
          </Button>

          <Button onClick={save} disabled={!dirty || sceneSaving}>
            <SaveIcon size={16} />
            {sceneSaving ? "Saving..." : dirty ? "Save" : "Saved"}
          </Button>

          <Button disabled={!currentProject} onClick={() => setProjectSettingsOpen(true)}>
            <FolderCog size={16} />
          </Button>

          <Button onClick={() => setSettingsOpen(true)}>
            <SettingsIcon size={16} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <Resizable axis="x" handle="end" defaultSize={224}>
          <Explorer />
        </Resizable>

        <div className="flex-1 min-w-0">
          <Container title="Viewport">
            <GameView
              project={currentProject}
              gameUrl={gameUrl}
              isBuilding={isBuilding}
              error={buildError}
            />
          </Container>
        </div>

        <Resizable axis="x" handle="start" defaultSize={300}>
          <Inspector />
        </Resizable>
      </div>

      <OutputPanel />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {currentProject && (
        <ProjectSettingsModal
          open={projectSettingsOpen}
          onClose={() => setProjectSettingsOpen(false)}
          projectName={currentProject}
          onDelete={deleteProject}
        />
      )}
    </main>
  );
}