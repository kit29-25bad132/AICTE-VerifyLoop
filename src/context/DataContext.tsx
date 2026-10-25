/// <reference types="vite/client" />

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  DocumentRecord,
  RiskItem,
  ConflictItem,
  ActionItem,
  DeadlineItem,
  ComplianceItem,
  ChangeImpactAnalysis,
  WorkflowItem,
  ApprovalRequest,
  AuditLogEntry,
  SearchResultChunk,
  CopilotMessage,
  KnowledgeGraphNode,
  KnowledgeGraphEdge
} from '../types.js';
import { useAuth } from './AuthContext.js';

// Get API base URL from environment or default to current origin
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface ToastMessage {
  id: string;
  type: 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR';
  title: string;
  message: string;
}

interface DataContextType {
  documents: DocumentRecord[];
  isDemoActive: boolean;
  isLoading: boolean;
  risks: RiskItem[];
  conflicts: ConflictItem[];
  actions: ActionItem[];
  deadlines: DeadlineItem[];
  compliance: ComplianceItem[];
  impactAnalyses: ChangeImpactAnalysis[];
  workflows: WorkflowItem[];
  approvals: ApprovalRequest[];
  auditLogs: AuditLogEntry[];
  toasts: ToastMessage[];
  graphNodes: KnowledgeGraphNode[];
  graphEdges: KnowledgeGraphEdge[];
  searchModalOpen: boolean;
  setSearchModalOpen: (open: boolean) => void;
  addToast: (type: ToastMessage['type'], title: string, message: string) => void;
  removeToast: (id: string) => void;
  refreshData: () => Promise<void>;
  toggleDemoData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  uploadDocument: (formData: FormData) => Promise<DocumentRecord | null>;
  processDocumentAI: (docId: string) => Promise<boolean>;
  archiveDocument: (docId: string) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;
  verifyRisk: (riskId: string) => Promise<void>;
  resolveConflict: (conflictId: string, status: string, notes: string) => Promise<void>;
  updateAction: (actionId: string, status?: string, assignedTo?: string) => Promise<void>;
  decideApproval: (approvalId: string, decision: 'APPROVED' | 'REJECTED' | 'ESCALATED', note?: string) => Promise<void>;
  runSemanticSearch: (query: string, minScore?: number) => Promise<SearchResultChunk[]>;
  askCopilot: (question: string) => Promise<CopilotMessage>;
  simulateChangeImpact: (baseDocId: string, newVersionText: string, newVersionLabel: string) => Promise<ChangeImpactAnalysis>;
  verifyChangeImpact: (impactId: string, status: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isDemoActive, setIsDemoActive] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [impactAnalyses, setImpactAnalyses] = useState<ChangeImpactAnalysis[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [graphNodes, setGraphNodes] = useState<KnowledgeGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<KnowledgeGraphEdge[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);

  const addToast = useCallback((type: ToastMessage['type'], title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const authHeaders = useCallback(() => {
    return {
      'x-user-id': currentUser?.id || 'usr-sub-01',
      'Content-Type': 'application/json'
    };
  }, [currentUser]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = { 'x-user-id': currentUser?.id || 'usr-sub-01' };
      const [
        docsRes,
        risksRes,
        conflictsRes,
        actionsRes,
        deadlinesRes,
        complianceRes,
        wfRes,
        apprRes,
        auditRes,
        graphRes
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/api/documents`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/risks`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/conflicts`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/actions`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/deadlines`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/compliance`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/workflows`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/approvals`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/audit-logs`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/knowledge-graph`, { headers }).then(r => r.json())
      ]);

      if (docsRes.documents) {
        setDocuments(docsRes.documents);
        setIsDemoActive(docsRes.isDemoActive);
      }
      if (risksRes.risks) setRisks(risksRes.risks);
      if (conflictsRes.conflicts) setConflicts(conflictsRes.conflicts);
      if (actionsRes.actions) setActions(actionsRes.actions);
      if (deadlinesRes.deadlines) setDeadlines(deadlinesRes.deadlines);
      if (complianceRes.compliance) setCompliance(complianceRes.compliance);
      if (wfRes.workflows) setWorkflows(wfRes.workflows);
      if (apprRes.approvals) setApprovals(apprRes.approvals);
      if (auditRes.logs) setAuditLogs(auditRes.logs);
      if (graphRes.nodes) setGraphNodes(graphRes.nodes);
      if (graphRes.edges) setGraphEdges(graphRes.edges);
    } catch (err) {
      console.error('Failed to load AICTE VerifyLoop state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const toggleDemoData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/demo/toggle`, {
        method: 'POST',
        headers: authHeaders()
      });
      const data = await res.json();
      setIsDemoActive(data.isDemoActive);
      await refreshData();
      if (data.isDemoActive) {
        addToast('INFO', 'Demo Mode Activated', 'Loaded synthetic AICTE VerifyLoop demo dataset.');
      } else {
        addToast('SUCCESS', 'Real Data Mode', 'Purged synthetic data. System is ready for live document uploads.');
      }
    } catch {
      addToast('ERROR', 'Toggle Failed', 'Could not switch demo mode.');
    }
  };

  const clearAllData = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/demo/clear`, {
        method: 'POST',
        headers: authHeaders()
      });
      await refreshData();
      addToast('WARNING', 'Database Zeroed', 'All documents and derived operational intelligence records cleared.');
    } catch {
      addToast('ERROR', 'Purge Failed', 'Could not clear data.');
    }
  };

  const uploadDocument = async (formData: FormData): Promise<DocumentRecord | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: {
          'x-user-id': currentUser?.id || 'usr-sub-01'
        },
        body: formData
      });
      if (!res.ok) {
        throw new Error('Upload failed');
      }
      const data = await res.json();
      const newDoc: DocumentRecord = data.document;
      setDocuments(prev => [newDoc, ...prev]);
      addToast('SUCCESS', 'Document Ingested', `"${newDoc.title}" uploaded. Processing ready.`);
      return newDoc;
    } catch (err: any) {
      addToast('ERROR', 'Upload Error', err.message || 'File upload failed');
      return null;
    }
  };

  const processDocumentAI = async (docId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/process`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('AI Processing failed');
      await refreshData();
      addToast('SUCCESS', 'Document Intelligence Extracted', 'Extracted verified entities, relationships, risks, and actions.');
      return true;
    } catch (err: any) {
      addToast('ERROR', 'Processing Error', err.message || 'Extraction failed');
      return false;
    }
  };

  const archiveDocument = async (docId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/documents/${docId}/archive`, {
        method: 'PATCH',
        headers: authHeaders()
      });
      await refreshData();
      addToast('INFO', 'Archive Updated', 'Document archive state changed.');
    } catch {
      addToast('ERROR', 'Archive Failed', 'Could not update archive state.');
    }
  };

  const deleteDocument = async (docId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${docId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Delete failed');
      }
      await refreshData();
      addToast('SUCCESS', 'Document Deleted', 'Document and linked entities removed from repository.');
    } catch (err: any) {
      addToast('ERROR', 'Delete Failed', err.message || 'Unauthorized or server error');
    }
  };

  const verifyRisk = async (riskId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/risks/${riskId}/verify`, {
        method: 'PATCH',
        headers: authHeaders()
      });
      await refreshData();
      addToast('SUCCESS', 'Risk Verified', 'Operational risk marked as verified by human officer.');
    } catch {
      addToast('ERROR', 'Verification Failed', 'Could not verify risk item.');
    }
  };

  const resolveConflict = async (conflictId: string, status: string, notes: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/conflicts/${conflictId}/resolve`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status, notes })
      });
      await refreshData();
      addToast('SUCCESS', 'Conflict Resolved', `Conflict marked as ${status}.`);
    } catch {
      addToast('ERROR', 'Resolution Failed', 'Could not resolve conflict.');
    }
  };

  const updateAction = async (actionId: string, status?: string, assignedTo?: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status, assignedTo })
      });
      await refreshData();
      addToast('SUCCESS', 'Action Updated', 'Obligation status updated.');
    } catch {
      addToast('ERROR', 'Update Failed', 'Could not update action.');
    }
  };

  const decideApproval = async (approvalId: string, decision: 'APPROVED' | 'REJECTED' | 'ESCALATED', note?: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/approvals/${approvalId}/decision`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ decision, note })
      });
      await refreshData();
      addToast('SUCCESS', 'Approval Recorded', `Request marked as ${decision}.`);
    } catch {
      addToast('ERROR', 'Approval Failed', 'Could not record decision.');
    }
  };

  const runSemanticSearch = async (query: string, minScore?: number): Promise<SearchResultChunk[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/search/semantic`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ query, minScore: minScore || 0.15 })
      });
      const data = await res.json();
      return data.results || [];
    } catch {
      return [];
    }
  };

  const askCopilot = async (question: string): Promise<CopilotMessage> => {
    const res = await fetch(`${API_BASE_URL}/api/copilot/ask`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ question })
    });
    if (!res.ok) {
      throw new Error('Copilot response error');
    }
    const data = await res.json();
    return data.message;
  };

  const simulateChangeImpact = async (
    baseDocId: string,
    newVersionText: string,
    newVersionLabel: string
  ): Promise<ChangeImpactAnalysis> => {
    const res = await fetch(`${API_BASE_URL}/api/impact/simulate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ baseDocumentId: baseDocId, newVersionText, newVersionLabel })
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Impact simulation failed');
    }
    const data = await res.json();
    setImpactAnalyses(prev => [data.analysis, ...prev]);
    return data.analysis;
  };

  const verifyChangeImpact = async (impactId: string, status: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/impact/${impactId}/verify`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ status })
      });
      await refreshData();
      addToast('SUCCESS', 'Impact Review Recorded', `Change impact status: ${status}`);
    } catch {
      addToast('ERROR', 'Review Failed', 'Could not update verification status.');
    }
  };

  return (
    <DataContext.Provider
      value={{
        documents,
        isDemoActive,
        isLoading,
        risks,
        conflicts,
        actions,
        deadlines,
        compliance,
        impactAnalyses,
        workflows,
        approvals,
        auditLogs,
        toasts,
        graphNodes,
        graphEdges,
        searchModalOpen,
        setSearchModalOpen,
        addToast,
        removeToast,
        refreshData,
        toggleDemoData,
        clearAllData,
        uploadDocument,
        processDocumentAI,
        archiveDocument,
        deleteDocument,
        verifyRisk,
        resolveConflict,
        updateAction,
        decideApproval,
        runSemanticSearch,
        askCopilot,
        simulateChangeImpact,
        verifyChangeImpact
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};