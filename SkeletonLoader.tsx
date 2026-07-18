export function RestaurantCardSkeleton() {
  return (
    <div className="premium-card rounded-2xl p-6 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 bg-gradient-to-br from-app-bg-tertiary to-app-bg-secondary rounded-xl skeleton-shimmer" />
        <div className="flex-1 space-y-3">
          <div className="h-6 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-lg w-3/4 skeleton-shimmer" />
          <div className="h-4 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-1/2 skeleton-shimmer" />
          <div className="h-4 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-2/3 skeleton-shimmer" />
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div className="h-10 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-xl flex-1 skeleton-shimmer" />
        <div className="h-10 w-10 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-xl skeleton-shimmer" />
      </div>
    </div>
  );
}

export function TableMapSkeleton() {
  return (
    <div className="premium-card rounded-2xl p-6 animate-pulse space-y-4">
      <div className="space-y-3">
        <div className="h-6 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-lg w-1/3 skeleton-shimmer" />
        <div className="h-4 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-1/2 skeleton-shimmer" />
      </div>

      <div className="relative w-full h-[500px] bg-gradient-to-br from-app-bg-tertiary to-app-bg-secondary rounded-xl overflow-hidden skeleton-shimmer">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 mx-auto bg-app-bg-tertiary rounded-full skeleton-shimmer" />
            <div className="h-4 bg-app-bg-tertiary rounded w-32 mx-auto skeleton-shimmer" />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="h-10 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-xl flex-1 skeleton-shimmer" />
        <div className="h-10 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-xl flex-1 skeleton-shimmer" />
      </div>
    </div>
  );
}

export function ReservationCardSkeleton() {
  return (
    <div className="premium-card rounded-2xl p-6 animate-pulse space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="h-6 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-lg w-2/3 skeleton-shimmer" />
          <div className="h-4 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-1/2 skeleton-shimmer" />
        </div>
        <div className="w-20 h-8 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-full skeleton-shimmer" />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-app-border">
        <div className="space-y-2">
          <div className="h-3 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-16 skeleton-shimmer" />
          <div className="h-5 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-24 skeleton-shimmer" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-16 skeleton-shimmer" />
          <div className="h-5 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded w-24 skeleton-shimmer" />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <div className="h-10 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-xl flex-1 skeleton-shimmer" />
        <div className="h-10 bg-gradient-to-r from-app-bg-tertiary to-app-bg-secondary rounded-xl flex-1 skeleton-shimmer" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 3, type = 'restaurant' }: { count?: number; type?: 'restaurant' | 'reservation' }) {
  const SkeletonComponent = type === 'restaurant' ? RestaurantCardSkeleton : ReservationCardSkeleton;

  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            animation: `fadeIn 0.5s ease-in-out ${i * 0.1}s both`,
          }}
        >
          <SkeletonComponent />
        </div>
      ))}
    </div>
  );
}
