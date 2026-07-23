import { useEffect, useRef, useState } from "react"; 
import {
  Play,
  Pause,
  Save as SaveIcon,
  Settings as SettingsIcon,
  FolderCog,
} from "lucide-react";

import { useProject } from "../context/ProjectContext";
import { SceneEditorProvider, useSceneEditor } from "../context/SceneEditorContext";
import { GameConsoleProvider } from "../context/GameConsoleContext";
import { projectsApi } from "../api";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Resizable } from "../ui/Resizable";

import { Explorer } from "./sections";
import { Inspector } from "./sections";

import { SettingsModal } from "../components/SettingsModal";
import { ProjectSettingsModal } from "../components/ProjectSettingsModal";
import { ProjectSelector } from "../components/ProjectSelector";
import { GameView, type GameViewHandle } from "./sections/GameView";
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

  const [buildUrl, setBuildUrl] = useState<string | null>(null);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  // Some build endpoints return the same URL on every build (e.g. a
  // fixed output path), so `buildUrl` alone doesn't reliably change on
  // each build. This counter always increments, so GameView can force a
  // preview-iframe reload every time a build actually happens.
  const [buildVersion, setBuildVersion] = useState(0);

  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const gameViewRef = useRef<GameViewHandle>(null);
  window.gameViewRef = gameViewRef as React.RefObject<GameViewHandle>;

  // const runGame = () => {
  //   if (!buildUrl) return;

  //   setGameUrl(null); // force iframe reload
  //   setBuildUrl(null);
  //   setBuildError(null);

  //   setIsPaused(false);
  //   setGameUrl(buildUrl);
  // };

  const runGame = async () => {
    if (!currentProject || !buildUrl) return;

    setIsBuilding(true);
    // setBuildError(null);

    try {
      const result = await projectsApi.build(currentProject);

      if (result.url) {
        setGameUrl(result.url);
        setIsPaused(false);
      } else {
        setBuildError(result.error ?? "Build failed");
      }
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Build failed");
    } finally {
      setIsBuilding(false);
    }
  };

  const build = async () => {
    if (!currentProject) return;
    setIsBuilding(true);

    try {
      const result = await projectsApi.build(currentProject);

      if (result.url) {
        setBuildUrl(result.url);
        setBuildVersion((v) => v + 1);
      }
    } finally {
      setIsBuilding(false);
    }
  };

  useEffect(() => {
    build();
  }, [currentProject]);


  const handleInspectorEdit = async () => {
    // await build();
    // window.dispatchEvent(new Event("entity-preview-refresh"));
  };

  // Rebuild after a save, then tell every EntityPreview to refetch. A
  // prefab-only edit doesn't change the selected entity's own JSON, so
  // EntityPreview can't detect it just by diffing `entity` — it needs
  // this explicit nudge once the new build is ready.
  const handleSave = async () => {
    await save();
    await build();
    window.dispatchEvent(new Event("entity-preview-refresh"));
  };

  const togglePause = () => {
    if (isPaused) {
      gameViewRef.current?.unpause();
    } else {
      gameViewRef.current?.pause();
    }
    setIsPaused((p) => !p);
  };

  // Central place for editor-wide shortcuts. Add more here as the editor
  // grows — each entry preventDefaults regardless of `disabled`, so browser
  // defaults (e.g. Ctrl+S's save-page-dialog) never leak through.
  useKeyboardShortcuts([
    {
      key: "s",
      ctrl: true,
      handler: handleSave,
      disabled: !dirty || sceneSaving,
    },
    {
      key: "Enter",
      ctrl: true,
      handler: runGame,
      disabled: !currentProject || isBuilding,
    },
    {
      key: "p",
      ctrl: true,
      handler: togglePause,
      disabled: !gameUrl,
    },
    {
      key: "r",
      ctrl: true,
      handler: () => window.location.reload(),
      disabled: false,
    }
  ]);

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

          <Button onClick={togglePause} disabled={!gameUrl}>
            <Pause size={16} />
            {isPaused ? "Resume" : "Pause"}
          </Button>

          <Button onClick={handleSave} disabled={!dirty || sceneSaving}>
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
              ref={gameViewRef}
              project={currentProject}
              gameUrl={gameUrl}
              buildUrl={buildUrl}
              buildVersion={buildVersion}
              isBuilding={isBuilding}
              error={buildError}
            />
          </Container>
        </div>

        <Resizable axis="x" handle="start" defaultSize={300}>
          <Inspector onEdit={handleInspectorEdit} />
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