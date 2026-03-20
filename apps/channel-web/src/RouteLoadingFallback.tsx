export function RouteLoadingFallback() {
  return (
    <main className="package-shell">
      <section className="package-panel">
        <p className="eyebrow">Loading</p>
        <h1>Preparing route bundle...</h1>
        <p className="package-note">The page is being loaded on demand.</p>
      </section>
    </main>
  );
}
