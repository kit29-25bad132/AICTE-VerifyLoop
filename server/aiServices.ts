import { getGeminiClient, isGeminiAvailable } from './geminiClient.js';
import { dbStore } from './dbStore.js';
import {
  DocumentRecord,
  ExtractedEntity,
  ExtractedRelationship,
  RiskItem,
  ConflictItem,
  ActionItem,
  DeadlineItem,
  ComplianceItem,
  ChangeImpactAnalysis,
  CopilotMessage,
  User
} from '../src/types.js';

export async function extractDocumentIntelligence(doc: DocumentRecord): Promise<{
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  risks: RiskItem[];
  actions: ActionItem[];
  deadlines: DeadlineItem[];
  compliance: ComplianceItem[];
}> {
  const gemini = getGeminiClient();
  const textSample = doc.rawText.slice(0, 12000);

  if (!gemini || !isGeminiAvailable() || !textSample.trim()) {
    // Return deterministic fallback extraction if Gemini API key not present or text is empty
    return extractFallbackIntelligence(doc);
  }

  try {
    const prompt = `You are the chief AI Document Intelligence engine for AICTE VerifyLoop.
Analyze the following organizational document text with absolute fidelity. Extract structured intelligence.
Strict Rule: Only extract what is explicitly backed by evidence in the text. Do not invent or hallucinate.

Document Title: ${doc.title}
Document Department: ${doc.department}
Document Raw Text:
"""
${textSample}
"""

Provide your response strictly in the following valid JSON format:
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "ORGANIZATION" | "VENDOR" | "PERSON" | "ROLE" | "DEPARTMENT" | "PROJECT" | "CONTRACT" | "LOCATION" | "MONEY",
      "pageNumber": 1,
      "evidence": "Direct quote from text showing entity",
      "confidence": 0.95
    }
  ],
  "relationships": [
    {
      "sourceEntity": "Source Name",
      "targetEntity": "Target Name",
      "relationType": "CONTRACTED_TO" | "OBLIGATED_TO" | "GOVERNS" | "SUPERVISES" | "DELIVERS_TO",
      "pageNumber": 1,
      "evidence": "Direct quote demonstrating relationship",
      "confidence": 0.95
    }
  ],
  "risks": [
    {
      "title": "Clear concise risk title",
      "reason": "Why this is a risk based on the document",
      "category": "DEADLINE" | "CONTRACT" | "COMPLIANCE" | "FINANCIAL" | "SLA" | "DEPENDENCY",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "pageNumber": 1,
      "evidence": "Exact clause or sentence text",
      "recommendedAction": "Actionable operational mitigation"
    }
  ],
  "actions": [
    {
      "action": "Specific task or obligation",
      "responsibleRole": "Specific role mentioned (e.g. Chief Electrical Engineer)",
      "pageNumber": 1,
      "deadline": "YYYY-MM-DD or empty string",
      "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "evidence": "Exact obligation clause quote"
    }
  ],
  "deadlines": [
    {
      "title": "Milestone or requirement deadline",
      "dueDate": "YYYY-MM-DD or approximate date string",
      "responsibleRole": "Role name",
      "category": "Contractual" | "Safety" | "Milestone",
      "pageNumber": 1,
      "evidence": "Exact clause text"
    }
  ],
  "compliance": [
    {
      "standard": "Statutory rule or Act",
      "clauseReference": "Section reference",
      "requirement": "Operational standard requirement",
      "status": "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT" | "INSUFFICIENT_EVIDENCE",
      "pageNumber": 1,
      "evidence": "Direct quote",
      "riskAssessment": "Compliance impact assessment"
    }
  ]
}`;

    const response = await gemini.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const jsonText = response.text?.trim() || '{}';
    const parsed = JSON.parse(jsonText);

    const now = new Date().toISOString();
    const entities: ExtractedEntity[] = (parsed.entities || []).map((e: any, idx: number) => ({
      id: `ent-${doc.id}-${idx}`,
      documentId: doc.id,
      documentTitle: doc.title,
      name: e.name || 'Unknown Entity',
      type: e.type || 'ORGANIZATION',
      pageNumber: Number(e.pageNumber) || 1,
      evidence: e.evidence || '',
      confidence: Number(e.confidence) || 0.9
    }));

    const relationships: ExtractedRelationship[] = (parsed.relationships || []).map((r: any, idx: number) => ({
      id: `rel-${doc.id}-${idx}`,
      sourceEntity: r.sourceEntity || doc.title,
      targetEntity: r.targetEntity || 'Institute',
      relationType: r.relationType || 'CONTRACTED_TO',
      documentId: doc.id,
      documentTitle: doc.title,
      pageNumber: Number(r.pageNumber) || 1,
      evidence: r.evidence || '',
      confidence: Number(r.confidence) || 0.9
    }));

    const risks: RiskItem[] = (parsed.risks || []).map((rk: any, idx: number) => ({
      id: `risk-${doc.id}-${idx}`,
      title: rk.title || 'Extracted Operational Risk',
      reason: rk.reason || '',
      category: rk.category || 'CONTRACT',
      severity: rk.severity || 'MEDIUM',
      documentId: doc.id,
      documentTitle: doc.title,
      pageNumber: Number(rk.pageNumber) || 1,
      evidence: rk.evidence || '',
      recommendedAction: rk.recommendedAction || 'Review contractual terms with departmental head.',
      isVerified: false,
      createdAt: now,
      isSyntheticDemo: false
    }));

    const actions: ActionItem[] = (parsed.actions || []).map((ac: any, idx: number) => ({
      id: `act-${doc.id}-${idx}`,
      action: ac.action || 'Operational Obligation',
      responsibleRole: ac.responsibleRole || 'Operations Officer',
      documentId: doc.id,
      documentTitle: doc.title,
      pageNumber: Number(ac.pageNumber) || 1,
      deadline: ac.deadline || undefined,
      priority: ac.priority || 'MEDIUM',
      status: 'PENDING',
      evidence: ac.evidence || '',
      createdAt: now,
      isSyntheticDemo: false
    }));

    const deadlines: DeadlineItem[] = (parsed.deadlines || []).map((dl: any, idx: number) => ({
      id: `dl-${doc.id}-${idx}`,
      title: dl.title || 'Operational Target Date',
      dueDate: dl.dueDate || '2026-12-31',
      daysRemaining: calculateDaysRemaining(dl.dueDate),
      status: calculateDaysRemaining(dl.dueDate) < 0 ? 'OVERDUE' : (calculateDaysRemaining(dl.dueDate) < 14 ? 'DUE_SOON' : 'UPCOMING'),
      documentId: doc.id,
      documentTitle: doc.title,
      pageNumber: Number(dl.pageNumber) || 1,
      responsibleRole: dl.responsibleRole || 'Project Lead',
      category: dl.category || 'Milestone',
      evidence: dl.evidence || '',
      isSyntheticDemo: false
    }));

    const compliance: ComplianceItem[] = (parsed.compliance || []).map((cp: any, idx: number) => ({
      id: `cmp-${doc.id}-${idx}`,
      standard: cp.standard || 'AICTE Standard',
      clauseReference: cp.clauseReference || 'Clause Ref',
      requirement: cp.requirement || 'Statutory Requirement',
      status: cp.status || 'COMPLIANT',
      documentId: doc.id,
      documentTitle: doc.title,
      pageNumber: Number(cp.pageNumber) || 1,
      evidence: cp.evidence || '',
      riskAssessment: cp.riskAssessment || '',
      lastChecked: now,
      isSyntheticDemo: false
    }));

    return { entities, relationships, risks, actions, deadlines, compliance };
  } catch (err) {
    console.error('Error during Gemini document extraction:', err);
    return extractFallbackIntelligence(doc);
  }
}

