import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string
          title: string
          file_url: string
          parsed_text: string | null
          summary: string | null
          status: string
          category: string
          description: string | null
          priority: string
          deadline: string | null
          uploaded_by: string | null
          file_type: string | null
          file_size: number | null
          created_at: string
          updated_at: string
          review_notes: string | null
        }
        Update: {
          status?: string
          review_notes?: string | null
          updated_at?: string
        }
      }
      document_assignments: {
        Row: {
          id: string
          document_id: string
          user_id: string
          assigned_at: string
        }
        Insert: {
          document_id: string
          user_id: string
        }
      }
      notifications: {
        Insert: {
          recipient_id: string
          title: string
          message: string
          category: string
          priority?: string
        }
      }
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const action = pathSegments[pathSegments.length - 1]

    if (req.method === 'GET') {
      // GET /documents/pending - Get pending documents for admin
      if (action === 'pending') {
        const { data: documents, error } = await supabaseClient
          .from('documents')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Database error:', error)
          return new Response(JSON.stringify({ error: 'Failed to fetch documents' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({ documents }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // GET /documents/approved/{userId} - Get approved documents for employee
      if (action !== 'pending' && pathSegments[pathSegments.length - 2] === 'approved') {
        const userId = action
        
        const { data: documents, error } = await supabaseClient
          .from('documents')
          .select(`
            *,
            document_assignments!inner(user_id)
          `)
          .eq('status', 'approved')
          .eq('document_assignments.user_id', userId)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Database error:', error)
          return new Response(JSON.stringify({ error: 'Failed to fetch documents' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({ documents }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (req.method === 'POST') {
      const { action: requestAction, documentId, employeeIds, reviewNotes } = await req.json()

      // POST /documents/{id}/approve - Approve document and assign to employees
      if (requestAction === 'approve') {
        console.log(`Approving document ${documentId} for employees:`, employeeIds)

        // Update document status
        const { error: updateError } = await supabaseClient
          .from('documents')
          .update({
            status: 'approved',
            review_notes: reviewNotes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId)

        if (updateError) {
          console.error('Update error:', updateError)
          return new Response(JSON.stringify({ error: 'Failed to approve document' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Create assignments for selected employees
        if (employeeIds && employeeIds.length > 0) {
          const assignments = employeeIds.map((userId: string) => ({
            document_id: documentId,
            user_id: userId
          }))

          const { error: assignError } = await supabaseClient
            .from('document_assignments')
            .insert(assignments)

          if (assignError) {
            console.error('Assignment error:', assignError)
            return new Response(JSON.stringify({ error: 'Failed to assign document' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }

          // Create notifications for employees
          const { data: document } = await supabaseClient
            .from('documents')
            .select('title')
            .eq('id', documentId)
            .single()

          const notifications = employeeIds.map((userId: string) => ({
            recipient_id: userId,
            title: 'New Document Assigned',
            message: `You have been assigned a new document: ${document?.title}`,
            category: 'document',
            priority: 'medium'
          }))

          await supabaseClient
            .from('notifications')
            .insert(notifications)
        }

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Document approved and assigned successfully' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // POST /documents/{id}/reject - Reject document
      if (requestAction === 'reject') {
        console.log(`Rejecting document ${documentId}`)

        const { error: updateError } = await supabaseClient
          .from('documents')
          .update({
            status: 'rejected',
            review_notes: reviewNotes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId)

        if (updateError) {
          console.error('Update error:', updateError)
          return new Response(JSON.stringify({ error: 'Failed to reject document' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Document rejected successfully' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})