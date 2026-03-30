/**
 * NotificationBanner - Displays test-ready notifications in roadmap dashboard (FR-116 J2)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type { PipelineNotification } from '@/lib/api/admin-api';

const NOTIF_KEY = ['pipeline-notifications'];

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTIF_KEY,
    queryFn: async (): Promise<PipelineNotification[]> => {
      try {
        const res = await adminApi.getNotifications(true);
        return res.data ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => adminApi.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIF_KEY });
    },
  });

  return {
    notifications: query.data ?? [],
    markRead: (id: string) => markRead.mutateAsync(id),
  };
}

interface NotificationBannerProps {
  onNavigateToFeature?: (featureId: string, tab: string) => void;
}

export function NotificationBanner({ onNavigateToFeature }: NotificationBannerProps) {
  const { notifications, markRead } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {notifications.slice(0, 3).map((n) => (
        <div
          key={n.id}
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-sm ${
            n.type === 'test_ready'
              ? 'bg-teal-50 border-teal-200 text-teal-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">{n.type === 'test_ready' ? '\u2705' : '\u26A0\uFE0F'}</span>
            <div className="min-w-0">
              <span className="font-medium">{n.title}</span>
              {n.message && <span className="text-xs opacity-75 ml-2">{n.message}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToFeature && (
              <button
                onClick={() => {
                  onNavigateToFeature(n.feature_id, 'test');
                  markRead(n.id).catch(() => {});
                }}
                className="px-2 py-1 text-xs font-medium bg-white border rounded hover:bg-gray-50"
              >
                Open Test Panel
              </button>
            )}
            <button
              onClick={() => markRead(n.id).catch(() => {})}
              className="text-xs opacity-60 hover:opacity-100"
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
