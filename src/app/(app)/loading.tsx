export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-2 h-8 w-64 rounded-lg bg-muted" />
      <div className="mb-5 h-4 w-96 max-w-full rounded bg-muted" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="mt-3 h-96 rounded-xl bg-muted" />
    </div>
  );
}
