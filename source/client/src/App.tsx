import { ProjectProvider } from "./context/ProjectContext";
import { EditorLayout } from "./layout/EditorLayout";

function App() {
  return (
    <ProjectProvider>
      <EditorLayout />
    </ProjectProvider>
  );
}

export default App;