import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Calendar, User, Eye, Languages, ExternalLink, Download, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Layout from '@/components/shared/Layout';
import { DocumentService } from '@/services/documentService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DocumentsList = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [isTranslated, setIsTranslated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        // Get current authenticated user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          toast({
            title: "Error",
            description: "Please log in to view documents",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const docs = await DocumentService.getApprovedDocumentsForUser(user.id);
        setDocuments(docs);
      } catch (error) {
        console.error('Error fetching documents:', error);
        toast({
          title: "Error",
          description: "Failed to load documents",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [toast]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'under_review': return 'warning';
      case 'pending': return 'info';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return CheckCircle;
      case 'under_review': return Clock;
      case 'pending': return Clock;
      default: return FileText;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const handleViewDocument = (doc: any) => {
    setSelectedDocument(doc);
    setIsTranslated(false);
  };

  const handleTranslate = () => {
    setIsTranslated(!isTranslated);
    toast({
      title: isTranslated ? "Original Text" : "Malayalam Translation",
      description: isTranslated ? "Showing original document summary" : "Document translated to Malayalam",
    });
  };

  const handleViewOriginal = async (doc: any) => {
    try {
      // Get signed URL for secure document viewing
      const signedUrl = await DocumentService.getDocumentSignedUrl(doc.id);
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      } else {
        // Fallback to original URL
        window.open(doc.fileUrl, '_blank');
      }
      toast({
        title: "Opening Document",
        description: `Opening ${doc.title} in new window...`,
      });
    } catch (error) {
      console.error('Failed to get signed URL:', error);
      // Fallback to original URL
      window.open(doc.fileUrl, '_blank');
      toast({
        title: "Opening Document",
        description: `Opening ${doc.title} in new window...`,
      });
    }
  };

  if (loading) {
    return (
      <Layout requiredRole="employee" title="Loading Documents..." subtitle="Please wait...">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      requiredRole="employee"
      title="Document List"
      subtitle={`${documents.length} of ${documents.length} documents`}
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <div>
                  <p className="text-2xl font-bold text-success">
                    {documents.filter(doc => doc.status === 'approved').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-warning" />
                <div>
                  <p className="text-2xl font-bold text-warning">
                    {documents.filter(doc => doc.status === 'under_review').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Under Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-info" />
                <div>
                  <p className="text-2xl font-bold text-info">
                    {documents.filter(doc => doc.status === 'pending').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Documents Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {documents.map((doc, index) => {
            const StatusIcon = getStatusIcon(doc.status);
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <StatusIcon className="w-6 h-6 text-primary" />
                      <Badge variant={getStatusColor(doc.status) as any}>
                        {doc.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg line-clamp-2">{doc.title}</CardTitle>
                    <CardDescription>{doc.category}</CardDescription>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {doc.summary}
                    </p>
                    
                     <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                       <div className="flex items-center space-x-1">
                         <Calendar className="w-3 h-3" />
                         <span>{doc.uploadDate}</span>
                       </div>
                       <div className="flex items-center space-x-1">
                         <User className="w-3 h-3" />
                         <span>Admin</span>
                       </div>
                     </div>
                    
                    {doc.priority && (
                      <Badge variant={getPriorityColor(doc.priority) as any} className="w-fit">
                        {doc.priority} priority
                      </Badge>
                    )}
                    
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDocument(doc)}
                        className="flex-1"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Summary
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewOriginal(doc)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Document Detail Modal */}
        <Dialog open={!!selectedDocument} onOpenChange={() => setSelectedDocument(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-3">
                <FileText className="w-6 h-6 text-primary" />
                <span>{selectedDocument?.title}</span>
              </DialogTitle>
              <DialogDescription className="flex items-center space-x-4">
                <span>{selectedDocument?.category}</span>
                <Badge variant={getStatusColor(selectedDocument?.status) as any}>
                  {selectedDocument?.status?.replace('_', ' ')}
                </Badge>
              </DialogDescription>
            </DialogHeader>
            
            {selectedDocument && (
              <div className="space-y-6">
                {/* Document Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Uploaded by:</span> Admin
                  </div>
                  <div>
                    <span className="font-medium">Date:</span> {selectedDocument.uploadDate}
                  </div>
                </div>
                
                {/* AI Summary Section */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold">AI Generated Summary</h4>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleTranslate}
                      >
                        <Languages className="w-4 h-4 mr-2" />
                        {isTranslated ? "Show Original" : "Translate to Malayalam"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleViewOriginal(selectedDocument)}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Original Document
                      </Button>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                    {isTranslated 
                      ? (selectedDocument.malayalamTranslation || 'Malayalam translation not available')
                      : (selectedDocument.summary || 'Summary not available')
                    }
                  </div>
                </div>
                
                {/* Extracted Text Section */}
                {selectedDocument.extractedText && (
                  <div className="mb-4">
                    <button
                      onClick={() => setShowExtractedText(!showExtractedText)}
                      className="flex items-center text-sm font-medium mb-2 hover:underline"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      {showExtractedText ? 'Hide' : 'Show'} Extracted Text
                    </button>
                    {showExtractedText && (
                      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md max-h-48 overflow-y-auto">
                        {selectedDocument.extractedText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

// Document Detail Page Component
export const DocumentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For now, just navigate back since we don't have individual document fetch
    // In a full implementation, you'd fetch the specific document by ID
    navigate('/employee/documents');
  }, [id, navigate]);

  if (loading) {
    return (
      <Layout requiredRole="employee" title="Loading..." subtitle="Please wait...">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!document) {
    return null;
  }

  return (
    <Layout
      requiredRole="employee"
      title={document.title}
      subtitle={document.category}
    >
      <DocumentsList />
    </Layout>
  );
};

export default DocumentsList;