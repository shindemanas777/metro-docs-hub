import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Eye, CheckCircle, XCircle, Calendar, User, AlertTriangle, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import Layout from '@/components/shared/Layout';
import { DocumentService } from '@/services/documentService';
import { useToast } from '@/hooks/use-toast';

const ReviewDocuments = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingData(true);
        const [pendingDocs, employeeList] = await Promise.all([
          DocumentService.getPendingDocuments(),
          DocumentService.getEmployees()
        ]);
        setDocuments(pendingDocs);
        setEmployees(employeeList);
      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: "Error",
          description: "Failed to load documents. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, [toast]);

  const pendingDocuments = documents.filter(doc => doc.status === 'pending');
  const approvedDocuments = documents.filter(doc => doc.status === 'approved').slice(0, 3);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'rejected': return 'destructive';
      case 'pending': return 'warning';
      default: return 'secondary';
    }
  };

  const handleReviewDocument = (doc: any) => {
    setSelectedDocument(doc);
    setSelectedEmployees([]);
    setReviewNotes('');
  };

  const handleEmployeeToggle = (employeeId: string) => {
    setSelectedEmployees(prev => 
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleApprove = async () => {
    if (!selectedDocument) return;

    if (selectedEmployees.length === 0) {
      toast({
        title: "No Employees Selected",
        description: "Please select at least one employee to assign this document.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await DocumentService.approveDocument(
        selectedDocument.id,
        selectedEmployees,
        reviewNotes
      );

      setDocuments(prevDocs =>
        prevDocs.map(doc =>
          doc.id === selectedDocument.id
            ? { ...doc, status: 'approved', review_notes: reviewNotes }
            : doc
        )
      );

      toast({
        title: "Document Approved",
        description: `${selectedDocument.title} has been approved and assigned to ${selectedEmployees.length} employee(s).`,
      });

      setSelectedDocument(null);
      setReviewNotes('');
      setSelectedEmployees([]);
    } catch (error) {
      console.error('Approval error:', error);
      toast({
        title: "Error",
        description: "Failed to approve document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedDocument || !reviewNotes.trim()) {
      toast({
        title: "Review Notes Required",
        description: "Please provide a reason for rejecting this document.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await DocumentService.rejectDocument(selectedDocument.id, reviewNotes);

      setDocuments(prevDocs =>
        prevDocs.map(doc =>
          doc.id === selectedDocument.id
            ? { ...doc, status: 'rejected', review_notes: reviewNotes }
            : doc
        )
      );

      toast({
        title: "Document Rejected",
        description: `${selectedDocument.title} has been rejected with feedback.`,
      });

      setSelectedDocument(null);
      setReviewNotes('');
    } catch (error) {
      console.error('Rejection error:', error);
      toast({
        title: "Error",
        description: "Failed to reject document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <Layout requiredRole="admin" title="Review Documents">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading documents...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      requiredRole="admin"
      title="Review Documents"
      subtitle={`${pendingDocuments.length} documents pending review`}
    >
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingDocuments.length}</div>
              <p className="text-xs text-muted-foreground">Documents awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvedDocuments.length}</div>
              <p className="text-xs text-muted-foreground">Recently approved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documents.length}</div>
              <p className="text-xs text-muted-foreground">All documents</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Pending Documents
            </CardTitle>
            <CardDescription>
              Documents waiting for your review and approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingDocuments.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No documents pending review</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingDocuments.map((doc, index) => (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleReviewDocument(doc)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{doc.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{doc.category}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            Uploaded by Admin
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(doc.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <Badge variant={getStatusColor(doc.status)}>{doc.status}</Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <Dialog open={!!selectedDocument} onOpenChange={() => setSelectedDocument(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedDocument?.title}</DialogTitle>
              <DialogDescription>Review and approve/reject this document</DialogDescription>
            </DialogHeader>

            {selectedDocument && (
              <div className="space-y-6">
                {/* Document Summary */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">AI Summary</h4>
                  <p className="text-sm">{selectedDocument.summary || 'Summary will be generated after processing...'}</p>
                </div>

                {/* Employee Assignment */}
                <div>
                  <h4 className="font-medium mb-4">Assign to Employees</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                    {employees.map((employee) => (
                      <div
                        key={employee.id}
                        className="flex items-center space-x-2 p-2 rounded border cursor-pointer hover:bg-accent/50"
                        onClick={() => handleEmployeeToggle(employee.id)}
                      >
                        <Checkbox 
                          checked={selectedEmployees.includes(employee.id)}
                          onChange={() => {}}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{employee.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{employee.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Review Notes */}
                <div>
                  <h4 className="font-medium mb-2">Review Notes (Optional)</h4>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add any notes or comments about this document..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleApprove}
                    disabled={loading || selectedEmployees.length === 0}
                    className="bg-success hover:bg-success/90"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {loading ? 'Approving...' : 'Approve & Assign'}
                  </Button>
                  <Button
                    onClick={handleReject}
                    disabled={loading}
                    variant="destructive"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    {loading ? 'Rejecting...' : 'Reject'}
                  </Button>
                  <Button
                    onClick={() => setSelectedDocument(null)}
                    variant="outline"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default ReviewDocuments;