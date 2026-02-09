import { NextResponse } from 'next/server';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;
    const proxyUrl = process.env.HTTPS_PROXY;
    
    // Allow custom base URL for API (e.g. for forwarding services)
    // Default to Google's official API: https://generativelanguage.googleapis.com
    const baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

    if (!apiKey) {
      console.error('API Key is missing');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not defined in environment variables' },
        { status: 500 }
      );
    }

    // Prepare contents
    const contents = history.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));
    
    // Add the current message
    contents.push({
      role: 'user',
      parts: [{ text: `${message}\n\n(IMPORTANT: 
1. Start with <thinking> block.
2. Search queries MUST be in ENGLISH for international coverage.
3. Final Answer MUST be in CHINESE.
4. You MUST include a '## Reference Sources' section with 20+ citations, manually appending English sources if needed.)` }]
    });

    // Use model fallback mechanism
    // Prioritize gemini-2.0-flash for speed/stability, then pro
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-thinking-exp-01-21', 'gemini-1.5-pro', 'gemini-1.5-pro-002', 'gemini-1.5-pro-latest'];
    
    // Create a streaming response immediately to prevent tunnel timeouts
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let response;
        let usedModel = '';
        let lastError: any = null;
        let errorLog: string[] = [];

        console.log('--- Chat Request Started (Streaming) ---');

        try {
            for (const model of models) {
                usedModel = model;
                console.log(`Trying model: ${model}`);
                const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
                
                const options: any = {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    contents,
                    tools: [{ googleSearch: {} }],
                    system_instruction: {
                      parts: [{ text: `You are an expert Research Assistant for a Chinese analyst.

**CORE DIRECTIVE**
1. **SEARCH PHASE (ENGLISH):** You MUST search in **ENGLISH** to find authoritative international data (NASA, IEA, Bloomberg, etc.). Do NOT use Chinese search queries.
2. **OUTPUT PHASE (CHINESE):** You MUST translate and synthesize all findings into **CHINESE** for the final report.

**MANDATORY RESPONSE STRUCTURE**
<thinking>
1.  **Analyze Request:** (Identify key topics)
2.  **Search Strategy (ENGLISH):** (List 5-10 ENGLISH search queries. e.g. "Global Space Solar Power market size")
3.  **Synthesis (CHINESE):** (Plan the structure of the Chinese report)
4.  **Language Verification:** (Confirm the Final Answer will be 100% Chinese)
</thinking>

[Your Final Answer in CHINESE]

[Required: Manual Reference Section]

**CRITICAL RULES:**
1.  **Language**: 
    - **Final Output MUST be CHINESE**.
    - **NO ENGLISH** in the main body (except for proper nouns like 'SpaceX').
2.  **Citations**:
    - **Quantity**: 20+ Total References.
    - **Quality**: **International sources are mandatory**.
    - **Manual Fallback**: If the automatic tool provides Chinese links, you **MUST** manually append 10-15 **English/International URLs** at the bottom under '## Reference Sources'.
    - **Format**:
        - [1] [NASA: Space Solar Power](https://www.nasa.gov/...)
        - [2] [IEA: Renewable 2023](https://www.iea.org/...)
` }]
                    }
                  }),
                };

                if (proxyUrl) {
                  options.agent = new HttpsProxyAgent(proxyUrl);
                }

                try {
                    response = await fetch(url, options);
                    
                    if (response.ok) {
                        lastError = null;
                        break; // Success!
                    } else {
                        const errorText = await response.text();
                        console.warn(`Model ${model} failed with status ${response.status}: ${errorText}`);
                        
                        const currentError = `Model ${model}: ${response.status} - ${errorText}`;
                        errorLog.push(currentError);
                        lastError = new Error(`Gemini API Error: All models failed. Details: ${errorLog.join(' | ')}`);

                        if (response.status === 429 || response.status === 404 || response.status === 503) {
                            continue;
                        }
                        throw lastError;
                    }
                } catch (e: any) {
                     console.warn(`Model ${model} network error: ${e.message}`);
                     lastError = e;
                     if (models.indexOf(model) === models.length - 1) break;
                }
            }

            if (!response || !response.ok) {
                // If all models fail, we must send the error as a stream chunk because headers are already sent
                const errorMessage = lastError?.message || 'All models failed.';
                controller.enqueue(encoder.encode(`❌ Error: ${errorMessage}`));
                controller.close();
                return;
            }

            // Manual SSE parsing
            let buffer = '';
            let capturedMetadata: any = null;

            for await (const chunk of response.body) {
                const chunkStr = chunk.toString();
                buffer += chunkStr;
                
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; 

                for (const line of lines) {
                  if (line.trim().startsWith('data: ')) {
                    const jsonStr = line.trim().slice(6);
                    if (jsonStr === '[DONE]') continue;
                    
                    try {
                      const data = JSON.parse(jsonStr);
                      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                      
                      if (data.candidates?.[0]?.groundingMetadata) {
                        capturedMetadata = data.candidates[0].groundingMetadata;
                      }

                      if (text) {
                        controller.enqueue(encoder.encode(text));
                      }
                    } catch (e) {
                      // Ignore parse errors
                    }
                  }
                }
            }

            // Append sources
            if (capturedMetadata) {
                 const queries = capturedMetadata.webSearchQueries || [];
                 let footerText = '';

                 if (queries.length > 0) {
                     footerText += `\n\n**Search Queries Used:**\n${queries.map((q: string) => `* ${q}`).join('\n')}\n`;
                 }

                 const chunks = capturedMetadata.groundingChunks || [];
                 if (chunks.length > 0) {
                     footerText += '\n**Reference Sources:**\n';
                     chunks.forEach((c: any, index: number) => {
                         if (c.web) {
                             footerText += `*   [${index + 1}] [${c.web.title}](${c.web.uri})\n`;
                         }
                     });
                 }
                 
                 if (footerText) {
                    controller.enqueue(encoder.encode(`\n\n---\n${footerText}`));
                 }
            }

            controller.close();
            console.log('Stream closed normally');

        } catch (error: any) {
             console.error('Stream processing error:', error);
             controller.enqueue(encoder.encode(`\n\n❌ Internal Error: ${error.message}`));
             controller.close();
        }
      }
    });

    return new NextResponse(stream);

  } catch (error: any) {
    console.error('Error processing Gemini request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
