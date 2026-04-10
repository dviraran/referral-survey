-- Referral Survey Database Schema
-- Run this in Supabase SQL Editor

-- Vignettes table (imported from CSV)
CREATE TABLE vignettes (
  id SERIAL PRIMARY KEY,
  pair_id TEXT NOT NULL,
  case_id TEXT NOT NULL UNIQUE,
  condition TEXT NOT NULL,
  key_variable TEXT NOT NULL,
  threshold TEXT,
  referral_expected BOOLEAN NOT NULL,
  expected_action TEXT NOT NULL,
  guideline_source TEXT,
  guideline_rationale TEXT,
  clinical_vignette TEXT NOT NULL,
  specialty_if_refer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviewers table
CREATE TABLE reviewers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,  -- URL-friendly identifier
  specialty TEXT,
  years_experience INTEGER,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Responses table
CREATE TABLE responses (
  id SERIAL PRIMARY KEY,
  reviewer_id UUID REFERENCES reviewers(id) NOT NULL,
  vignette_id INTEGER REFERENCES vignettes(id) NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('refer', 'manage', 'unsure')),
  specialty_if_refer TEXT,
  confidence INTEGER CHECK (confidence BETWEEN 1 AND 5),
  comment TEXT,  -- optional free-text comment
  response_time_ms INTEGER,  -- how long they took to answer
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reviewer_id, vignette_id)  -- one response per reviewer per vignette
);

-- Index for fast lookups
CREATE INDEX idx_responses_reviewer ON responses(reviewer_id);
CREATE INDEX idx_responses_vignette ON responses(vignette_id);
CREATE INDEX idx_vignettes_pair ON vignettes(pair_id);

-- RPC to get random unanswered vignettes for a reviewer
CREATE OR REPLACE FUNCTION get_random_vignettes(
  p_reviewer_id UUID,
  p_count INTEGER DEFAULT 10
)
RETURNS SETOF vignettes AS $$
  SELECT v.*
  FROM vignettes v
  WHERE v.id NOT IN (
    SELECT r.vignette_id FROM responses r WHERE r.reviewer_id = p_reviewer_id
  )
  ORDER BY RANDOM()
  LIMIT p_count;
$$ LANGUAGE sql STABLE;

-- RPC to get progress for a reviewer
CREATE OR REPLACE FUNCTION get_reviewer_progress(p_reviewer_id UUID)
RETURNS TABLE(answered BIGINT, total BIGINT) AS $$
  SELECT
    (SELECT COUNT(*) FROM responses WHERE reviewer_id = p_reviewer_id) AS answered,
    (SELECT COUNT(*) FROM vignettes) AS total;
$$ LANGUAGE sql STABLE;

-- Enable RLS
ALTER TABLE vignettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Policies: vignettes are readable by anyone
CREATE POLICY "Vignettes are readable" ON vignettes FOR SELECT USING (true);

-- Reviewers: readable and insertable by anyone (no auth)
CREATE POLICY "Reviewers are readable" ON reviewers FOR SELECT USING (true);
CREATE POLICY "Reviewers are insertable" ON reviewers FOR INSERT WITH CHECK (true);

-- Responses: anyone can insert and read (keyed by reviewer_id in the app)
CREATE POLICY "Responses are insertable" ON responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Responses are readable" ON responses FOR SELECT USING (true);
CREATE POLICY "Responses are updatable" ON responses FOR UPDATE USING (true);

-- Review sets: named collections of vignettes for targeted re-review
CREATE TABLE review_sets (
  id SERIAL PRIMARY KEY,
  set_name TEXT NOT NULL,
  vignette_id INTEGER REFERENCES vignettes(id) NOT NULL,
  UNIQUE(set_name, vignette_id)
);

CREATE INDEX idx_review_sets_name ON review_sets(set_name);

ALTER TABLE review_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Review sets are readable" ON review_sets FOR SELECT USING (true);

-- RPC to fetch review set vignettes + random camouflage
CREATE OR REPLACE FUNCTION get_review_set_vignettes(
  p_set_name TEXT,
  p_reviewer_id UUID,
  p_camouflage_count INTEGER DEFAULT 10
)
RETURNS SETOF vignettes AS $$
  -- Target vignettes from the review set
  (SELECT v.*
   FROM vignettes v
   INNER JOIN review_sets rs ON rs.vignette_id = v.id
   WHERE rs.set_name = p_set_name)
  UNION ALL
  -- Random camouflage vignettes (not in the set, already answered by reviewer)
  (SELECT v.*
   FROM vignettes v
   WHERE v.id NOT IN (
     SELECT rs2.vignette_id FROM review_sets rs2 WHERE rs2.set_name = p_set_name
   )
   AND v.id IN (
     SELECT r.vignette_id FROM responses r WHERE r.reviewer_id = p_reviewer_id
   )
   ORDER BY RANDOM()
   LIMIT p_camouflage_count)
$$ LANGUAGE sql STABLE;
