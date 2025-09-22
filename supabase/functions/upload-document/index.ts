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
          extracted_text: string | null
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
        }
        Insert: {
          title: string
          file_url: string
          category: string
          description?: string | null
          priority?: string
          deadline?: string | null
          uploaded_by?: string | null
          file_type?: string | null
          file_size?: number | null
          extracted_text?: string | null
          summary?: string | null
          status?: string
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
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse JSON body (no more FormData)
    const { document_id, bucket, path, extracted_text } = await req.json()
    
    // Validate required fields
    if (!document_id || !bucket || !path) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Processing document AI analysis: ${document_id}`)

    // Generate summary using AI (Gemini) if we have extracted text
    let summary = ''
    
    if (extracted_text && extracted_text.trim()) {
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
      if (geminiApiKey) {
        try {
          const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `Please provide a comprehensive summary of the following document. Focus on key points, important information, and actionable items. Make it concise but informative:\n\n${extracted_text.substring(0, 8000)}`
                }]
              }],
              generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
              }
            })
          })
          
          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json()
            summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
            console.log('Gemini summary generated successfully')
          } else {
            console.error('Gemini API error:', await geminiResponse.text())
          }
        } catch (summaryError) {
          console.error('Summary generation error:', summaryError)
        }
      }
    }

    // Update document record with extracted text and summary
    const { data: document, error: dbError } = await supabaseClient
      .from('documents')
      .update({
        extracted_text: extracted_text || '',
        summary: summary,
        updated_at: new Date().toISOString()
      })
      .eq('id', document_id)
      .select()
      .single()

    if (dbError) {
      console.error('Database update error:', dbError)
      return new Response(JSON.stringify({ error: 'Database update failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Document processed successfully:', document_id)

    return new Response(JSON.stringify({ 
      success: true, 
      document,
      message: 'Document processed successfully' 
    }), {
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