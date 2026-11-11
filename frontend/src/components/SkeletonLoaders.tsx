interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`glass-card-light p-6 ${className}`}>
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3 rounded" />
        <Skeleton className="h-4 w-1/4 rounded" />
        <Skeleton className="h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

export function SkeletonStatsGrid() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card-light p-4 text-center">
          <Skeleton className="w-6 h-6 mx-auto mb-2 rounded-full" />
          <Skeleton className="w-16 h-8 mx-auto mb-1 rounded" />
          <Skeleton className="w-20 h-3 mx-auto rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonLeaveForm() {
  return (
    <div className="glass-card-light p-6">
      <Skeleton className="h-6 w-1/4 mb-4 rounded" />
      <form className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Skeleton className="h-3 w-24 mb-1 rounded" />
            <Skeleton className="h-10 w-full rounded" />
          </div>
          <div>
            <Skeleton className="h-3 w-24 mb-1 rounded" />
            <Skeleton className="h-10 w-full rounded" />
          </div>
        </div>
        <div>
          <Skeleton className="h-3 w-32 mb-1 rounded" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
        <div>
          <Skeleton className="h-3 w-20 mb-1 rounded" />
          <Skeleton className="h-20 w-full rounded" />
        </div>
        <Skeleton className="h-10 w-full rounded" />
      </form>
    </div>
  );
}

export function SkeletonScheduleList({ count = 3 }: { count?: number }) {
  return (
    <div className="glass-card-light p-6">
      <Skeleton className="h-6 w-1/3 mb-4 rounded" />
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
            <div>
              <Skeleton className="h-4 w-32 rounded mb-1" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
            <Skeleton className="h-4 w-24 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonHistoryList({ count = 5 }: { count?: number }) {
  return (
    <div className="glass-card-light p-6">
      <Skeleton className="h-6 w-1/4 mb-4 rounded" />
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="py-3 flex items-center justify-between">
            <div>
              <Skeleton className="h-4 w-32 rounded mb-1" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonFullSchedule({ count = 4 }: { count?: number }) {
  return (
    <div className="glass-card-light p-6">
      <Skeleton className="h-6 w-1/3 mb-4 rounded" />
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
            <div className="flex-1 min-w-0">
              <Skeleton className="h-4 w-48 rounded mb-1 truncate" />
              <Skeleton className="h-3 w-56 rounded truncate" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}