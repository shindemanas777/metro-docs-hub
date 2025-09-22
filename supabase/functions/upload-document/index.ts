import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
// @deno-types="https://deno.land/x/pdf_parse@1.0.0/mod.d.ts"
import pdfParse from "https://esm.sh/pdf-parse@1.1.1"

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

    // Parse PDF text using pdf-parse
    let parsedText = ''
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // Extract text using pdf-parse
      const pdfData = await pdfParse(uint8Array)
      parsedText = pdfData.text || 'No text could be extracted from this PDF'
      
      console.log('PDF parsing completed successfully')
      console.log(`Extracted ${parsedText.length} characters from PDF`)
    } catch (parseError) {
      console.error('PDF parsing error:', parseError)
      parsedText = `Failed to extract text from PDF: ${file.name}. Error: ${parseError.message}`
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
                text: `Please analyze this document and provide a comprehensive summary including:
                
1. Document Type & Purpose
2. Date of Issue (if mentioned)
3. Issuing Authority/Organization
4. Recipient/Addressee
5. Key Information & Details
6. Important Names & Designations
7. Critical Deadlines or Action Items
8. Overall Summary
9. Malayalam Translation of Key Points (if applicable)

Document Content:
${parsedText}

Please format the response in a clear, structured manner.`
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
    console.log('Attempting to save document to database...')
    const { data: documentData, error: dbError } = await supabaseClient
      .from('documents')
      .insert({
        title,
        file_url: urlData.publicUrl,
        category,
        description,
        priority,
        deadline: deadline || null,
        uploaded_by: uploadedBy || null,
        file_type: file.type,
        file_size: file.size,
        extracted_text: parsedText,
        summary,
        status: 'pending'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error details:', JSON.stringify(dbError, null, 2))
      return new Response(JSON.stringify({ 
        error: 'Failed to save document metadata',
        details: dbError.message,
        code: dbError.code
      }), {
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