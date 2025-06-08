export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    // Get Motion API key from environment variables
    const motionApiKey = process.env.MOTION_API_KEY;
    if (!motionApiKey) {
      return res.status(500).json({ error: 'Motion API key not configured' });
    }

    // Fetch projects from Motion API
    const response = await fetch(`https://api.usemotion.com/v1/projects?workspaceId=${workspaceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${motionApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Motion projects API error:', response.status, errorData);
      return res.status(response.status).json({ 
        error: `Motion API error: ${response.statusText}` 
      });
    }

    const projects = await response.json();
    
    return res.status(200).json({
      success: true,
      projects: projects || []
    });

  } catch (error) {
    console.error('Projects API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch projects from Motion' 
    });
  }
}
