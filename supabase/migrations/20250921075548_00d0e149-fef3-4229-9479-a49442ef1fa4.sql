-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 10485760, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

-- Create storage policies for documents
CREATE POLICY "Admins can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'documents' AND 
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can view all documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents' AND 
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Employees can view assigned documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents' AND 
  EXISTS (
    SELECT 1 FROM documents d 
    JOIN document_assignments da ON d.id = da.document_id 
    JOIN profiles p ON p.id = da.user_id 
    WHERE d.file_url = storage.objects.name 
    AND p.user_id = auth.uid() 
    AND d.status = 'approved'
  ));

-- Insert some dummy documents for testing
INSERT INTO documents (title, category, description, priority, status, file_url, file_type, file_size, summary, extracted_text, created_at)
VALUES 
  ('Safety Protocol Manual', 'Safety & Compliance', 'Complete safety guidelines for railway operations', 'high', 'approved', 'dummy-safety-manual.pdf', 'application/pdf', 1024000, 'This document outlines the essential safety protocols for all railway personnel.', 'Safety first! Always follow these protocols...', NOW() - INTERVAL '2 days'),
  ('Maintenance Schedule Q4', 'Maintenance', 'Quarterly maintenance schedule for all routes', 'medium', 'approved', 'dummy-maintenance-q4.pdf', 'application/pdf', 768000, 'Detailed maintenance schedule covering all major railway lines for Q4.', 'Maintenance schedule for October through December...', NOW() - INTERVAL '1 day'),
  ('New Employee Handbook', 'Human Resources', 'Updated employee handbook with new policies', 'medium', 'pending', 'dummy-handbook.pdf', 'application/pdf', 512000, 'Updated handbook containing all employee policies and procedures.', 'Welcome to KMRL! This handbook contains...', NOW()),
  ('Emergency Response Plan', 'Safety & Compliance', 'Updated emergency response procedures', 'high', 'approved', 'dummy-emergency-plan.pdf', 'application/pdf', 896000, 'Comprehensive emergency response plan for various scenarios.', 'In case of emergency, follow these steps...', NOW() - INTERVAL '3 days'),
  ('Technical Specifications', 'Technical', 'Latest technical specifications for rolling stock', 'medium', 'approved', 'dummy-tech-specs.pdf', 'application/pdf', 1536000, 'Technical specifications for all rolling stock components.', 'Technical specifications include...', NOW() - INTERVAL '5 days');

-- Create dummy employee profile for testing
INSERT INTO profiles (user_id, name, email, role, department, active)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Priya Nair', 'priya.nair@kmrl.co.in', 'employee', 'Operations', true)
ON CONFLICT (user_id) DO NOTHING;

-- Assign some documents to the dummy employee
INSERT INTO document_assignments (document_id, user_id, assigned_at)
SELECT d.id, p.id, NOW()
FROM documents d, profiles p 
WHERE d.status = 'approved' 
AND p.user_id = '11111111-1111-1111-1111-111111111111'
AND d.title IN ('Safety Protocol Manual', 'Maintenance Schedule Q4', 'Emergency Response Plan', 'Technical Specifications');