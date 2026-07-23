import { ProjectProvider } from "./context/ProjectContext";
import { GameConsoleProvider } from "./context/GameConsoleContext";
import { SceneEditorProvider } from "./context/SceneEditorContext";
import { DialogProvider } from "./context/DialogContext";
import { EditorLayout } from "./layout/EditorLayout";

function App() {
  return (
    <DialogProvider>
      <ProjectProvider>
        <GameConsoleProvider>
          <SceneEditorProvider>
            <EditorLayout />
          </SceneEditorProvider>
        </GameConsoleProvider>
      </ProjectProvider>    
    </DialogProvider>
  );
}

export default App;