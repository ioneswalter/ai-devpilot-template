/**
 * RoadmapHeader - Top banner with title, centered stats, and action buttons.
 */

import { useNavigate } from '@tanstack/react-router';
import type { RoadmapStats } from './useRoadmapData';

interface RoadmapHeaderProps {
  stats: RoadmapStats;
  isFiltered: boolean;
  isAdmin: boolean;
  isMember: boolean;
  onOpenReleases?: () => void;
  onOpenFixTasks?: () => void;
  isUnrestricted?: boolean;
}

export function RoadmapHeader({
  stats,
  isFiltered,
  isAdmin,
  isMember,
  onOpenReleases,
  onOpenFixTasks,
  isUnrestricted,
}: RoadmapHeaderProps) {
  const navigate = useNavigate();

  return (
    <section className="bg-gradient-to-b from-blue-600 to-blue-700 text-white py-4 lg:py-5">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3 max-w-6xl mx-auto">
          {/* Left: Title */}
          <div className="shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl lg:text-2xl font-bold">AI DevPilot</h1>
                <p className="text-xs lg:text-sm text-blue-200">From Idea to Feature,</p>
                <p className="text-xs lg:text-sm text-blue-200">Powered by AI.</p>
                <p className="text-xs lg:text-sm text-blue-300 font-medium">
                  Think It. Spec It. Ship It.
                </p>
              </div>
              {/* Mobile action buttons — 3x2 grid aligned right */}
              <div className="md:hidden grid grid-cols-3 gap-1 shrink-0">
                {isAdmin && (
                  <button
                    onClick={() => navigate({ to: '/strategic-plan' })}
                    className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium text-center"
                  >
                    Strategy
                  </button>
                )}
                {isAdmin && onOpenReleases && (
                  <button
                    onClick={onOpenReleases}
                    className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium text-center"
                  >
                    Releases
                  </button>
                )}
                {isAdmin && onOpenFixTasks && (
                  <button
                    onClick={onOpenFixTasks}
                    className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium text-center"
                  >
                    Fix Tasks
                  </button>
                )}
                {isAdmin ? (
                  <button
                    onClick={() => navigate({ to: '/admin/devpilot' })}
                    className="px-2 py-1.5 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded text-[10px] font-medium text-center"
                  >
                    + Ideation
                  </button>
                ) : isMember ? (
                  <button
                    onClick={() => alert('Coming soon!')}
                    className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium text-center"
                  >
                    + Ideation
                  </button>
                ) : null}
                {isAdmin && (
                  <>
                    <button
                      onClick={() => navigate({ to: '/devpilot-architecture' })}
                      className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium text-center"
                    >
                      Arch
                    </button>
                    <button
                      onClick={() => navigate({ to: '/devpilot-flowchart' })}
                      className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium text-center"
                    >
                      Blueprint
                    </button>
                    <button
                      onClick={() => navigate({ to: '/devpilot-prompts' })}
                      className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium text-center"
                    >
                      Playbook
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center: Stats */}
          <div className="flex items-center justify-center gap-4 lg:gap-6 flex-1">
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold">{stats.total}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">
                {isFiltered ? 'Filtered' : 'Total'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-blue-200">{stats.proposed}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">Proposed</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-violet-300">{stats.reviewed}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">Reviewed</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-yellow-300">{stats.specified}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">Specified</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-sky-300">{stats.inDevelopment}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">In Dev</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-indigo-300">
                {stats.inAcceptance}
              </div>
              <div className="text-[10px] lg:text-xs text-blue-200">Acceptance</div>
            </div>
            <div className="text-center">
              <div className="text-lg lg:text-xl font-bold text-green-300">{stats.released}</div>
              <div className="text-[10px] lg:text-xs text-blue-200">Released</div>
            </div>
          </div>

          {/* Right: Action buttons (desktop) — 2 rows x 3 columns */}
          <div className="hidden md:grid grid-cols-3 gap-1.5 shrink-0">
            {isAdmin && (
              <button
                onClick={() => navigate({ to: '/strategic-plan' })}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Strategy
              </button>
            )}
            {isAdmin && onOpenReleases && (
              <button
                onClick={onOpenReleases}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
                Releases
              </button>
            )}
            {isAdmin && onOpenFixTasks && (
              <button
                onClick={onOpenFixTasks}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Fix Tasks
              </button>
            )}
            {isAdmin ? (
              <button
                onClick={() => navigate({ to: '/admin/devpilot' })}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-lg transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Ideation
              </button>
            ) : isMember ? (
              <button
                onClick={() => alert('Coming soon!')}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
              >
                Ideation
              </button>
            ) : null}
            {isAdmin && (
              <button
                onClick={() => navigate({ to: '/devpilot-architecture' })}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                Architecture
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => navigate({ to: '/devpilot-flowchart' })}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
                Blueprint
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => navigate({ to: '/devpilot-prompts' })}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                Playbook
              </button>
            )}
          </div>
        </div>
      </div>
      {isUnrestricted && isAdmin && (
        <div className="container mx-auto px-4 max-w-6xl mt-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/20 border border-amber-300/30 rounded-lg text-xs text-amber-100">
            <span>{'\u26A0'}</span>
            <span>
              No delivery team roles configured yet. All panels are visible. Go to Admin → Delivery
              Team to assign roles.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
