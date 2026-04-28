/**
 * ImplementationLoadingSkeleton — Pulse animation skeleton shown while loading.
 */

export function ImplementationLoadingSkeleton() {
  return (
    <div className="flex flex-col min-h-[400px]">
      {/* Header skeleton */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 w-16 bg-blue-100 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="h-3 w-36 bg-gray-100 rounded animate-pulse" />
      </div>

      {/* Summary skeleton */}
      <div className="p-4 space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 animate-pulse">
          <div className="h-3 w-16 bg-blue-200 rounded mb-2" />
          <div className="h-4 w-full bg-blue-100 rounded mb-1" />
          <div className="h-4 w-3/4 bg-blue-100 rounded" />
        </div>

        {/* Task label skeleton */}
        <div className="h-3 w-40 bg-gray-200 rounded animate-pulse" />

        {/* Task card skeletons */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border rounded-lg p-3 animate-pulse">
            <div className="flex gap-2 mb-2">
              <div className="h-5 w-14 bg-gray-200 rounded" />
              <div className="h-5 w-10 bg-gray-100 rounded" />
            </div>
            <div className="h-4 w-3/4 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-1/2 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-full bg-gray-50 rounded" />
          </div>
        ))}
      </div>

      {/* Footer skeleton */}
      <div className="border-t p-3 flex items-center justify-between animate-pulse">
        <div className="h-3 w-48 bg-gray-200 rounded" />
        <div className="h-8 w-16 bg-gray-200 rounded" />
      </div>
    </div>
  );
}
