 // /api/claude-summary.js
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { notes, title, description, apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (!notes || notes.trim().length === 0) {
      return res.status(400).json({ error: 'Meeting notes are required' });
    }

    // Clean the notes for Claude (remove formatting markup)
    const cleanNotes = notes
      .replace(/\[RED\]|\[\/RED\]|\[BLUE\]|\[\/BLUE\]|\[GREEN\]|\[\/GREEN\]|\[ORANGE\]|\[\/ORANGE\]|\[PURPLE\]|\[\/PURPLE\]/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1');

    const prompt = `Please analyze these meeting notes and create a concise, professional summary. Focus on:

**Meeting:** ${title}
${description ? `**Description:** ${description}` : ''}

**My Notes:**
${cleanNotes}

Please provide a structured summary with:
• **Key Topics Discussed:** Main themes and subjects covered
• **Important Decisions:** Any decisions made or conclusions reached  
• **Action Items:** Tasks, follow-ups, or next steps identified
• **Key Outcomes:** Results, agreements, or deliverables

Keep the summary professional, concise, and actionable. Focus on the most important information that would be useful for future reference.`;

    // Call Claude API from server (no CORS issues)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Claude API Error:', response.status, errorData);
      return res.status(response.status).json({ 
        error: `Claude API Error: ${response.status} - ${errorData.error?.message || response.statusText}` 
      });
    }

    const data = await response.json();
    const aiSummary = data.content[0].text;

    return res.status(200).json({ 
      summary: aiSummary,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: `Server error: ${error.message}` 
    });
  }
}
