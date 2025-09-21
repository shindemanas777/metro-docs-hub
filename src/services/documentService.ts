import { mockDocuments, mockUsers } from "@/data/mockData";

export interface DocumentUpload {
  file: File;
  title: string;
  category: string;
  description?: string;
  priority?: string;
  deadline?: string;
  uploadedBy?: string;
}

export interface Employee {
  id: number;
  user_id?: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  active: boolean;
}

export interface Document {
  id: number;
  title: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  assignedTo: number[];
  summary?: string;
  extractedText?: string;
  malayalamTranslation?: string;
  fileUrl?: string;
  file_url?: string;
  priority?: string;
  deadline?: string;
  review_notes?: string;
}

const STORAGE_KEY = 'kmrl_documents';

function seedIfNeeded() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockDocuments));
  }
}

function getAll(): Document[] {
  seedIfNeeded();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Document[]) : [];
  } catch (e) {
    console.error('Failed to read local documents store:', e);
    return [];
  }
}

function saveAll(docs: Document[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export class DocumentService {
  // React-only upload: store metadata locally and show in admin review
  static async uploadDocument(uploadData: DocumentUpload): Promise<{ success: boolean; document: Document }> {
    const user = JSON.parse(localStorage.getItem('kmrl_user') || '{}');

    const newDoc: Document = {
      id: Date.now(),
      title: uploadData.title,
      category: uploadData.category,
      uploadedBy: user?.name || 'Admin',
      uploadedAt: new Date().toISOString(),
      status: 'pending',
      assignedTo: [],
      summary: uploadData.description || 'Auto-generated summary (demo).',
      extractedText: 'Extracted text placeholder (demo).',
      malayalamTranslation: 'മലയാളം പരിഭാഷ (ഡെമോ).',
      fileUrl: '/placeholder.svg',
      file_url: '/placeholder.svg',
      priority: uploadData.priority || 'medium',
      deadline: uploadData.deadline,
    };

    const docs = getAll();
    docs.unshift(newDoc);
    saveAll(docs);

    return { success: true, document: newDoc };
  }

  // Admin: load documents (includes mock + uploaded)
  static async getPendingDocuments(): Promise<Document[]> {
    return getAll();
  }

  static async getApprovedDocumentsForUser(userId: number | string): Promise<Document[]> {
    const uid = Number(userId);
    return getAll().filter((d) => d.status === 'approved' && d.assignedTo?.includes(uid));
  }

  static async getDocumentsForUser(userId: number | string): Promise<Document[]> {
    const uid = Number(userId);
    return getAll().filter((d) => Array.isArray(d.assignedTo) && d.assignedTo.includes(uid));
  }

  static async approveDocument(documentId: number | string, employeeIds: Array<number | string>, reviewNotes?: string) {
    const docs = getAll();
    const idNum = Number(documentId);
    const idx = docs.findIndex((d) => Number(d.id) === idNum);
    if (idx === -1) throw new Error('Document not found');

    const assigned = employeeIds.map((e) => Number(e));
    docs[idx] = { ...docs[idx], status: 'approved', assignedTo: assigned, review_notes: reviewNotes };
    saveAll(docs);
    return { success: true, document: docs[idx] };
  }

  static async rejectDocument(documentId: number | string, reviewNotes?: string) {
    const docs = getAll();
    const idNum = Number(documentId);
    const idx = docs.findIndex((d) => Number(d.id) === idNum);
    if (idx === -1) throw new Error('Document not found');

    docs[idx] = { ...docs[idx], status: 'rejected', review_notes: reviewNotes };
    saveAll(docs);
    return { success: true, document: docs[idx] };
  }

  static async getEmployees(): Promise<Employee[]> {
    // React-only: use mock users
    return mockUsers
      .filter((u) => u.role === 'employee' && u.active)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department,
        active: u.active,
      }));
  }
}
