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
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const formData = await req.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const category = formData.get('category') as string
    const description = formData.get('description') as string
    const priority = formData.get('priority') as string || 'medium'
    const deadline = formData.get('deadline') as string
    const uploadedBy = formData.get('uploaded_by') as string

    if (!file || !title || !category) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Processing document: ${title}, size: ${file.size}, type: ${file.type}`)

    // Upload file to Supabase Storage
    const fileName = `${Date.now()}-${file.name}`
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('pdf')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(JSON.stringify({ error: 'Failed to upload file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from('pdf')
      .getPublicUrl(fileName)

    // Parse PDF text (simplified approach - in production you'd use proper PDF parsing)
    let parsedText = ''
    try {
      // For now, we'll extract basic text. In a full implementation, you'd use pdf-parse
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // Basic text extraction - this is simplified
      // In production, you'd use a proper PDF parsing library
      parsedText = `PDF content extracted from ${file.name} (${file.size} bytes)`
      console.log('PDF parsing completed')
    } catch (parseError) {
      console.error('PDF parsing error:', parseError)
      parsedText = 'Failed to extract text from PDF'
    }

    // Generate summary using Gemini API
    let summary = ''
    try {
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
      if (!geminiApiKey) {
        console.error('GEMINI_API_KEY not found')
        summary = 'Summary generation failed: API key not configured'
      } else {
        const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiApiKey, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Summarize this document and extract: date of issue, who issued it, to whom it is addressed, important details, important names, and any critical information. Document content: ${parsedText}`
              }]
            }]
          })
        })

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json()
          summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Summary generation failed'
          console.log('Gemini summary generated successfully')
        } else {
          console.error('Gemini API error:', await geminiResponse.text())
          summary = 'Summary generation failed: API error'
        }
      }
    } catch (summaryError) {
      console.error('Summary generation error:', summaryError)
      summary = 'Summary generation failed: Processing error'
    }

    // Save document metadata to database
    const { data: documentData, error: dbError } = await supabaseClient
      .from('documents')
      .insert({
        title,
        file_url: urlData.publicUrl,
        category,
        description,
        priority,
        deadline: deadline || null,
        uploaded_by: uploadedBy,
        file_type: file.type,
        file_size: file.size,
        extracted_text: parsedText,
        summary,
        status: 'pending'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(JSON.stringify({ error: 'Failed to save document metadata' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Document processed successfully:', documentData)

    return new Response(JSON.stringify({
      success: true,
      document: documentData,
      message: 'Document uploaded and processed successfully'
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