import { supabase } from "@/integrations/supabase/client";

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
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  active: boolean;
}

export interface Document {
  id: string;
  title: string;
  file_url: string;
  category: string;
  description?: string;
  priority: string;
  deadline?: string;
  uploaded_by?: string;
  file_type?: string;
  file_size?: number;
  extracted_text?: string;
  summary?: string;
  status: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
}

export class DocumentService {
  static async uploadDocument(uploadData: DocumentUpload): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('title', uploadData.title);
      formData.append('category', uploadData.category);
      if (uploadData.description) formData.append('description', uploadData.description);
      if (uploadData.priority) formData.append('priority', uploadData.priority);
      if (uploadData.deadline) formData.append('deadline', uploadData.deadline);
      if (uploadData.uploadedBy) formData.append('uploaded_by', uploadData.uploadedBy);

      const { data, error } = await supabase.functions.invoke('upload-document', {
        body: formData
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  static async getPendingDocuments(): Promise<Document[]> {
    try {
      const { data, error } = await supabase.functions.invoke('manage-documents/pending');
      
      if (error) throw error;
      return data.documents || [];
    } catch (error) {
      console.error('Error fetching pending documents:', error);
      throw error;
    }
  }

  static async getApprovedDocumentsForUser(userId: string): Promise<Document[]> {
    try {
      const { data, error } = await supabase.functions.invoke(`manage-documents/approved/${userId}`);
      
      if (error) throw error;
      return data.documents || [];
    } catch (error) {
      console.error('Error fetching approved documents:', error);
      throw error;
    }
  }

  static async approveDocument(documentId: string, employeeIds: string[], reviewNotes?: string): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('manage-documents', {
        body: {
          action: 'approve',
          documentId,
          employeeIds,
          reviewNotes
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error approving document:', error);
      throw error;
    }
  }

  static async rejectDocument(documentId: string, reviewNotes?: string): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('manage-documents', {
        body: {
          action: 'reject',
          documentId,
          reviewNotes
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error rejecting document:', error);
      throw error;
    }
  }

  static async getEmployees(): Promise<Employee[]> {
    try {
      const { data, error } = await supabase.functions.invoke('get-employees');
      
      if (error) throw error;
      return data.employees || [];
    } catch (error) {
      console.error('Error fetching employees:', error);
      throw error;
    }
  }
}