/**
 * RoadmapHeader - Top banner with title, stats, and ideation link.
 */

import { useNavigate } from '@tanstack/react-router';
import type { RoadmapStats } from './useRoadmapData';

interface RoadmapHeaderProps {
  stats: RoadmapStats;
  isFiltered: boolean;
  isAdmin: boolean;
  isMember: boolean;
  onOpenReleases?: () => void;
}

export function RoadmapHeader({ stats, isFiltered, isAdmin, isMember, onOpenReleases }: RoadmapHeaderProps) {
  const navigate = useNavigate();

  const ideationButton = isAdmin ? (
    <button
      onClick={() => navigate({ to: '/admin/devpilot' })}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-lg transition-colors text-xs font-medium"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Ideation
    </button>
  ) : isMember ? (
    <button
      onClick={() => alert('Coming soon!')}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
    >
      Ideation
    </button>
  ) : null;

  return (
    <section className="bg-gradient-to-b from-blue-600 to-blue-700 text-white py-4 lg:py-5">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 max-w-6xl mx-auto">
          <div className="flex items-center justify-between md:block">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">AI DevPilot</h1>
              <p className="text-xs lg:text-sm text-blue-200">Product roadmap &amp; feature pipeline</p>
            </div>
            {/* Mobile action buttons */}
            {(ideationButton || (isAdmin && onOpenReleases)) && (
              <div className="md:hidden flex items-center gap-2">
                {isAdmin && onOpenReleases && (
                  <button
                    onClick={onOpenReleases}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
                  >
                    Releases
                  </button>
                )}
                {isAdmin ? (
                  <button
                    onClick={() => navigate({ to: '/admin/devpilot' })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Ideation
                  </button>
                ) : isMember ? (
                  <button
                    onClick={() => alert('Coming soon!')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
                  >
                    Ideation
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold">{stats.total}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">{isFiltered ? 'Filtered' : 'Total'}</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-green-300">{stats.released}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">Released</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-sky-300">{stats.inDevelopment}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">In Dev</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-yellow-300">{stats.approved}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">Approved</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-blue-200">{stats.proposed}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">Proposed</div>
            </div>
            {/* Desktop action buttons */}
            <div className="hidden md:flex items-center gap-2">
              {isAdmin && onOpenReleases && (
                <button
                  onClick={onOpenReleases}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Releases
                </button>
              )}
              {ideationButton}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