function calculateDaysRemaining(dateStr?: string): number {
  if (!dateStr) return 30;
  try {
    const target = new Date(dateStr).getTime();
    const today = new Date().getTime();
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    return isNaN(diffDays) ? 30 : diffDays;
  } catch {
    return 30;
  }
}

function extractFallbackIntelligence(doc: DocumentRecord) {
  const text = doc.rawText || '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const now = new Date().toISOString();

  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];
  const risks: RiskItem[] = [];
  const actions: ActionItem[] = [];
  const deadlines: DeadlineItem[] = [];
  const compliance: ComplianceItem[] = [];

  // Extract simple patterns (vendor, clauses, SLA, penalty)
  if (doc.metadata.vendor) {
    entities.push({
      id: `ent-${doc.id}-0`,
      documentId: doc.id,
      documentTitle: doc.title,
      name: doc.metadata.vendor,
      type: 'VENDOR',
      pageNumber: 1,
      evidence: `Primary Vendor: ${doc.metadata.vendor}`,
      confidence: 0.98
    });
    relationships.push({
      id: `rel-${doc.id}-0`,
      sourceEntity: 'Institute',
      targetEntity: doc.metadata.vendor,
      relationType: 'CONTRACTED_TO',
      documentId: doc.id,
      documentTitle: doc.title,
      pageNumber: 1,
      evidence: `Contract executed with ${doc.metadata.vendor}`,
      confidence: 0.95
    });
  }

  // Scan lines for risk or action words
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (lower.includes('penalty') || lower.includes('liquidated damages') || lower.includes('failure') || lower.includes('risk')) {
      risks.push({
        id: `risk-${doc.id}-${risks.length}`,
        title: line.slice(0, 60) + (line.length > 60 ? '...' : ''),
        reason: 'Contractual liability / performance risk clause identified.',
        category: lower.includes('sla') ? 'SLA' : 'CONTRACT',
        severity: lower.includes('critical') || lower.includes('halt') ? 'CRITICAL' : 'HIGH',
        documentId: doc.id,
        documentTitle: doc.title,
        pageNumber: Math.min(Math.floor(i / 10) + 1, doc.pageCount || 1),
        evidence: line,
        recommendedAction: 'Verify compliance milestones and operational tracking with department lead.',
        isVerified: false,
        createdAt: now,
        isSyntheticDemo: doc.isSyntheticDemo
      });
    }

    if (lower.includes('must') || lower.includes('shall') || lower.includes('mandator') || lower.includes('required')) {
      actions.push({
        id: `act-${doc.id}-${actions.length}`,
        action: line.slice(0, 90) + (line.length > 90 ? '...' : ''),
        responsibleRole: doc.department + ' Lead',
        documentId: doc.id,
        documentTitle: doc.title,
        pageNumber: Math.min(Math.floor(i / 10) + 1, doc.pageCount || 1),
        priority: lower.includes('penalty') ? 'HIGH' : 'MEDIUM',
        status: 'PENDING',
        evidence: line,
        createdAt: now,
        isSyntheticDemo: doc.isSyntheticDemo
      });
    }
  }

  return { entities, relationships, risks, actions, deadlines, compliance };
}

