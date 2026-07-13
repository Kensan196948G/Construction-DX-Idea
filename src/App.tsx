const designPath = "/design/construction-dx-idea.html";

export function App() {
  return (
    <main className="standaloneDesignShell" aria-label="Construction DX Idea">
      <iframe
        className="standaloneDesignFrame"
        title="Construction DX Idea"
        src={designPath}
      />
    </main>
  );
}
