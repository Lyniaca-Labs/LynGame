import { ProjectProvider } from "./context/ProjectContext";
import { GameConsoleProvider } from "./context/GameConsoleContext";
import { SceneEditorProvider } from "./context/SceneEditorContext";
import { EditorLayout } from "./layout/EditorLayout";

function App() {
  return (
    <ProjectProvider>
      <GameConsoleProvider>
        <SceneEditorProvider>
          <EditorLayout />
        </SceneEditorProvider>
      </GameConsoleProvider>
    </ProjectProvider>
  );
}

export default App;