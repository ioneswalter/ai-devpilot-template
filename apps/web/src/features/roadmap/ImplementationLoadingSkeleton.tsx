/**
 * ImplementationLoadingSkeleton — Pulse animation skeleton shown while loading.
 */

export function ImplementationLoadingSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="flex-1 p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="border rounded-lg p-3 animate-pulse">
            <div className="flex gap-2 mb-2">
              <div className="h-5 w-16 bg-gray-200 rounded" />
              <div className="h-5 w-12 bg-gray-100 rounded" />
            </div>
            <div className="h-4 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
