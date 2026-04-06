'use client';

import { useState } from 'react';

interface Vignette {
  id: number;
  pair_id: string;
  case_id: string;
  condition: string;
  key_variable: string;
  clinical_vignette: string;
  guideline_source: string;
}

export default function SurveyCard({ vignette }: { vignette: Vignette }) {
  const [showGuideline, setShowGuideline] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 transition-all">
      {/* Condition badge */}
      <div className="mb-3">
        <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
          {vignette.condition}
        </span>
      </div>

      {/* Clinical vignette text */}
      <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
        {vignette.clinical_vignette}
      </div>

      {/* Guideline hint (expandable) */}
      {vignette.guideline_source && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setShowGuideline(!showGuideline)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <span>{showGuideline ? '▼' : '▶'}</span>
            <span>Guideline reference</span>
          </button>
          {showGuideline && (
            <p className="mt-1 text-xs text-gray-400 italic">
              {vignette.guideline_source}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
