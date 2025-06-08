export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request (for browser testing)
  if (req.method === 'GET') {
    return res.status(200).json({
      message: "Motion Projects API - Send POST request with workspaceId",
      usage: "POST with { workspaceId: 'workspace-id' } in body",
      status: "API is working"
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST' });
  }

  const API_KEY = process.env.MOTION_API_KEY || 'l47aDyIRyaRY1fXIOsFZmCjMzP3+4mnhO8UU13EGpok=';

  try {
    // Parse request body safely
    let workspaceId;
    try {
      const body = req.body;
      workspaceId = body?.workspaceId;
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace ID required', 
        received: req.body 
      });
    }

    console.log('Fetching projects for workspace:', workspaceId);

    // Fetch projects from Motion API
    const motionUrl = `https://api.usemotion.com/v1/projects?workspaceId=${workspaceId}`;
    console.log('Motion API URL:', motionUrl);

    const response = await fetch(motionUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    console.log('Motion API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Motion Projects Error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Motion API Error: ${response.status}`,
        details: errorText,
        url: motionUrl
      });
    }

    const projects = await response.json();
    console.log('Projects received:', Array.isArray(projects) ? projects.length : 'not array');
    
    return res.status(200).json({ 
      success: true, 
      projects: projects || []
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    });
  }
}