export async function askEvidenceGroundedCopilot(
  question: string,
  user: User
): Promise<CopilotMessage> {
  const startTime = Date.now();
  const searchResults = dbStore.searchDocuments(question, user, 0.1);
  const gemini = getGeminiClient();

  if (searchResults.length === 0) {
    return {
      id: `cop-${Date.now()}`,
      sender: 'assistant',
      content: 'I could not find sufficient evidence in the authorized documents to answer your question.',
      timestamp: new Date().toISOString(),
      citations: [],
      confidenceScore: 0,
      noEvidenceFound: true,
      processingTimeMs: Date.now() - startTime
    };
  }

  const evidenceSnippets = searchResults.slice(0, 5).map((r, i) => {
    const snippet = `[Evidence ${i + 1}] Document: "${r.documentTitle}" (Page ${r.pageNumber})`;
    return `${snippet}Quote: "${r.text}"`;
  }).join('\n');

  if (!gemini || !isGeminiAvailable()) {
    // Fallback response grounded purely in matched chunks
    const top = searchResults[0];
    return {
      id: `cop-${Date.now()}`,
      sender: 'assistant',
      content: `Based on authorized records in **${top.documentTitle}** (Page ${top.pageNumber}):\n\n> "${top.text}"\n\n*Note: Operating in local evidence extraction mode.*`,
      timestamp: new Date().toISOString(),
      citations: [
        {
          documentId: top.documentId,
          documentTitle: top.documentTitle,
          pageNumber: top.pageNumber,
          quote: top.text,
          confidence: 0.92
        }
      ],
      confidenceScore: 0.92,
      processingTimeMs: Date.now() - startTime
    };
  }

  try {
    const prompt = `You are the evidence-grounded AI Copilot for AICTE VerifyLoop (AICTE-SIH 2026).
STRICT RULE:
"NO EVIDENCE -> NO CLAIM"
Every factual answer must be strictly derived from the provided evidence snippets below.
If the evidence does not contain sufficient facts to answer the question, state:
"I could not find sufficient evidence in the authorized documents."

Do not hallucinate or make claims without citing the exact Document and Page number.

User Question: "${question}"

Authorized Evidence Snippets:
${evidenceSnippets}

Respond strictly in JSON format:
{
  "answer": "Clear, professional, evidence-backed answer formatted in markdown.",
  "confidenceScore": 0.95,
  "noEvidenceFound": false,
  "citations": [
    {
      "documentTitle": "Exact document title from snippet",
      "pageNumber": 1,
      "quote": "Verbatim quote from the evidence supporting the statement",
      "confidence": 0.95
    }
  ]
}`;

    const response = await gemini.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const citations = (parsed.citations || []).map((c: any) => {
      const matchDoc = dbStore.documents.find(d => d.title.toLowerCase().includes((c.documentTitle || '').toLowerCase()));
      return {
        documentId: matchDoc?.id || searchResults[0]?.documentId || 'doc-ref',
        documentTitle: c.documentTitle || searchResults[0]?.documentTitle || 'Document Evidence',
        pageNumber: Number(c.pageNumber) || 1,
        quote: c.quote || '',
        confidence: Number(c.confidence) || 0.9
      };
    });

    return {
      id: `cop-${Date.now()}`,
      sender: 'assistant',
      content: parsed.answer || 'I could not find sufficient evidence in the authorized documents.',
      timestamp: new Date().toISOString(),
      citations,
      confidenceScore: Number(parsed.confidenceScore) || 0.9,
      noEvidenceFound: parsed.noEvidenceFound === true,
      processingTimeMs: Date.now() - startTime
    };
  } catch (err) {
    console.error('Error calling Gemini for copilot answer:', err);
    const top = searchResults[0];
    return {
      id: `cop-${Date.now()}`,
      sender: 'assistant',
      content: `Based on evidence found in **${top.documentTitle}** (Page ${top.pageNumber}):\n\n> "${top.text}"`,
      timestamp: new Date().toISOString(),
      citations: [
        {
          documentId: top.documentId,
          documentTitle: top.documentTitle,
          pageNumber: top.pageNumber,
          quote: top.text,
          confidence: 0.88
        }
      ],
      confidenceScore: 0.88,
      processingTimeMs: Date.now() - startTime
    };
  }
}

