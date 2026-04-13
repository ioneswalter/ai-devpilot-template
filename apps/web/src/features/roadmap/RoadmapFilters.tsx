/**
 * RoadmapFilters - Search bar, view toggle, and filter dropdowns.
 */

import { ViewToggle } from '../../components/roadmap/ViewToggle';
import type {
  FilterStatus,
  FilterPriority,
  FilterType,
  FilterCategory,
  FilterSection,
} from './roadmap-helpers';

interface RoadmapFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  viewMode: 'list' | 'kanban';
  onViewModeChange: (mode: 'list' | 'kanban') => void;
  filterStatus: FilterStatus;
  onFilterStatusChange: (value: FilterStatus) => void;
  filterType: FilterType;
  onFilterTypeChange: (value: FilterType) => void;
  filterPriority: FilterPriority;
  onFilterPriorityChange: (value: FilterPriority) => void;
  filterCategory: FilterCategory;
  onFilterCategoryChange: (value: FilterCategory) => void;
  filterSection: FilterSection;
  onFilterSectionChange: (value: FilterSection) => void;
  availableSections: string[];
  isAdmin: boolean;
  filteredCount: number;
  totalCount: number;
  onClearFilters: () => void;
}

export function RoadmapFilters({
  searchTerm,
  onSearchChange,
  viewMode,
  onViewModeChange,
  filterStatus,
  onFilterStatusChange,
  filterType,
  onFilterTypeChange,
  filterPriority,
  onFilterPriorityChange,
  filterCategory,
  onFilterCategoryChange,
  filterSection,
  onFilterSectionChange,
  availableSections,
  isAdmin,
  filteredCount,
  totalCount,
  onClearFilters,
}: RoadmapFiltersProps) {
  const hasActiveFilters = filterStatus !== 'all' || filterType !== 'all' || filterPriority !== 'all' || filterCategory !== 'all' || filterSection !== 'all';

  return (
    <section className="py-3 lg:py-4 bg-white border-b sticky top-[73px] z-40">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-3 max-w-6xl mx-auto">
          {/* Search + View Toggle */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Search features..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            <ViewToggle view={viewMode} onViewChange={onViewModeChange} />
          </div>

          {/* Filter dropdowns row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {/* Status */}
            <select
              value={filterStatus}
              onChange={(e) => onFilterStatusChange(e.target.value as FilterStatus)}
              className={`px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                filterStatus !== 'all' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white text-gray-700'
              }`}
            >
              <option value="all">All Statuses</option>
              <option value="proposed">Proposed</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved">Approved</option>
              <option value="in_development">In Development</option>
              <option value="released">Released</option>
            </select>

            {/* Type */}
            <select
              value={filterType}
              onChange={(e) => onFilterTypeChange(e.target.value as FilterType)}
              className={`px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                filterType !== 'all' ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white text-gray-700'
              }`}
            >
              <option value="all">All Types</option>
              <option value="journey">Journeys</option>
              <option value="functional_requirement">Features</option>
            </select>

            {/* Priority */}
            <select
              value={filterPriority}
              onChange={(e) => onFilterPriorityChange(e.target.value as FilterPriority)}
              className={`px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                filterPriority !== 'all' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white text-gray-700'
              }`}
            >
              <option value="all">All Priorities</option>
              <option value="P1">P1 - MVP</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
              <option value="P5">P5</option>
            </select>

            {/* Category */}
            <select
              value={filterCategory}
              onChange={(e) => onFilterCategoryChange(e.target.value as FilterCategory)}
              className={`px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                filterCategory !== 'all' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'bg-white text-gray-700'
              }`}
            >
              <option value="all">All Categories</option>
              <option value="toolkit">Toolkit</option>
              <option value="business_module">Business Module</option>
              {isAdmin && <option value="internal">Internal</option>}
              <option value="none">Uncategorised</option>
            </select>

            {/* Section */}
            <select
              value={filterSection}
              onChange={(e) => onFilterSectionChange(e.target.value as FilterSection)}
              className={`px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                filterSection !== 'all' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white text-gray-700'
              }`}
            >
              <option value="all">All Sections</option>
              {availableSections.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
          </div>

          {/* Active filters summary + clear */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{filteredCount} of {totalCount} features</span>
              <button
                onClick={onClearFilters}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
