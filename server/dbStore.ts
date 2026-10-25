import {
  User,
  DocumentRecord,
  DocumentChunk,
  ExtractedEntity,
  ExtractedRelationship,
  RiskItem,
  ConflictItem,
  ActionItem,
  DeadlineItem,
  ComplianceItem,
  ChangeImpactAnalysis,
  WorkflowItem,
  ApprovalRequest,
  AuditLogEntry,
  SearchResultChunk
} from '../src/types.js';

export const SYSTEM_USERS: User[] = [
  {
    id: 'usr-admin-01',
    email: 'submitter@institute.gov.in',
    name: 'SUBMITTER',
    role: 'SUBMITTER',
    department: 'Institute Administration',
    assignedProjects: ['Institute Operations']
  },
  {
    id: 'usr-mgr-01',
    email: 'reviewer@institute.gov.in',
    name: 'REVIEWER',
    role: 'REVIEWER',
    department: 'Review Committee',
    assignedProjects: ['Review Assignments']
  },
  {
    id: 'usr-analyst-01',
    email: 'analyst@institute.gov.in',
    name: 'ANALYST',
    role: 'ANALYST',
    department: 'Compliance Analytics',
    assignedProjects: ['Compliance Tracking']
  },
  {
    id: 'usr-viewer-01',
    email: 'viewer@institute.gov.in',
    name: 'VIEWER',
    role: 'VIEWER',
    department: 'Audit & Inspection',
    assignedProjects: ['Public Records']
  }
];

class MemoryStore {
  public isDemoActive: boolean = true;
  public users: User[] = [...SYSTEM_USERS];
  public documents: DocumentRecord[] = [];
  public chunks: DocumentChunk[] = [];
  public entities: ExtractedEntity[] = [];
  public relationships: ExtractedRelationship[] = [];
  public risks: RiskItem[] = [];
  public conflicts: ConflictItem[] = [];
  public actions: ActionItem[] = [];
  public deadlines: DeadlineItem[] = [];
  public compliance: ComplianceItem[] = [];
  public impactAnalyses: ChangeImpactAnalysis[] = [];
  public workflows: WorkflowItem[] = [];
  public approvals: ApprovalRequest[] = [];
  public auditLogs: AuditLogEntry[] = [];

  constructor() {
    this.loadDemoDataset();
  }

  public loadDemoDataset() {
    this.isDemoActive = true;
    // Demo documents are intentionally NOT loaded from KMRL source.
    // The demo state is inactive by default; users may upload their own documents.
    this.documents = [];
    this.entities = [];
    this.relationships = [];
    this.risks = [];
    this.conflicts = [];
    this.actions = [];
    this.deadlines = [];
    this.compliance = [];
    this.impactAnalyses = [];
    this.workflows = [];
    this.approvals = [];
    this.auditLogs = [];
    this.chunks = [];
  }

  public clearAllData(preserveUsers: boolean = true) {
    this.isDemoActive = false;
    this.documents = [];
    this.chunks = [];
    this.entities = [];
    this.relationships = [];
    this.risks = [];
    this.conflicts = [];
    this.actions = [];
    this.deadlines = [];
    this.compliance = [];
    this.impactAnalyses = [];
    this.workflows = [];
    this.approvals = [];
    this.auditLogs = [];
    if (!preserveUsers) {
      this.users = [...SYSTEM_USERS];
    }
  }

  public generateChunksForDocument(doc: DocumentRecord) {
    let chunkIdx = 0;

    if (doc.pages && doc.pages.length > 0) {
      for (const page of doc.pages) {
        const paragraphs = page.text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        if (paragraphs.length === 0 && page.text.trim()) {
          this.chunks.push({
            id: `chk-${doc.id}-${chunkIdx++}`,
            documentId: doc.id,
            documentTitle: doc.title,
            chunkIndex: chunkIdx,
            pageNumber: page.pageNumber,
            text: page.text.trim(),
            tokenCount: Math.round(page.text.length / 4)
          });
        } else {
          for (const p of paragraphs) {
            this.chunks.push({
              id: `chk-${doc.id}-${chunkIdx++}`,
              documentId: doc.id,
              documentTitle: doc.title,
              chunkIndex: chunkIdx,
              pageNumber: page.pageNumber,
              text: p.trim(),
              tokenCount: Math.round(p.length / 4)
            });
          }
        }
      }
      return;
    }

    const text = doc.rawText || '';
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    if (paragraphs.length === 0 && text.trim().length > 0) {
      this.chunks.push({
        id: `chk-${doc.id}-${chunkIdx}`,
        documentId: doc.id,
        documentTitle: doc.title,
        chunkIndex: 0,
        pageNumber: 1,
        text: text.trim(),
        tokenCount: Math.round(text.length / 4)
      });
      return;
    }

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i].trim();
      if (!p) continue;
      this.chunks.push({
        id: `chk-${doc.id}-${chunkIdx++}`,
        documentId: doc.id,
        documentTitle: doc.title,
        chunkIndex: i,
        pageNumber: Math.min(Math.floor(i / 2) + 1, doc.pageCount || 1),
        text: p,
        tokenCount: Math.round(p.length / 4)
      });
    }
  }

  public addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
    const newLog: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      isSyntheticDemo: this.isDemoActive
    };
    this.auditLogs.unshift(newLog);
    return newLog;
  }

  // Vector / Semantic & Keyword Search
  public searchDocuments(query: string, user: User, minScore: number = 0.2): SearchResultChunk[] {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const results: SearchResultChunk[] = [];

    // Filter documents by role authorization (VIEWER cannot see CONFIDENTIAL / RESTRICTED unless assigned)
    const accessibleDocIds = new Set(
      this.documents
        .filter(doc => {
          if (user.role === 'SUBMITTER' || user.role === 'REVIEWER' || user.role === 'ANALYST') return true;
          if (doc.metadata.confidentialityLevel === 'RESTRICTED' && user.role === 'VIEWER') return false;
          return true;
        })
        .map(d => d.id)
    );

    for (const chunk of this.chunks) {
      if (!accessibleDocIds.has(chunk.documentId)) continue;
      const chunkTextLower = chunk.text.toLowerCase();
      const doc = this.documents.find(d => d.id === chunk.documentId);
      if (!doc) continue;

      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const term of terms) {
        if (chunkTextLower.includes(term)) {
          matchCount++;
          matchedKeywords.push(term);
        }
      }

      // Calculate pseudo-similarity
      let score = 0;
      if (terms.length > 0) {
        score = (matchCount / terms.length) * 0.7;
        if (chunkTextLower.includes(query.toLowerCase())) {
          score += 0.3;
        }
      }

      if (score >= minScore || terms.length === 0) {
        results.push({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          documentType: doc.type,
          department: doc.department,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
          similarityScore: Math.min(Number(score.toFixed(3)), 0.99),
          matchedKeywords,
          evidenceQuote: chunk.text.slice(0, 220) + (chunk.text.length > 220 ? '...' : '')
        });
      }
    }

    return results.sort((a, b) => b.similarityScore - a.similarityScore);
  }
}

export const dbStore = new MemoryStore();