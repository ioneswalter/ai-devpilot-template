/**
 * Build-time parser for the project constitution.
 * Imports constitution.md as raw text via Vite and extracts structured data
 * so the Architecture page stays automatically in sync.
 */

import constitutionRaw from '../../../../.specify/memory/constitution.md?raw';

export interface Principle {
  number: string;
  title: string;
  description: string;
  nonNegotiable: boolean;
}

export interface TechStackSection {
  title: string;
  items: string[];
}

export interface ConstitutionData {
  principles: Principle[];
  techStack: TechStackSection[];
  monorepoStructure: string;
  memberPrice: string;
  foundingPrice: string;
  foundingCount: string;
  memberFee: string;
  associateFee: string;
  version: string;
}

/** Extract content between a ## header and the next ## header (or end of file) */
function extractSection(content: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1] : '';
}

function parsePrinciples(content: string): Principle[] {
  const section = extractSection(content, 'Core Principles');
  const principles: Principle[] = [];
  const parts = section.split(/(?=### [IVXLC]+\.)/);

  for (const part of parts) {
    const headerLine = part.split('\n')[0];
    const headerMatch = headerLine.match(/^### ([IVXLC]+)\.\s+(.+?)(?:\s+\(NON-NEGOTIABLE\))?$/);
    if (!headerMatch) continue;

    const nonNegotiable = headerLine.includes('(NON-NEGOTIABLE)');
    // Extract the MUST sentence as the description
    const mustMatch = part.match(/\*\*MUST\*\*\s+(.+?)(?::\s*$|\.)/m);
    const description = mustMatch ? mustMatch[1].trim() : '';

    principles.push({
      number: headerMatch[1],
      title: headerMatch[2].trim(),
      description,
      nonNegotiable,
    });
  }

  return principles;
}

function parseTechStack(content: string): TechStackSection[] {
  const section = extractSection(content, 'Technology Stack');
  const sections: TechStackSection[] = [];
  const parts = section.split(/(?=### )/);

  for (const part of parts) {
    const titleMatch = part.match(/^### (.+?)$/m);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    // Skip non-stack subsections
    if (title.includes('Approved Libraries') || title.includes('Library Approval')) continue;

    const items: string[] = [];
    for (const line of part.split('\n')) {
      const itemMatch = line.match(/^- \*\*(.+?)\*\*:\s*(.+)$/);
      if (itemMatch) {
        items.push(itemMatch[2].trim());
      }
    }

    if (items.length > 0) {
      sections.push({ title, items });
    }
  }

  return sections;
}

function parseMonorepoStructure(content: string): string {
  const section = extractSection(content, 'Monorepo Structure');
  const codeBlockMatch = section.match(/```\n([\s\S]*?)```/);
  return codeBlockMatch ? codeBlockMatch[1].trim() : '';
}

function parseVersion(content: string): string {
  const match = content.match(/\*\*Version\*\*:\s*(\S+)/);
  return match ? match[1] : '';
}

function parseBusinessModelData(content: string) {
  const section = extractSection(content, 'Cooperative Business Model');

  const priceMatch = section.match(/\$([0-9,]+).*?first\s+(\d+)\s+at\s+\$([0-9,]+)/);
  const coopFeeMatch = section.match(/Members?\s+pay\s+(\d+)%/i);
  const assocFeeMatch = section.match(/Associates?\s+pay\s+(\d+)%/i);

  return {
    memberPrice: priceMatch ? `$${priceMatch[1]}` : '$1,500',
    foundingPrice: priceMatch ? `$${priceMatch[3]}` : '$1,000',
    foundingCount: priceMatch ? priceMatch[2] : '300',
    memberFee: coopFeeMatch ? `${coopFeeMatch[1]}%` : '10%',
    associateFee: assocFeeMatch ? `${assocFeeMatch[1]}%` : '20%',
  };
}

export const constitution: ConstitutionData = {
  principles: parsePrinciples(constitutionRaw),
  techStack: parseTechStack(constitutionRaw),
  monorepoStructure: parseMonorepoStructure(constitutionRaw),
  version: parseVersion(constitutionRaw),
  ...parseBusinessModelData(constitutionRaw),
};
