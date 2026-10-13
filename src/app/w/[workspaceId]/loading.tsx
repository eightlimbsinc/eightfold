export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-6 w-48 rounded bg-line" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-5 h-72 rounded-lg border border-line bg-surface" />
    </div>
  );
}
