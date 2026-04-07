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
  guideline_rationale: string;
  specialty_if_refer: string | null;
}

interface Progress {
  answered: number;
  total: number;
}

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
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [pendingDecision, setPendingDecision] = useState<{ decision: 'refer' | 'manage' | 'unsure'; specialty?: string } | null>(null);
  const [comment, setComment] = useState('');
  const [history, setHistory] = useState<Vignette[]>([]);

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
        await loadAnsweredHistory(existing.id);
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

  async function loadAnsweredHistory(rid: string) {
    const { data } = await supabase
      .from('responses')
      .select('vignette_id, vignettes(*)')
      .eq('reviewer_id', rid)
      .order('created_at', { ascending: true });

    if (data && data.length > 0) {
      const vignettes = data
        .map((r: any) => r.vignettes as Vignette)
        .filter(Boolean);
      setHistory(vignettes);
    }
  }

  async function loadNextVignettes(rid: string) {
    const { data } = await supabase.rpc('get_random_vignettes', {
      p_reviewer_id: rid,
      p_count: 10,
    });
    if (data && data.length > 0) {
      setQueue(prev => {
        const existingIds = new Set(prev.map(v => v.id));
        const newItems = data.filter((v: Vignette) => !existingIds.has(v.id));
        return [...prev, ...newItems];
      });
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
      comment: comment.trim() || null,
    }, { onConflict: 'reviewer_id,vignette_id' });

    // Reset and move to next
    setHistory(prev => [...prev, vignette]);
    setPendingDecision(null);
    setComment('');
    await loadProgress(reviewerId);

    if (queue.length > 0) {
      setVignette(queue[0]);
      setQueue(prev => prev.slice(1));
      setStartTime(Date.now());

      if (queue.length < 3 && reviewerId) {
        loadNextVignettes(reviewerId);
      }
    } else {
      setVignette(null); // Done!
    }
  }

  function handleJustified() {
    const specialty = vignette?.specialty_if_refer || 'a specialist';
    setPendingDecision({ decision: 'refer', specialty });
  }

  function handleNotJustified() {
    setPendingDecision({ decision: 'manage' });
  }

  function handleUnsure() {
    setPendingDecision({ decision: 'unsure' });
  }

  function handleConfirm() {
    if (!pendingDecision) return;
    handleDecision(pendingDecision.decision, pendingDecision.specialty);
  }

  function handleBackToButtons() {
    setPendingDecision(null);
    setComment('');
  }

  async function handlePrevious() {
    if (history.length === 0 || !reviewerId) return;

    // Push current vignette back to front of queue
    if (vignette) {
      setQueue(prev => [vignette, ...prev]);
    }

    // Pop from history
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setVignette(prev);
    setPendingDecision(null);
    setComment('');
    setStartTime(Date.now());

    // Load previous response so they can see what they picked
    const { data } = await supabase
      .from('responses')
      .select('decision, comment, specialty_if_refer')
      .eq('reviewer_id', reviewerId)
      .eq('vignette_id', prev.id)
      .single();

    if (data) {
      setPendingDecision({
        decision: data.decision as 'refer' | 'manage' | 'unsure',
        specialty: data.specialty_if_refer || undefined,
      });
      setComment(data.comment || '');
    }
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
        {history.length > 0 && (
          <button
            onClick={handlePrevious}
            className="mt-6 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors"
          >
            Review previous answers
          </button>
        )}
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
        {vignette && history.length > 0 && (
          <button
            onClick={handlePrevious}
            className="self-start mb-2 text-sm text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1"
          >
            ← Previous question
          </button>
        )}
        {vignette && (
          <>
            <SurveyCard vignette={vignette} />

            {/* Referral justification question */}
            <div className="mt-4 space-y-3">
              {/* Referral statement */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-sm text-amber-800">
                  This patient was referred to{' '}
                  <span className="font-bold">{vignette.specialty_if_refer || 'a specialist'}</span>.
                </p>
                <p className="text-sm font-medium text-amber-900 mt-1">Is this referral justified?</p>
              </div>

              {!pendingDecision ? (
                <>
                  {/* Main buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleNotJustified}
                      className="py-4 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl text-center transition-colors shadow-sm active:scale-95"
                    >
                      Not Justified
                    </button>
                    <button
                      onClick={handleJustified}
                      className="py-4 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl text-center transition-colors shadow-sm active:scale-95"
                    >
                      Justified
                    </button>
                  </div>
                  {/* Unsure button */}
                  <button
                    onClick={handleUnsure}
                    className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Not sure / Skip
                  </button>
                </>
              ) : (
                <>
                  {/* Comment step */}
                  <div className="text-center text-sm text-gray-600">
                    You selected: <span className="font-semibold">{pendingDecision.decision === 'refer' ? 'Justified' : pendingDecision.decision === 'manage' ? 'Not Justified' : 'Unsure'}</span>
                  </div>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Any comments? (e.g. wrong specialty, missing info…)"
                    className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleBackToButtons}
                      className="py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl text-center transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-center transition-colors"
                    >
                      Submit
                    </button>
                  </div>
                </>
              )}
            </div>
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
        You will see clinical vignettes one at a time. Each patient has been referred to a specialist.
        Your job: decide if the <strong>referral is justified</strong> or <strong>not justified</strong>.
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
