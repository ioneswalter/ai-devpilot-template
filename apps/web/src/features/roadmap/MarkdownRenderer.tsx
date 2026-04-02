/**
 * MarkdownRenderer — Lightweight markdown-to-JSX renderer for spec artifacts.
 * Handles: headings, bold/italic, tables, checklists, lists, code blocks, HR.
 * No external dependencies — built for the patterns in SpecKit output.
 */

import { type ReactNode } from 'react';

interface MarkdownRendererProps {
  content: string;
}

type LineToken =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'hr' }
  | { type: 'checkbox'; checked: boolean; text: string }
  | { type: 'ul'; text: string }
  | { type: 'ol'; num: string; text: string }
  | { type: 'table_row'; cells: string[]; isHeader?: boolean }
  | { type: 'table_sep' }
  | { type: 'code_fence'; lang?: string }
  | { type: 'code_line'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'text'; text: string }
  | { type: 'empty' };

function tokenize(content: string): LineToken[] {
  const lines = content.split('\n');
  const tokens: LineToken[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        tokens.push({ type: 'code_fence' });
        inCode = false;
      } else {
        tokens.push({ type: 'code_fence', lang: line.slice(3).trim() || undefined });
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      tokens.push({ type: 'code_line', text: line });
      continue;
    }
    if (line.trim() === '') { tokens.push({ type: 'empty' }); continue; }
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      tokens.push({ type: 'hr' }); continue;
    }
    if (line.startsWith('#### ')) { tokens.push({ type: 'h4', text: line.slice(5) }); continue; }
    if (line.startsWith('### ')) { tokens.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## ')) { tokens.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# ')) { tokens.push({ type: 'h1', text: line.slice(2) }); continue; }
    if (/^\|[-:\s|]+\|$/.test(line.trim())) { tokens.push({ type: 'table_sep' }); continue; }
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      tokens.push({ type: 'table_row', cells });
      continue;
    }
    if (/^[-*]\s+\[[ xX]\]/.test(line.trimStart())) {
      const checked = /\[[xX]\]/.test(line);
      const text = line.replace(/^[\s]*[-*]\s+\[[ xX]\]\s*/, '');
      tokens.push({ type: 'checkbox', checked, text });
      continue;
    }
    if (/^[-*]\s/.test(line.trimStart())) {
      const text = line.replace(/^[\s]*[-*]\s/, '');
      tokens.push({ type: 'ul', text });
      continue;
    }
    if (/^\d+\.\s/.test(line.trimStart())) {
      const match = line.trimStart().match(/^(\d+)\.\s(.*)/);
      if (match) { tokens.push({ type: 'ol', num: match[1], text: match[2] }); continue; }
    }
    if (line.trimStart().startsWith('> ')) {
      tokens.push({ type: 'blockquote', text: line.trimStart().slice(2) }); continue;
    }
    tokens.push({ type: 'text', text: line });
  }
  return tokens;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Bold+italic, bold, italic, inline code, Given/When/Then keywords
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\b(Given|When|Then)\b)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++} className="font-bold italic">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<strong key={key++} className="font-semibold text-gray-900">{match[3]}</strong>);
    } else if (match[4]) {
      parts.push(<em key={key++}>{match[4]}</em>);
    } else if (match[5]) {
      parts.push(<code key={key++} className="px-1 py-0.5 bg-gray-100 text-pink-600 rounded text-[11px]">{match[5]}</code>);
    } else if (match[6]) {
      parts.push(<span key={key++} className="font-semibold text-indigo-600">{match[6]}</span>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const tokens = tokenize(content);
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === 'h1') {
      elements.push(<h2 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-2 pb-1 border-b">{renderInline(t.text)}</h2>);
    } else if (t.type === 'h2') {
      elements.push(<h3 key={i} className="text-xs font-bold text-gray-800 mt-3 mb-1.5 uppercase tracking-wide">{renderInline(t.text)}</h3>);
    } else if (t.type === 'h3') {
      elements.push(<h4 key={i} className="text-xs font-semibold text-gray-700 mt-2 mb-1">{renderInline(t.text)}</h4>);
    } else if (t.type === 'h4') {
      elements.push(<h5 key={i} className="text-xs font-medium text-gray-600 mt-1.5 mb-1">{renderInline(t.text)}</h5>);
    } else if (t.type === 'hr') {
      elements.push(<hr key={i} className="my-3 border-gray-200" />);
    } else if (t.type === 'blockquote') {
      elements.push(
        <div key={i} className="border-l-2 border-gray-300 pl-2 my-1 text-xs text-gray-500 italic">
          {renderInline(t.text)}
        </div>
      );
    } else if (t.type === 'checkbox') {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs">
          <span className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
            t.checked ? 'bg-green-100 border-green-400 text-green-600' : 'border-gray-300'
          }`}>
            {t.checked && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </span>
          <span className="text-gray-700">{renderInline(t.text)}</span>
        </div>
      );
    } else if (t.type === 'ul') {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs pl-1">
          <span className="mt-1 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
          <span className="text-gray-700">{renderInline(t.text)}</span>
        </div>
      );
    } else if (t.type === 'ol') {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs pl-1">
          <span className="text-gray-400 font-mono shrink-0 w-4 text-right">{t.num}.</span>
          <span className="text-gray-700">{renderInline(t.text)}</span>
        </div>
      );
    } else if (t.type === 'table_row') {
      // Collect consecutive table rows
      const rows: { cells: string[]; isHeader: boolean }[] = [];
      let j = i;
      let headerDone = false;
      while (j < tokens.length && (tokens[j].type === 'table_row' || tokens[j].type === 'table_sep')) {
        if (tokens[j].type === 'table_sep') { headerDone = true; j++; continue; }
        const row = tokens[j] as { type: 'table_row'; cells: string[] };
        rows.push({ cells: row.cells, isHeader: !headerDone });
        j++;
      }
      elements.push(
        <div key={i} className="my-2 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            {rows.some(r => r.isHeader) && (
              <thead>
                {rows.filter(r => r.isHeader).map((row, ri) => (
                  <tr key={ri} className="bg-gray-50">
                    {row.cells.map((cell, ci) => (
                      <th key={ci} className="px-2 py-1.5 text-left font-semibold text-gray-600 border border-gray-200">
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
            )}
            <tbody>
              {rows.filter(r => !r.isHeader).map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  {row.cells.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-gray-700 border border-gray-200">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j;
      continue;
    } else if (t.type === 'code_fence') {
      // Collect code lines until closing fence
      const codeLines: string[] = [];
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== 'code_fence') {
        codeLines.push((tokens[j] as { type: 'code_line'; text: string }).text ?? '');
        j++;
      }
      elements.push(
        <pre key={i} className="my-2 p-2 bg-gray-900 text-green-300 rounded text-[11px] font-mono overflow-x-auto leading-relaxed">
          {codeLines.join('\n')}
        </pre>
      );
      i = j + 1;
      continue;
    } else if (t.type === 'text') {
      elements.push(<p key={i} className="text-xs text-gray-700 py-0.5 leading-relaxed">{renderInline(t.text)}</p>);
    }
    // Skip empty lines (spacing handled by margins)

    i++;
  }

  return <div className="space-y-0">{elements}</div>;
}
