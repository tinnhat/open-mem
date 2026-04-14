import { search } from '../search/progressive.js';
import { getSessionSummary } from '../storage/sqlite.js';

export async function injectPriorContext(sessionId: string): Promise<void> {
  const project = process.cwd();

  const [recentResults, lastSummary] = await Promise.all([
    search('', { project, limit: 5 }),
    getSessionSummary(sessionId),
  ]);

  const lines: string[] = ['## Prior Context from open-mem'];

  if (lastSummary) {
    lines.push('');
    lines.push('### Last Session Summary');
    if (lastSummary.request) lines.push(`**Request:** ${lastSummary.request}`);
    if (lastSummary.completed) lines.push(`**Completed:** ${lastSummary.completed}`);
    if (lastSummary.next_steps) lines.push(`**Next Steps:** ${lastSummary.next_steps}`);
  }

  if (recentResults.length > 0) {
    lines.push('');
    lines.push('### Recent Memories');
    for (const obs of recentResults) {
      lines.push(`- [${obs.type}] ${obs.title} (${obs.createdAt})`);
    }
  }

  lines.push('');
  lines.push('To learn more: use the mem-search skill or query /api/search');

  console.log(lines.join('\n'));
}