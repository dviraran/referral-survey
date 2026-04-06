'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import SurveyCard from '@/components/SurveyCard';

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-gray-500 text-lg">Loading...</div></div>}>
      <Home />
    </Suspense>
  );
}

interface Vignette {
  id: number;
  pair_id: string;
  case_id: string;
  condition: string;
  key_variable: string;
  clinical_vignette: string;
  guideline_source: string;
}

interface Progress {
  answered: number;
  total: number;
}

const SPECIALTIES = [
  'Cardiology', 'Dermatology', 'Endocrinology', 'ENT',
  'Gastroenterology', 'Gynaecology', 'Haematology', 'Hepatology',
  'Nephrology', 'Neurology', 'Neurosurgery', 'Oncology',
  'Ophthalmology', 'Orthopaedics', 'Paediatrics', 'Pain Management',
  'Psychiatry', 'Respiratory', 'Rheumatology', 'Surgery',
  'Urology', 'Other',
];

function Home() {
  const searchParams = useSearchParams();
  const reviewerSlug = searchParams.get('reviewer');

  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [vignette, setVignette] = useState<Vignette | null>(null);
  const [queue, setQueue] = useState<Vignette[]>([]);
  const [progress, setProgress] = useState<Progress>({ answered: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSpecialty, setShowSpecialty] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Initialize reviewer
  useEffect(() => {
    if (!reviewerSlug) {
      setShowWelcome(true);
      setIsLoading(false);
      return;
    }

    async function initReviewer() {
      const { data: existing } = await supabase
        .from('reviewers')
        .select('*')
        .eq('slug', reviewerSlug)
        .single();

      if (existing) {
        setReviewerId(existing.id);
        setReviewerName(existing.name);
        await loadProgress(existing.id);
        await loadNextVignettes(existing.id);
      } else {
        setShowWelcome(true);
      }
      setIsLoading(false);
    }

    initReviewer();
  }, [reviewerSlug]);

  async function loadProgress(rid: string) {
    const { data } = await supabase.rpc('get_reviewer_progress', { p_reviewer_id: rid });
    if (data && data.length > 0) {
      setProgress({ answered: Number(data[0].answered), total: Number(data[0].total) });
    }
  }

  async function loadNextVignettes(rid: string) {
    const { data } = await supabase.rpc('get_random_vignettes', {
      p_reviewer_id: rid,
      p_count: 10,
    });
    if (data && data.length > 0) {
      setQueue(prev => [...prev, ...data]);
      if (!vignette) {
        setVignette(data[0]);
        setQueue(data.slice(1));
        setStartTime(Date.now());
      }
    }
  }

  async function handleCreateReviewer(name: string, specialty: string, years: number) {
    const slug = reviewerSlug || name.toLowerCase().replace(/\s+/g, '-');
    const { data, error } = await supabase
      .from('reviewers')
      .insert({ name, slug, specialty, years_experience: years })
      .select()
      .single();

    if (error) {
      alert('Error creating reviewer: ' + error.message);
      return;
    }

    setReviewerId(data.id);
    setReviewerName(data.name);
    setShowWelcome(false);
    setIsLoading(true);

    // Update URL with reviewer slug
    if (!reviewerSlug) {
      window.history.replaceState(null, '', `?reviewer=${slug}`);
    }

    await loadProgress(data.id);
    await loadNextVignettes(data.id);
    setIsLoading(false);
  }

  async function handleDecision(decision: 'refer' | 'manage' | 'unsure', specialty?: string) {
    if (!reviewerId || !vignette) return;

    const responseTimeMs = Date.now() - startTime;

    // Save response
    await supabase.from('responses').upsert({
      reviewer_id: reviewerId,
      vignette_id: vignette.id,
      decision,
      specialty_if_refer: specialty || null,
      response_time_ms: responseTimeMs,
    }, { onConflict: 'reviewer_id,vignette_id' });

    // Update progress
    setProgress(prev => ({ ...prev, answered: prev.answered + 1 }));

    // Move to next
    if (queue.length > 0) {
      setVignette(queue[0]);
      setQueue(prev => prev.slice(1));
      setStartTime(Date.now());

      // Refill queue if running low
      if (queue.length < 3 && reviewerId) {
        loadNextVignettes(reviewerId);
      }
    } else {
      setVignette(null); // Done!
    }
  }

  function handleRefer() {
    setShowSpecialty(true);
  }

  function handleSpecialtySelect(specialty: string) {
    setShowSpecialty(false);
    handleDecision('refer', specialty);
  }

  function handleManage() {
    setShowSpecialty(false);
    handleDecision('manage');
  }

  function handleUnsure() {
    setShowSpecialty(false);
    handleDecision('unsure');
  }

  // Welcome / registration screen
  if (showWelcome) {
    return <WelcomeScreen onStart={handleCreateReviewer} defaultSlug={reviewerSlug} />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  // All done
  if (!vignette && progress.answered > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">All done!</h1>
        <p className="text-gray-600 mb-4">
          You reviewed {progress.answered} of {progress.total} vignettes.
        </p>
        <p className="text-gray-500 text-sm">Thank you for your contribution to this research.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">Hi, {reviewerName}</span>
          <span className="text-sm font-medium text-gray-700">
            {progress.answered} / {progress.total}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress.total > 0 ? (progress.answered / progress.total) * 100 : 0}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col p-4">
        {vignette && (
          <>
            <SurveyCard vignette={vignette} />

            {/* Specialty picker overlay */}
            {showSpecialty ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Which specialty?</p>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {SPECIALTIES.map(s => (
                    <button
                      key={s}
                      onClick={() => handleSpecialtySelect(s)}
                      className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowSpecialty(false)}
                  className="mt-2 w-full text-sm text-gray-500 underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {/* Main buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleManage}
                    className="py-4 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl text-center transition-colors shadow-sm active:scale-95"
                  >
                    Manage in<br />Primary Care
                  </button>
                  <button
                    onClick={handleRefer}
                    className="py-4 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl text-center transition-colors shadow-sm active:scale-95"
                  >
                    Refer to<br />Specialist
                  </button>
                </div>
                {/* Unsure button */}
                <button
                  onClick={handleUnsure}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Not sure / Skip
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Welcome / registration component
function WelcomeScreen({ onStart, defaultSlug }: { onStart: (name: string, specialty: string, years: number) => void; defaultSlug: string | null }) {
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [years, setYears] = useState('');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Referral Survey</h1>
      <p className="text-gray-600 text-center mb-6 text-sm leading-relaxed">
        You will see clinical vignettes one at a time. For each patient, decide:
        would you <strong>refer to a specialist</strong> or <strong>manage in primary care</strong>?
      </p>

      <div className="w-full space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Dr. Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your specialty</label>
          <select
            value={specialty}
            onChange={e => setSpecialty(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="General Practice / Family Medicine">General Practice / Family Medicine</option>
            <option value="Internal Medicine">Internal Medicine</option>
            <option value="Emergency Medicine">Emergency Medicine</option>
            <option value="Paediatrics">Paediatrics</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Years of experience</label>
          <input
            type="number"
            value={years}
            onChange={e => setYears(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="10"
            min="0"
            max="50"
          />
        </div>
        <button
          onClick={() => {
            if (!name.trim()) { alert('Please enter your name'); return; }
            onStart(name.trim(), specialty, parseInt(years) || 0);
          }}
          className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors shadow-sm"
        >
          Start Survey
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        ~244 vignettes. Takes about 30 minutes. You can stop and resume anytime.
      </p>
    </div>
  );
}
