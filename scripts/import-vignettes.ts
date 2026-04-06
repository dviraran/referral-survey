/**
 * Import vignettes from CSV into Supabase.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx tsx scripts/import-vignettes.ts
 *
 * Or with service role key for bypassing RLS:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-vignettes.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  let i = 1;
  while (i < lines.length) {
    let line = lines[i];
    // Handle multi-line fields (quoted strings with newlines)
    while (line && (line.split('"').length - 1) % 2 !== 0 && i + 1 < lines.length) {
      i++;
      line += '\n' + lines[i];
    }
    if (line.trim()) {
      const values = parseCSVLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }
    i++;
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  const csvPath = path.resolve(__dirname, '../../arm3_all_vignettes.csv');
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);

  console.log(`Parsed ${rows.length} vignettes from CSV`);

  // Clear existing vignettes
  const { error: deleteError } = await supabase.from('vignettes').delete().neq('id', 0);
  if (deleteError) {
    console.error('Error clearing vignettes:', deleteError);
  }

  // Insert in batches of 50
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map(row => ({
      pair_id: row.pair_id,
      case_id: row.case_id,
      condition: row.condition,
      key_variable: row.key_variable,
      threshold: row.threshold,
      referral_expected: row.referral_expected === 'True',
      expected_action: row.expected_action,
      guideline_source: row.guideline_source,
      guideline_rationale: row.guideline_rationale,
      clinical_vignette: row.clinical_vignette,
      specialty_if_refer: row.specialty_if_refer || null,
    }));

    const { error } = await supabase.from('vignettes').insert(batch);
    if (error) {
      console.error(`Error inserting batch at ${i}:`, error);
    } else {
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${rows.length}`);
    }
  }

  console.log(`Done! ${inserted} vignettes imported.`);
}

main().catch(console.error);
