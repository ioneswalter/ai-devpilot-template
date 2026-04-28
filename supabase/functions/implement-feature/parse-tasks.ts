/**
 * Parse SpecKit tasks.md into structured implementation tasks.
 * Extracts task ID, title, file path, and task type from markdown checkboxes.
 */

export interface ParsedTask {
  task_id: string;
  title: string;
  description: string;
  file_path: string;
  task_type: 'create' | 'modify' | 'test' | 'config';
  journey: string | null;
  parallel: boolean;
}

/**
 * Parse tasks.md content into structured tasks.
 * Expects format: `- [ ] T### [P?] [J#?] Description with file path`
 */
export function parseTasksMarkdown(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = content.split('\n');

  let currentPhase = '';

  for (const line of lines) {
    // Track phase/section headers
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentPhase = headerMatch[1].trim();
      continue;
    }

    // Match task lines: - [ ] T### ... or - [x] T### ...
    const taskMatch = line.match(/^-\s+\[[ xX]?\]\s+(T\d+)\s+(.*)/);
    if (!taskMatch) continue;

    const taskId = taskMatch[1];
    let remainder = taskMatch[2].trim();

    // Extract [P] parallel marker
    const parallel = /\[P\]/.test(remainder);
    remainder = remainder.replace(/\[P\]\s*/, '');

    // Extract [J#] journey marker
    const journeyMatch = remainder.match(/\[J(\d+)\]\s*/);
    const journey = journeyMatch ? `J${journeyMatch[1]}` : null;
    remainder = remainder.replace(/\[J\d+\]\s*/, '');

    // Extract file path from the description
    const filePath = extractFilePath(remainder);

    // Determine task type from context
    const taskType = inferTaskType(remainder, filePath, currentPhase);

    tasks.push({
      task_id: taskId,
      title: `${taskId}: ${truncate(remainder, 120)}`,
      description: remainder,
      file_path: filePath,
      task_type: taskType,
      journey,
      parallel,
    });
  }

  return tasks;
}

/** Extract the most likely file path from a task description */
function extractFilePath(text: string): string {
  // Match common path patterns
  const pathPatterns = [
    // Explicit paths like apps/web/src/... or supabase/functions/...
    /(?:in|to|at|from|modify|create|update)\s+([\w./-]+\/[\w.-]+\.\w+)/i,
    // Standalone paths with file extensions
    /((?:apps|supabase|packages|prisma|scripts)\/[\w./-]+\.\w+)/,
    // Any path with at least one slash and an extension
    /([\w-]+\/[\w./-]+\.\w{1,5})/,
  ];

  for (const pattern of pathPatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return 'TBD';
}

/** Infer task type from description and context */
function inferTaskType(
  text: string,
  filePath: string,
  phase: string
): 'create' | 'modify' | 'test' | 'config' {
  const lower = text.toLowerCase();
  const phaseLower = phase.toLowerCase();

  if (lower.includes('test') || filePath.includes('test') || filePath.includes('spec')) {
    return 'test';
  }
  if (
    filePath.includes('schema.prisma') ||
    filePath.includes('migration') ||
    filePath.endsWith('.json') ||
    filePath.endsWith('.yaml')
  ) {
    return 'config';
  }
  if (
    lower.startsWith('create') ||
    lower.startsWith('add') ||
    lower.startsWith('build') ||
    lower.startsWith('implement')
  ) {
    return 'create';
  }
  if (lower.startsWith('modify') || lower.startsWith('update') || lower.startsWith('fix')) {
    return 'modify';
  }
  if (phaseLower.includes('setup') || phaseLower.includes('config')) {
    return 'config';
  }

  return 'create';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}
