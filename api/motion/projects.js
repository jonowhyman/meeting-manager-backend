export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    console.log('Fetching projects for workspace:', workspaceId);

    const response = await fetch(`https://api.usemotion.com/v1/projects?workspaceId=${workspaceId}`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Motion Projects Error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Motion API Error: ${response.status}`,
        details: errorText 
      });
    }

    const motionResponse = await response.json();
    console.log('Raw Motion API response:', JSON.stringify(motionResponse, null, 2));
    
    // Extract projects array from Motion's response format
    let projects = [];
    
    if (Array.isArray(motionResponse)) {
      // Direct array response
      projects = motionResponse;
    } else if (motionResponse && motionResponse.projects && Array.isArray(motionResponse.projects)) {
      // Wrapped in { projects: [...] }
      projects = motionResponse.projects;
    } else if (motionResponse && motionResponse.data && Array.isArray(motionResponse.data)) {
      // Wrapped in { data: [...] }
      projects = motionResponse.data;
    } else if (motionResponse && typeof motionResponse === 'object') {
      // Try to find any array property
      const keys = Object.keys(motionResponse);
      for (const key of keys) {
        if (Array.isArray(motionResponse[key])) {
          projects = motionResponse[key];
          console.log(`Found projects array in key: ${key}`);
          break;
        }
      }
    }
    
    console.log('Extracted projects count:', projects.length);
    
    return res.status(200).json({ 
      success: true, 
      projects: projects
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
