import { supabase } from '@/integrations/supabase/client';
import { mockDocuments, mockUsers } from '@/data/mockData.js';

// Define interfaces for type safety
interface DocumentUpload {
  title: string;
  description?: string;
  category: string;
  priority: string;
  deadline?: string;
  file: File;
  assignedEmployees?: string[];
}

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  active: boolean;
}

interface Document {
  id: string;
  title: string;
  description?: string;
  category: string;
  priority: string;
  deadline?: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadDate: string;
  fileUrl: string;
  uploader: string;
  summary?: string;
  extractedText?: string;
  malayalamTranslation?: string;
  fileType?: string;
  fileSize?: number;
}

// Utility functions for localStorage fallback
const STORAGE_KEY = 'kmrl_documents';

function seedIfNeeded() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockDocuments));
  }
}

function getAll(): any[] {
  seedIfNeeded();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to read documents from localStorage:', e);
    return [];
  }
}

function saveAll(docs: any[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export class DocumentService {
  // Method to upload a document using Supabase edge function
  static async uploadDocument(uploadData: DocumentUpload): Promise<{ success: boolean; document: Document }> {
    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('title', uploadData.title);
      formData.append('category', uploadData.category);
      formData.append('description', uploadData.description || '');
      formData.append('priority', uploadData.priority);
      if (uploadData.deadline) {
        formData.append('deadline', uploadData.deadline);
      }

      console.log('Calling upload-document edge function...');
      
      const { data, error } = await supabase.functions.invoke('upload-document', {
        body: formData,
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      if (!data.success) {
        console.error('Upload failed:', data.error);
        throw new Error(`Upload failed: ${data.error || 'Unknown error'}`);
      }

      console.log('Document uploaded successfully:', data);

      // If employees are assigned, approve and assign the document
      if (uploadData.assignedEmployees && uploadData.assignedEmployees.length > 0) {
        await this.approveDocument(data.document.id, uploadData.assignedEmployees);
      }

      return { success: true, document: data.document };
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  // Get pending documents from Supabase
  static async getPendingDocuments(): Promise<Document[]> {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending documents:', error);
        return [];
      }

      return data.map(doc => ({
        id: doc.id,
        title: doc.title,
        description: doc.description || '',
        category: doc.category,
        priority: doc.priority || 'medium',
        deadline: doc.deadline,
        status: (doc.status as 'pending' | 'approved' | 'rejected') || 'pending',
        uploadDate: new Date(doc.created_at).toISOString().split('T')[0],
        fileUrl: doc.file_url,
        uploader: 'Admin',
        summary: doc.summary || 'Processing...',
        extractedText: doc.extracted_text || '',
        malayalamTranslation: doc.malayalam_translation || '',
        fileType: doc.file_type || '',
        fileSize: doc.file_size || 0
      }));
    } catch (error) {
      console.error('Error fetching pending documents:', error);
      return [];
    }
  }

  // Get approved documents for a specific user from Supabase
  static async getApprovedDocumentsForUser(userId: string): Promise<Document[]> {
    try {
      // Get user's profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (profileError || !profile) {
        console.error('Error fetching user profile:', profileError);
        return [];
      }

      // Get documents assigned to this user
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          document_assignments!inner(user_id)
        `)
        .eq('status', 'approved')
        .eq('document_assignments.user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching approved documents:', error);
        return [];
      }

      return data.map(doc => ({
        id: doc.id,
        title: doc.title,
        description: doc.description || '',
        category: doc.category,
        priority: doc.priority || 'medium',
        deadline: doc.deadline,
        status: (doc.status as 'pending' | 'approved' | 'rejected') || 'approved',
        uploadDate: new Date(doc.created_at).toISOString().split('T')[0],
        fileUrl: doc.file_url,
        uploader: 'Admin',
        summary: doc.summary || 'No summary available',
        extractedText: doc.extracted_text || '',
        malayalamTranslation: doc.malayalam_translation || '',
        fileType: doc.file_type || '',
        fileSize: doc.file_size || 0
      }));
    } catch (error) {
      console.error('Error fetching approved documents:', error);
      return [];
    }
  }

  static async getDocumentsForUser(userId: string): Promise<Document[]> {
    return this.getApprovedDocumentsForUser(userId);
  }

  // Approve a document and assign to employees using Supabase
  static async approveDocument(documentId: string, employeeIds: Array<string>, reviewNotes?: string): Promise<void> {
    try {
      // Update document status
      const { error: updateError } = await supabase
        .from('documents')
        .update({ 
          status: 'approved',
          review_notes: reviewNotes || null
        })
        .eq('id', documentId);

      if (updateError) {
        console.error('Error updating document:', updateError);
        throw new Error('Failed to approve document');
      }

      // Create document assignments
      const assignments = employeeIds.map(employeeId => ({
        document_id: documentId,
        user_id: employeeId
      }));

      const { error: assignError } = await supabase
        .from('document_assignments')
        .insert(assignments);

      if (assignError) {
        console.error('Error creating assignments:', assignError);
        throw new Error('Failed to assign document to employees');
      }

      console.log('Document approved and assigned successfully');
    } catch (error) {
      console.error('Error approving document:', error);
      throw error;
    }
  }

  // Reject a document using Supabase
  static async rejectDocument(documentId: string, reviewNotes?: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ 
          status: 'rejected',
          review_notes: reviewNotes || null
        })
        .eq('id', documentId);

      if (error) {
        console.error('Error rejecting document:', error);
        throw new Error('Failed to reject document');
      }
    } catch (error) {
      console.error('Error rejecting document:', error);
      throw error;
    }
  }

  // Get employees from Supabase
  static async getEmployees(): Promise<Employee[]> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'employee')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('Error fetching employees:', error);
        return [];
      }

      return data.map(profile => ({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        department: profile.department || 'General',
        active: profile.active
      }));
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    }
  }
}