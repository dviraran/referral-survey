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
  guideline_rationale: string;
}

const GUIDELINE_LINKS: Record<string, string> = {
  'NICE NG12': 'https://www.nice.org.uk/guidance/ng12',
  'NICE NG106': 'https://www.nice.org.uk/guidance/ng106',
  'NICE NG59': 'https://www.nice.org.uk/guidance/ng59',
  'NICE NG222': 'https://www.nice.org.uk/guidance/ng222',
  'NICE NG28': 'https://www.nice.org.uk/guidance/ng28',
  'NICE CG150': 'https://www.nice.org.uk/guidance/cg150',
  'NICE NG226': 'https://www.nice.org.uk/guidance/ng226',
  'NICE CG95': 'https://www.nice.org.uk/guidance/cg95',
  'NICE NG100': 'https://www.nice.org.uk/guidance/ng100',
  'NICE NG196': 'https://www.nice.org.uk/guidance/ng196',
  'NICE NG112': 'https://www.nice.org.uk/guidance/ng112',
  'NICE NG203': 'https://www.nice.org.uk/guidance/ng203',
  'NICE CG153': 'https://www.nice.org.uk/guidance/cg153',
  'NICE NG98': 'https://www.nice.org.uk/guidance/ng98',
  'NICE CG184': 'https://www.nice.org.uk/guidance/cg184',
  'NICE NG88': 'https://www.nice.org.uk/guidance/ng88',
  'NICE NG143': 'https://www.nice.org.uk/guidance/ng143',
  'ACC/AHA 2021': 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001029',
  'ATA 2015': 'https://www.liebertpub.com/doi/10.1089/thy.2015.0020',
};

function getGuidelineLink(source: string): string | null {
  if (!source) return null;
  for (const [key, url] of Object.entries(GUIDELINE_LINKS)) {
    if (source.includes(key)) return url;
  }
  return null;
}

export default function SurveyCard({ vignette }: { vignette: Vignette }) {
  const [showGuideline, setShowGuideline] = useState(false);

  const link = getGuidelineLink(vignette.guideline_source);

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

      {/* Guideline info (expandable) */}
      {vignette.guideline_source && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setShowGuideline(!showGuideline)}
            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
          >
            <span className="text-[10px]">{showGuideline ? '▼' : '▶'}</span>
            <span>Relevant guideline</span>
          </button>
          {showGuideline && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-2">
              <div>
                <span className="font-medium text-gray-700">Source: </span>
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    {vignette.guideline_source} ↗
                  </a>
                ) : (
                  <span>{vignette.guideline_source}</span>
                )}
              </div>
              {vignette.guideline_rationale && (
                <div>
                  <span className="font-medium text-gray-700">Key threshold: </span>
                  <span>{vignette.guideline_rationale}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
