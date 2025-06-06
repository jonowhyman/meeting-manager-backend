export default async function handler(req, res) {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.MOTION_API_KEY || 'l47aDyIRyaRY1fXIOsFZmCjMzP3+4mnhO8UU13EGpok=';

  try {
    const { name, description, priority, durationMinutes, workspaceId } = req.body;

    if (!name || !workspaceId) {
      return res.status(400).json({ 
        error: 'Missing required fields: name and workspaceId are required' 
      });
    }

const taskData = {
  name,
  description: description || '',
  priority: priority || 'MEDIUM',
  workspaceId
};

    console.log('Creating Motion task:', taskData);

    const response = await fetch('https://api.usemotion.com/v1/tasks', {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Motion Task Creation Error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Motion API Error: ${response.status}`,
        details: errorText 
      });
    }

    const createdTask = await response.json();
    console.log('Successfully created task:', createdTask);
    
    return res.status(200).json({ 
      success: true, 
      task: createdTask 
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
