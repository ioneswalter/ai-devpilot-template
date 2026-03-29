/**
 * FeatureSelector - Multi-select component for choosing released features not in active releases
 * Includes search/filter functionality and clean selection UI
 */

import { useState, useMemo } from 'react'

const SearchIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
)
const CheckIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
)
const PackageIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.5 9.4-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
)

interface Feature {
  id: string
  title: string
  description: string
  status: 'backlog' | 'in-progress' | 'released' | 'deployed'
  category: string
  section?: string
  impact_level: 'low' | 'medium' | 'high'
  created_at: string
  completed_at?: string
}

interface FeatureSelectorProps {
  features: Feature[]
  selectedFeatureIds: string[]
  onSelectionChange: (featureIds: string[]) => void
  className?: string
}

export function FeatureSelector({
  features,
  selectedFeatureIds,
  onSelectionChange,
  className = ''
}: FeatureSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [selectedImpact, setSelectedImpact] = useState<string>('all')

  // Filter features to only show released ones not in active releases
  const eligibleFeatures = useMemo(() => {
    return features.filter(feature => feature.status === 'released')
  }, [features])

  // Get unique categories and impact levels for filters
  const categories = useMemo(() => {
    const cats = Array.from(new Set(eligibleFeatures.map(f => f.category)))
    return cats.sort()
  }, [eligibleFeatures])

  const sections = useMemo(() => {
    const secs = Array.from(new Set(eligibleFeatures.map(f => f.section).filter(Boolean)))
    return secs.sort()
  }, [eligibleFeatures])

  const impactLevels = ['low', 'medium', 'high'] as const

  // Apply search and filters
  const filteredFeatures = useMemo(() => {
    return eligibleFeatures.filter(feature => {
      const matchesSearch = searchQuery === '' ||
        feature.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        feature.description.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesCategory = selectedCategory === 'all' || feature.category === selectedCategory
      const matchesSection = selectedSection === 'all' || feature.section === selectedSection
      const matchesImpact = selectedImpact === 'all' || feature.impact_level === selectedImpact

      return matchesSearch && matchesCategory && matchesSection && matchesImpact
    })
  }, [eligibleFeatures, searchQuery, selectedCategory, selectedSection, selectedImpact])

  const toggleFeature = (featureId: string) => {
    const isSelected = selectedFeatureIds.includes(featureId)
    if (isSelected) {
      onSelectionChange(selectedFeatureIds.filter(id => id !== featureId))
    } else {
      onSelectionChange([...selectedFeatureIds, featureId])
    }
  }

  const toggleAll = () => {
    const allVisible = filteredFeatures.map(f => f.id)
    const allSelected = allVisible.every(id => selectedFeatureIds.includes(id))
    
    if (allSelected) {
      // Deselect all visible features
      onSelectionChange(selectedFeatureIds.filter(id => !allVisible.includes(id)))
    } else {
      // Select all visible features
      const newSelected = Array.from(new Set([...selectedFeatureIds, ...allVisible]))
      onSelectionChange(newSelected)
    }
  }

  const getImpactBadgeColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 border-green-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const selectedCount = selectedFeatureIds.length
  const visibleSelectedCount = filteredFeatures.filter(f => selectedFeatureIds.includes(f.id)).length

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with counts */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageIcon className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Select Features
          </h3>
        </div>
        <div className="text-sm text-gray-600">
          {selectedCount} selected • {filteredFeatures.length} available
        </div>
      </div>

      {/* Search and filters */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Sections</option>
            {sections.map(section => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={selectedImpact}
            onChange={(e) => setSelectedImpact(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Priorities</option>
            {impactLevels.map(impact => (
              <option key={impact} value={impact}>
                {impact === 'high' ? 'P1 - MVP' : impact === 'medium' ? 'P2' : 'P3+'}
              </option>
            ))}
          </select>
        </div>

        {/* Select all toggle */}
        {filteredFeatures.length > 0 && (
          <button
            onClick={toggleAll}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {visibleSelectedCount === filteredFeatures.length ? 'Deselect' : 'Select'} all visible ({filteredFeatures.length})
          </button>
        )}
      </div>

      {/* Feature list */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredFeatures.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {eligibleFeatures.length === 0 ? (
              <div>
                <PackageIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p>No released features available</p>
                <p className="text-sm">Features must be in 'released' status to be included in a release.</p>
              </div>
            ) : (
              <div>
                <SearchIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p>No features match your search criteria</p>
                <p className="text-sm">Try adjusting your search or filters.</p>
              </div>
            )}
          </div>
        ) : (
          filteredFeatures.map(feature => {
            const isSelected = selectedFeatureIds.includes(feature.id)
            
            return (
              <label
                key={feature.id}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center h-5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFeature(feature.id)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900 truncate">
                      {feature.title}
                    </h4>
                    <span className={`px-2 py-1 text-xs font-medium border rounded-full ${getImpactBadgeColor(feature.impact_level)}`}>
                      {feature.impact_level}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                    {feature.description}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {feature.section && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                        {feature.section}
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-gray-100 rounded">
                      {feature.category}
                    </span>
                    {feature.completed_at && (
                      <span>
                        Completed {new Date(feature.completed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <CheckIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                )}
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}