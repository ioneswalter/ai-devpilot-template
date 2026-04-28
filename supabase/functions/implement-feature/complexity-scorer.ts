/**
 * Complexity Scorer (FR-117)
 * Deterministic multi-factor scoring for task complexity analysis.
 * Pure function — no AI calls, no DB queries.
 */

// ── Types ──

export interface TaskForScoring {
  title: string;
  description: string | null;
  file_path: string;
  task_type: 'create' | 'modify' | 'test' | 'config';
  siblingPaths: string[];
}

export interface FactorResult {
  score: number; // 0-100
  value: number | string[];
  detail: string;
}

export interface ComplexityScore {
  total: number; // 0-100 weighted composite
  threshold: number;
  split_recommended: boolean;
  factors: {
    file_count: FactorResult;
    line_estimate: FactorResult;
    layer_span: FactorResult;
    dependency_depth: FactorResult;
  };
  scored_at: string;
}

// ── Configuration ──

const DEFAULT_THRESHOLD = 60;
const WEIGHTS = { file_count: 0.3, line_estimate: 0.3, layer_span: 0.2, dependency_depth: 0.2 };

// ── Factor Scorers ──

function scoreFileCount(task: TaskForScoring): FactorResult {
  const fileMentions = extractFilePaths(task);
  const count = fileMentions.length;

  let score: number;
  if (count <= 1) score = 0;
  else if (count === 2) score = 20;
  else if (count === 3) score = 40;
  else if (count === 4) score = 60;
  else if (count === 5) score = 80;
  else score = 100;

  return { score, value: count, detail: `${count} file${count !== 1 ? 's' : ''} affected` };
}

function scoreLineEstimate(task: TaskForScoring): FactorResult {
  const estimate = estimateLines(task);

  let score: number;
  if (estimate <= 50) score = 0;
  else if (estimate <= 100) score = 15;
  else if (estimate <= 150) score = 30;
  else if (estimate <= 200) score = 45;
  else if (estimate <= 250) score = 60;
  else if (estimate <= 300) score = 75;
  else score = 100;

  const label = task.task_type === 'create' ? 'create' : 'modify';
  return { score, value: estimate, detail: `Estimated ${estimate} lines (${label})` };
}

function scoreLayerSpan(task: TaskForScoring): FactorResult {
  const layers = detectLayers(task);

  let score: number;
  if (layers.length <= 1) score = 0;
  else if (layers.length === 2) score = 60;
  else score = 100;

  const detail =
    layers.length > 1 ? `Spans ${layers.join(' and ')}` : `Single layer: ${layers[0] || 'unknown'}`;

  return { score, value: layers, detail };
}

function scoreDependencyDepth(task: TaskForScoring): FactorResult {
  const depth = analyzeDependencies(task);

  let score: number;
  if (depth <= 1) score = 0;
  else if (depth === 2) score = 25;
  else if (depth === 3) score = 50;
  else if (depth === 4) score = 75;
  else score = 100;

  return {
    score,
    value: depth,
    detail: `${depth} inter-file dependenc${depth !== 1 ? 'ies' : 'y'}`,
  };
}

// ── Helpers ──

function extractFilePaths(task: TaskForScoring): string[] {
  const paths = new Set<string>();
  paths.add(task.file_path);

  const text = `${task.title} ${task.description || ''}`;
  const filePattern = /(?:apps\/|supabase\/|packages\/|prisma\/|src\/)\S+\.\w+/g;
  for (const match of text.matchAll(filePattern)) {
    paths.add(match[0]);
  }

  const keywords = ['and', 'also', 'plus', 'including', 'with'];
  for (const kw of keywords) {
    if (text.toLowerCase().includes(kw) && task.siblingPaths.length > 0) {
      for (const sp of task.siblingPaths) {
        if (text.includes(sp.split('/').pop() || '')) paths.add(sp);
      }
    }
  }

  return Array.from(paths);
}

function estimateLines(task: TaskForScoring): number {
  const text = `${task.title} ${task.description || ''}`.toLowerCase();
  const path = task.file_path.toLowerCase();
  let base: number;

  if (task.task_type === 'config') return 30;
  if (task.task_type === 'test') return 120;

  if (task.task_type === 'create') {
    if (path.includes('.tsx')) base = 120;
    else if (path.includes('supabase/functions')) base = 180;
    else if (path.includes('api') || path.includes('service')) base = 150;
    else base = 100;
  } else {
    base = 60;
  }

  if (text.includes('panel') || text.includes('dashboard')) base += 80;
  if (text.includes('form') || text.includes('modal')) base += 50;
  if (text.includes('crud') || text.includes('full')) base += 60;
  if (text.includes('simple') || text.includes('helper') || text.includes('utility')) base -= 40;
  if (text.includes('type') || text.includes('interface')) base -= 30;

  return Math.max(20, Math.min(500, base));
}

function detectLayers(task: TaskForScoring): string[] {
  const layers = new Set<string>();
  const allPaths = [task.file_path, ...task.siblingPaths];
  const text = `${task.title} ${task.description || ''}`.toLowerCase();

  for (const p of allPaths) {
    if (p.includes('apps/web/') || p.includes('src/features/') || p.includes('.tsx')) {
      layers.add('frontend');
    }
    if (p.includes('supabase/functions/') || p.includes('edge-function')) {
      layers.add('backend');
    }
    if (p.includes('packages/') || p.includes('shared/') || p.includes('lib/')) {
      layers.add('shared');
    }
  }

  if (text.includes('ui') || text.includes('component') || text.includes('panel'))
    layers.add('frontend');
  if (text.includes('api') || text.includes('endpoint') || text.includes('handler'))
    layers.add('backend');

  if (layers.size === 0) layers.add('unknown');
  return Array.from(layers);
}

function analyzeDependencies(task: TaskForScoring): number {
  const taskDir = task.file_path.split('/').slice(0, -1).join('/');
  let depth = 0;

  for (const sp of task.siblingPaths) {
    const sibDir = sp.split('/').slice(0, -1).join('/');
    if (sibDir === taskDir)
      depth += 1; // Co-located = related
    else if (sharePrefix(taskDir, sibDir, 2)) depth += 1; // Near siblings
  }

  const text = `${task.title} ${task.description || ''}`.toLowerCase();
  const depKeywords = ['import', 'depend', 'require', 'use', 'integrate', 'connect'];
  for (const kw of depKeywords) {
    if (text.includes(kw)) {
      depth += 1;
      break;
    }
  }

  return Math.min(depth, 8);
}

function sharePrefix(a: string, b: string, minParts: number): boolean {
  const aParts = a.split('/');
  const bParts = b.split('/');
  let shared = 0;
  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    if (aParts[i] === bParts[i]) shared++;
    else break;
  }
  return shared >= minParts;
}

// ── Main Scorer ──

export function scoreTask(task: TaskForScoring, threshold = DEFAULT_THRESHOLD): ComplexityScore {
  const factors = {
    file_count: scoreFileCount(task),
    line_estimate: scoreLineEstimate(task),
    layer_span: scoreLayerSpan(task),
    dependency_depth: scoreDependencyDepth(task),
  };

  const total = Math.round(
    factors.file_count.score * WEIGHTS.file_count +
      factors.line_estimate.score * WEIGHTS.line_estimate +
      factors.layer_span.score * WEIGHTS.layer_span +
      factors.dependency_depth.score * WEIGHTS.dependency_depth
  );

  return {
    total,
    threshold,
    split_recommended: total >= threshold,
    factors,
    scored_at: new Date().toISOString(),
  };
}
