import { getRecentByProject, countSessionsSince, getSessionsSince } from '../storage/sqlite.js';

export interface AgentsMdOptions {
  project: string;
  days?: number;
}

interface GroupedObservations {
  bugfix: string[];
  feature: string[];
  decision: string[];
  refactor: string[];
  discovery: string[];
  feedback: string[];
  reference: string[];
}

interface SessionInfo {
  sessionId: string;
  startedAt: string;
  observationCount: number;
}

export async function generateAgentsMd(options: AgentsMdOptions): Promise<string> {
  const { project, days = 7 } = options;
  const sinceEpoch = Date.now() - days * 24 * 60 * 60 * 1000;

  const observations = await getRecentByProject(project, days);
  const sessions = await getSessionsSince(project, sinceEpoch);

  const obsBySession = new Map<string, any[]>();
  for (const obs of observations) {
    const sessionId = obs.session_id;
    if (!obsBySession.has(sessionId)) obsBySession.set(sessionId, []);
    obsBySession.get(sessionId)!.push(obs);
  }

  const sessionMap = new Map<string, SessionInfo>();
  for (const s of sessions) {
    const sessionObs = obsBySession.get(s.opencode_session_id) || [];
    sessionMap.set(s.opencode_session_id, {
      sessionId: s.opencode_session_id,
      startedAt: s.started_at,
      observationCount: sessionObs.length
    });
  }

  const grouped: GroupedObservations = {
    bugfix: [],
    feature: [],
    decision: [],
    refactor: [],
    discovery: [],
    feedback: [],
    reference: []
  };

  for (const obs of observations) {
    const date = (obs as any).created_at ? new Date((obs as any).created_at).toISOString().split('T')[0] : 'unknown';
    const entry = `- ${obs.title} (${date})`;

    switch (obs.type) {
      case 'bugfix': grouped.bugfix.push(entry); break;
      case 'feature': grouped.feature.push(entry); break;
      case 'decision': grouped.decision.push(entry); break;
      case 'refactor': grouped.refactor.push(entry); break;
      case 'discovery': grouped.discovery.push(entry); break;
      case 'feedback': grouped.feedback.push(entry); break;
      case 'reference': grouped.reference.push(entry); break;
    }
  }

  const totalObs = observations.length;
  const totalSessions = sessions.length;
  const lastActive = sessions.length > 0
    ? sessions[0].started_at.split('T')[0]
    : 'no recent activity';

  const lines: string[] = [];
  lines.push('## Project Context');
  lines.push('');
  lines.push('### Recent Activity');
  lines.push(`- **Sessions**: ${totalSessions} sessions, ${totalObs} observations`);
  lines.push(`- **Last active**: ${lastActive}`);
  lines.push('');

  const addSection = (title: string, items: string[]) => {
    if (items.length > 0) {
      lines.push(`### ${title}`);
      lines.push(...items);
      lines.push('');
    }
  };

  addSection('Bugfixes', grouped.bugfix);
  addSection('Features', grouped.feature);
  addSection('Decisions', grouped.decision);
  addSection('Refactors', grouped.refactor);
  addSection('Discoveries', grouped.discovery);
  addSection('Feedback', grouped.feedback);
  addSection('References', grouped.reference);

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}