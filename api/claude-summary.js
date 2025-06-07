// api/claude-summary.js
// Vercel API endpoint for Claude AI meeting summaries

export default async function handler(req, res) {
    // Set CORS headers - more permissive
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed. This endpoint only accepts POST requests.' 
        });
    }
    
    try {
        const { notes, title, description, apiKey } = req.body;
        
        // Validate required fields
        if (!notes || !apiKey) {
            return res.status(400).json({ 
                error: 'Missing required fields: notes and apiKey are required' 
            });
        }
        
        if (!notes.trim()) {
            return res.status(400).json({ 
                error: 'Notes cannot be empty' 
            });
        }
        
        // Validate API key format
        if (!apiKey.startsWith('sk-ant-')) {
            return res.status(400).json({ 
                error: 'Invalid API key format. Claude API keys start with sk-ant-' 
            });
        }
        
        // Create the prompt for Claude
        const prompt = `Please analyze these meeting notes and create a concise, professional summary. Focus on:
- Key topics discussed
- Important decisions made
- Action items and next steps
- Any deadlines or commitments

Meeting Title: ${title || 'N/A'}
Meeting Description: ${description || 'N/A'}

Meeting Notes:
${notes}

Please provide a well-structured summary that could be shared with stakeholders or used for follow-up communications.`;

        // Call Claude API
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });
        
        // Check if Claude API call was successful
        if (!claudeResponse.ok) {
            const errorData = await claudeResponse.text();
            console.error('Claude API Error:', claudeResponse.status, errorData);
            
            // Handle specific error types
            if (claudeResponse.status === 401) {
                return res.status(401).json({ 
                    error: 'Invalid API key. Please check your Claude API key.' 
                });
            } else if (claudeResponse.status === 429) {
                return res.status(429).json({ 
                    error: 'Rate limit exceeded. Please try again later.' 
                });
            } else {
                return res.status(claudeResponse.status).json({ 
                    error: `Claude API error: ${claudeResponse.status} ${claudeResponse.statusText}` 
                });
            }
        }
        
        const claudeData = await claudeResponse.json();
        
        // Extract the summary from Claude's response
        const summary = claudeData.content?.[0]?.text || 'No summary generated';
        
        // Return the summary
        return res.status(200).json({ 
            summary: summary,
            timestamp: new Date().toISOString(),
            success: true
        });
        
    } catch (error) {
        console.error('API Error:', error);
        
        // Handle different types of errors
        if (error.code === 'ENOTFOUND' || error.message.includes('fetch')) {
            return res.status(503).json({ 
                error: 'Unable to connect to Claude API. Please check your internet connection.' 
            });
        }
        
        return res.status(500).json({ 
            error: 'Internal server error: ' + error.message 
        });
    }
}