export async function simulateDocumentChangeImpact(
  baseDocumentId: string,
  newVersionText: string,
  newVersionLabel: string
): Promise<ChangeImpactAnalysis> {
  const baseDoc = dbStore.documents.find(d => d.id === baseDocumentId);
  const gemini = getGeminiClient();
  const now = new Date().toISOString();

  if (!baseDoc) {
    throw new Error('Base document not found for change impact simulation');
  }

  const existingDocsSummary = dbStore.documents
    .filter(d => d.id !== baseDocumentId)
    .map(d => `- [${d.id}] "${d.title}" (${d.type}, Dept: ${d.department})`)
    .join('\n');

  if (!gemini || !isGeminiAvailable()) {
    // Return structured impact diff
    return {
      id: `imp-${Date.now()}`,
      documentId: baseDoc.id,
      documentTitle: baseDoc.title,
      baseVersion: baseDoc.version,
      targetVersion: newVersionLabel || 'Proposed Revision',
      summaryOfChange: 'Simulated contractual variation analyzing clause modifications against active institutional operations.',
      changedClauses: [
        {
          id: 'diff-auto-1',
          section: 'Modified Clause',
          oldText: baseDoc.rawText.slice(0, 180),
          newText: newVersionText.slice(0, 180),
          changeType: 'MODIFIED',
          riskLevel: 'HIGH',
          impactDescription: 'Direct variation in operational obligations and timeline thresholds.'
        }
      ],
      affectedDocuments: dbStore.documents.filter(d => d.id !== baseDocumentId).slice(0, 2).map(d => ({
        id: d.id,
        title: d.title,
        relationshipType: 'OPERATIONAL_INTERFACE',
        impactSeverity: 'MEDIUM',
        impactReason: 'Interface coordination required with updated terms.',
        evidence: `Cross-departmental alignment with ${d.department}`
      })),
      affectedRelationships: [
        {
          source: 'Institute Operations',
          relation: 'OBLIGATED_TO_COMPLY',
          target: baseDoc.metadata.vendor || 'External Vendor',
          impact: 'Updated SLA and verification cycle applied.'
        }
      ],
      potentialRisks: [
        {
          category: 'CONTRACT',
          severity: 'HIGH',
          risk: 'Potential dispute on transition period and liquidated damages calculation.',
          evidence: 'Clause modification in proposed revision.'
        }
      ],
      recommendedActions: [
        {
          action: 'Convene joint technical committee with legal and engineering heads before execution.',
          role: 'Chief Operations Officer',
          priority: 'HIGH',
          deadlineDays: 5
        }
      ],
      humanVerificationStatus: 'PENDING_REVIEW',
      createdAt: now,
      isSyntheticDemo: baseDoc.isSyntheticDemo
    };
  }

  try {
    const prompt = `You are the Change Impact Simulator engine for AICTE VerifyLoop.
Analyze what happens when an organizational document changes.
Determine what that change can affect across related documents, contracts, SLAs, vendors, and workflows.

Main USP Rule: "We don't just detect what changed. We determine what that change can affect."

Base Document: "${baseDoc.title}" (Version: ${baseDoc.version})
Base Document Original Text:
"""
${baseDoc.rawText.slice(0, 6000)}
"""

New Revision Text:
"""
${newVersionText.slice(0, 6000)}
"""

Active Organizational Ecosystem (Other Documents in Institute):
${existingDocsSummary || 'No other active documents.'}

Respond strictly in JSON format:
{
  "summaryOfChange": "High-level summary of what was altered and why it matters",
  "changedClauses": [
    {
      "section": "Clause reference / title",
      "oldText": "Original wording",
      "newText": "New wording",
      "changeType": "MODIFIED" | "ADDED" | "DELETED",
      "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "impactDescription": "Precise explanation of operational impact"
    }
  ],
  "affectedDocuments": [
    {
      "title": "Title of potentially impacted document from the institute ecosystem",
      "relationshipType": "INTERFACE_DEPENDENCY" | "SLA_CASCADE" | "FINANCIAL_IMPACT" | "SAFETY_PROTOCOL",
      "impactSeverity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "impactReason": "Why and how this document is affected",
      "evidence": "Evidence grounding the cross-document impact"
    }
  ],
  "affectedRelationships": [
    {
      "source": "Source entity / department",
      "relation": "Relationship type",
      "target": "Target entity / department",
      "impact": "Operational ripple effect"
    }
  ],
  "potentialRisks": [
    {
      "category": "DEADLINE" | "CONTRACT" | "COMPLIANCE" | "FINANCIAL" | "SLA" | "DEPENDENCY",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "risk": "Specific risk description",
      "evidence": "Clause grounding"
    }
  ],
  "recommendedActions": [
    {
      "action": "Immediate recommended mitigation or human approval task",
      "role": "Specific role to execute action",
      "priority": "HIGH" | "MEDIUM" | "CRITICAL",
      "deadlineDays": 7
    }
  ]
}`;

    const response = await gemini.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const analysis: ChangeImpactAnalysis = {
      id: `imp-${Date.now()}`,
      documentId: baseDoc.id,
      documentTitle: baseDoc.title,
      baseVersion: baseDoc.version,
      targetVersion: newVersionLabel || 'Proposed Revision',
      summaryOfChange: parsed.summaryOfChange || 'Clause-by-clause comparative impact analysis complete.',
      changedClauses: (parsed.changedClauses || []).map((c: any, idx: number) => ({
        id: `diff-${idx}`,
        section: c.section || `Clause ${idx + 1}`,
        oldText: c.oldText || '',
        newText: c.newText || '',
        changeType: c.changeType || 'MODIFIED',
        riskLevel: c.riskLevel || 'MEDIUM',
        impactDescription: c.impactDescription || ''
      })),
      affectedDocuments: (parsed.affectedDocuments || []).map((ad: any) => {
        const found = dbStore.documents.find(d => d.title.toLowerCase().includes((ad.title || '').toLowerCase()));
        return {
          id: found?.id || 'doc-aff',
          title: ad.title || 'Related Document',
          relationshipType: ad.relationshipType || 'INTERFACE_DEPENDENCY',
          impactSeverity: ad.impactSeverity || 'MEDIUM',
          impactReason: ad.impactReason || 'Cross-system operational dependency.',
          evidence: ad.evidence || ''
        };
      }),
      affectedRelationships: parsed.affectedRelationships || [],
      potentialRisks: parsed.potentialRisks || [],
      recommendedActions: parsed.recommendedActions || [],
      humanVerificationStatus: 'PENDING_REVIEW',
      createdAt: now,
      isSyntheticDemo: baseDoc.isSyntheticDemo
    };

    return analysis;
  } catch (err) {
    console.error('Error running change impact simulation:', err);
    throw err;
  }
}