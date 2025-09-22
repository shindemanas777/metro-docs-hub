import { supabase } from '@/integrations/supabase/client';
import { mockDocuments, mockUsers } from '@/data/mockData.js';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

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
  // Helper function to extract text from PDF
  private static async extractPDFText(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText.trim();
    } catch (error) {
      console.error('PDF extraction failed:', error);
      return '';
    }
  }

  // Method to upload a document using optimized flow
  static async uploadDocument(uploadData: DocumentUpload): Promise<{ success: boolean; document: Document }> {
    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Step 1: Create document record first
      const { data: documentData, error: docError } = await supabase
        .from('documents')
        .insert({
          title: uploadData.title,
          category: uploadData.category,
          description: uploadData.description || '',
          priority: uploadData.priority || 'medium',
          deadline: uploadData.deadline || null,
          uploaded_by: user.id,
          file_type: uploadData.file.type,
          file_size: uploadData.file.size,
          file_url: '', // Will be updated after upload
          status: 'pending'
        })
        .select()
        .single();

      if (docError || !documentData) {
        throw new Error('Failed to create document record');
      }

      // Step 2: Upload file to storage with document ID
      const fileExt = uploadData.file.name.split('.').pop();
      const fileName = `${documentData.id}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, uploadData.file);

      if (uploadError) {
        // Clean up document record if file upload fails
        await supabase.from('documents').delete().eq('id', documentData.id);
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Update document with file URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('documents')
        .update({ file_url: publicUrl })
        .eq('id', documentData.id);

      if (updateError) {
        console.error('Failed to update file URL:', updateError);
      }

      // Step 4: Extract text if PDF
      let extractedText = '';
      if (uploadData.file.type === 'application/pdf') {
        extractedText = await DocumentService.extractPDFText(uploadData.file);
      }

      // Step 5: Call edge function for AI processing
      const { data: aiData, error: aiError } = await supabase.functions.invoke('upload-document', {
        body: {
          document_id: documentData.id,
          bucket: 'documents',
          path: fileName,
          extracted_text: extractedText
        }
      });

      if (aiError) {
        console.error('AI processing failed:', aiError);
        // Continue anyway - document is uploaded
      }

      // Step 6: Handle employee assignments
      if (uploadData.assignedEmployees && uploadData.assignedEmployees.length > 0) {
        const assignments = uploadData.assignedEmployees.map(employeeId => ({
          document_id: documentData.id,
          user_id: employeeId
        }));

        await supabase.from('document_assignments').insert(assignments);
      }

      return {
        success: true,
        document: {
          id: documentData.id,
          title: documentData.title,
          description: documentData.description || '',
          category: documentData.category,
          priority: documentData.priority || 'medium',
          deadline: documentData.deadline,
          status: documentData.status as 'pending' | 'approved' | 'rejected',
          uploadDate: new Date(documentData.created_at).toISOString().split('T')[0],
          fileUrl: documentData.file_url,
          uploader: 'Admin',
          fileType: documentData.file_type || '',
          fileSize: documentData.file_size || 0
        }
      };

    } catch (error) {
      console.error('Document upload failed:', error);
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

  // Get employees from edge function (bypasses RLS issues)
  static async getEmployees(): Promise<Employee[]> {
    try {
      // Call the edge function to get employees (bypasses RLS issues)
      const { data, error } = await supabase.functions.invoke('get-employees', {
        body: {}
      });

      if (error) {
        console.error('Error calling get-employees function:', error);
        return [];
      }

      if (!data?.employees || data.employees.length === 0) {
        console.log('No employees found, returning empty array');
        return [];
      }

      // Transform data to match Employee interface
      return data.employees.map((profile: any) => ({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        department: profile.department || 'General',
        active: profile.active
      }));
    } catch (error) {
      console.error('Error in getEmployees:', error);
      return [];
    }
  }

  // Get signed URL for document viewing
  static async getDocumentSignedUrl(documentId: string): Promise<string | null> {
    try {
      // First get the document to find the file path
      const { data: document, error } = await supabase
        .from('documents')
        .select('file_url')
        .eq('id', documentId)
        .single();

      if (error || !document) {
        console.error('Failed to get document:', error);
        return null;
      }

      // Extract filename from URL or use document ID with extension
      const fileName = `${documentId}.pdf`; // Assuming PDF extension
      
      const { data, error: signedError } = await supabase.storage
        .from('documents')
        .createSignedUrl(fileName, 3600); // 1 hour expiry

      if (signedError) {
        console.error('Failed to create signed URL:', signedError);
        return document.file_url; // Fallback to original URL
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }
  }
}