export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request (for browser testing) - return example data
  if (req.method === 'GET') {
    return res.status(200).json({
      message: "Motion Projects API - Send POST request with { workspaceId: 'your-workspace-id' }",
      example_response: {
        success: true,
        projects: [
          {
            id: "example-project-1",
            name: "Website Redesign",
            description: "Redesign company website"
          },
          {
            id: "example-project-2", 
            name: "Mobile App Development",
            description: "Build iOS and Android app"
          }
        ]
      },
      usage: "POST with workspaceId in body"
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.MOTION_API_KEY || 'l47aDyIRyaRY1fXIOsFZmCjMzP3+4mnhO8UU13EGpok=';

  try {
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    console.log('Fetching projects for workspace:', workspaceId);

    const response = await fetch(`https://api.usemotion.com/v
