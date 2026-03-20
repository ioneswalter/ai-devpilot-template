/**
 * FeatureDetailPanel - Expanded detail view for a single feature,
 * showing acceptance criteria, test cases, related journeys, rating, and comments.
 */

import { FeatureComments } from '../../components/FeatureComments';
import { FeatureRating } from '../../components/FeatureRating';
import { getTestTypeBadge } from '../../components/roadmap/badge-utils';
import { parseCriteria, type ProductFeature } from './roadmap-helpers';
import type { MutableRefObject } from 'react';

interface FeatureDetailPanelProps {
  feature: ProductFeature;
  features: ProductFeature[];
  isMember: boolean;
  isAdmin: boolean;
  toggleExpanded: (featureId: string) => void;
  featureRowRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  onReviewFeature?: (feature: ProductFeature) => void;
  onImplementFeature?: (feature: ProductFeature) => void;
  onRunTests?: (feature: ProductFeature) => void;
}

export function FeatureDetailPanel({
  feature,
  features,
  isMember,
  isAdmin,
  toggleExpanded,
  featureRowRefs,
  onReviewFeature,
  onImplementFeature,
  onRunTests,
}: FeatureDetailPanelProps) {
  const getJourneyByCode = (code: string): ProductFeature | undefined => {
    return features.find((f) => f.feature_code === code && f.feature_type === 'journey');
  };

  // in_development features always have an implementation request
  // (transitioning to in_development triggers implementation)
  const hasActiveImpl = feature.status === 'in_development';

  return (
    <div className="px-3 lg:px-4 pb-4 border-t bg-gray-50">
      {/* Admin Review Button — proposed features only */}
      {isAdmin && feature.status === 'proposed' && onReviewFeature && (
        <div className="pt-3 pb-1">
          <button
            onClick={(e) => { e.stopPropagation(); onReviewFeature(feature); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Review with AI
          </button>
        </div>
      )}
      {/* Implementation Button — in_development features only */}
      {isAdmin && feature.status === 'in_development' && onImplementFeature && (
        <div className="pt-3 pb-1">
          <button
            onClick={(e) => { e.stopPropagation(); onImplementFeature(feature); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {hasActiveImpl ? 'Watch Implementation' : 'Implement'}
          </button>
        </div>
      )}
      {/* Run Tests Button — in_development features with test cases */}
      {isAdmin && feature.status === 'in_development' && onRunTests && (feature.test_cases?.length ?? 0) > 0 && (
        <div className="pt-3 pb-1">
          <button
            onClick={(e) => { e.stopPropagation(); onRunTests(feature); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Tests
          </button>
        </div>
      )}
      <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Acceptance Criteria */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <svg
              className="w-5 h-5 mr-2 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Acceptance Criteria
          </h4>
          {feature.acceptance_criteria && feature.acceptance_criteria.length > 0 ? (
            <ul className="space-y-2">
              {parseCriteria(feature.acceptance_criteria).map((criterion: string, idx: number) => {
                const implFeaturesData = feature.implementing_features;
                const isNewFormat = implFeaturesData && typeof implFeaturesData === 'object' && !Array.isArray(implFeaturesData);
                const implFeatureCodes: string[] = isNewFormat
                  ? (Array.isArray(implFeaturesData[idx]) ? implFeaturesData[idx] : [])
                  : [];
                const hasImplementingFeature = implFeatureCodes.length > 0;

                return (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                        feature.status === 'released'
                          ? 'bg-green-100 text-green-600'
                          : hasImplementingFeature
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {feature.status === 'released' ? '\u2713' : idx + 1}
                    </span>
                    <div className="flex-1">
                      <span className="text-gray-700">{criterion}</span>
                      {feature.feature_type === 'journey' && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {hasImplementingFeature ? (
                            implFeatureCodes.map((code) => {
                              const implFeature = features.find((f) => f.feature_code === code);
                              return (
                                <span
                                  key={code}
                                  className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono rounded cursor-pointer hover:ring-1 ${
                                    implFeature?.status === 'released'
                                      ? 'bg-green-100 text-green-700 hover:ring-green-400'
                                      : implFeature?.status === 'in_development'
                                        ? 'bg-blue-100 text-blue-700 hover:ring-blue-400'
                                        : 'bg-gray-100 text-gray-600 hover:ring-gray-400'
                                  }`}
                                  title={implFeature?.title || code}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (implFeature) {
                                      toggleExpanded(implFeature.id);
                                      requestAnimationFrame(() => {
                                        featureRowRefs.current[implFeature.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      });
                                    }
                                  }}
                                >
                                  {code}
                                </span>
                              );
                            })
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-amber-50 text-amber-600 border border-amber-200">
                              Feature Not Yet Defined
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 italic">No acceptance criteria defined yet</p>
          )}
        </div>

        {/* Test Cases */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <svg
              className="w-5 h-5 mr-2 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            Test Cases
          </h4>
          {feature.test_cases && feature.test_cases.length > 0 ? (
            <div className="space-y-3">
              {feature.test_cases.map((test) => (
                <div key={test.test_code} className="bg-white p-3 rounded-lg border">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                        test.passed
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {test.passed ? '\u2713' : '\u25CB'}
                    </span>
                    <code className="text-xs font-mono text-gray-500">{test.test_code}</code>
                    {getTestTypeBadge(test.test_type)}
                    {test.automated && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800">
                        Automated
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700">{test.title}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No test cases defined yet</p>
          )}
        </div>
      </div>

      {/* Related User Stories */}
      {feature.related_user_stories && feature.related_user_stories.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <svg
              className="w-5 h-5 mr-2 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Implements Journeys
          </h4>
          <div className="flex flex-wrap gap-2">
            {feature.related_user_stories.map((jCode) => {
              const journey = getJourneyByCode(jCode);
              return (
                <div
                  key={jCode}
                  className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2"
                >
                  <span className="font-mono text-xs text-purple-600">{jCode}</span>
                  {journey && (
                    <span className="ml-2 text-sm text-gray-700">{journey.title}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rating Section */}
      <div className="mt-4 pt-4 border-t">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
          <svg className="w-5 h-5 mr-2 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Community Rating
        </h4>
        <FeatureRating featureId={feature.id} isMember={isMember} />
      </div>

      {/* Comments Section */}
      <FeatureComments featureId={feature.id} featureCode={feature.feature_code} isMember={isMember} />
    </div>
  );
}
