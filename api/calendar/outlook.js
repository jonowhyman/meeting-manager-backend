export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Your ICS URL
    const icsUrl = "https://outlook.office365.com/owa/calendar/9c463b80649a40c28918f07f03562595@sxswsydney.com/2ca3e48f938e4b41bb0c939fd98314804887869706492204640/calendar.ics";

    console.log('Fetching ICS from:', icsUrl);

    const response = await fetch(icsUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const icsData = await response.text();
    console.log('ICS data length:', icsData.length);

    // Simple parsing - split by events
    const events = [];
    const eventBlocks = icsData.split('BEGIN:VEVENT');
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventData = eventBlocks[i];
      const endIndex = eventData.indexOf('END:VEVENT');
      if (endIndex === -1) continue;
      
      const eventContent = eventData.substring(0, endIndex);
      const event = parseEvent(eventContent);
      
      if (event && event.start) {
        // Filter to last 30 days + next 30 days
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        if (event.start >= thirtyDaysAgo && event.start <= thirtyDaysFromNow) {
          events.push(event);
        }
      }
    }

    // Transform to meeting format
    const meetings = events.map((event, index) => ({
      id: `outlook-${event.uid || index}`,
      title: event.summary || 'Untitled Event',
      start: event.start,
      end: event.end,
      description: event.description || '',
      location: event.location || '',
      attendees: event.attendees || [], // Now includes attendees!
      organizer: event.organizer || '',
      source: 'outlook'
    }));

    console.log(`Parsed ${meetings.length} meetings`);

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'outlook-ics'
    });

  } catch (error) {
    console.error('Calendar error:', error);
    return res.status(500).json({ 
      error: 'Failed to process calendar data',
      details: error.message 
    });
  }
}

function parseEvent(eventContent) {
  const event = {
    attendees: [],
    organizer: ''
  };
  
  // Handle line continuations first
  const lines = eventContent.split('\n');
  const processedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Handle line continuations (lines starting with space or tab)
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].substring(1); // Remove the leading space/tab
    }
    
    if (line) {
      processedLines.push(line);
    }
  }

  for (let line of processedLines) {
    if (!line || !line.includes(':')) continue;

    const colonIndex = line.indexOf(':');
    const property = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);

    if (property.startsWith('DTSTART')) {
      event.start = parseDate(value);
    } else if (property.startsWith('DTEND')) {
      event.end = parseDate(value);
    } else if (property === 'SUMMARY') {
      event.summary = cleanText(value);
    } else if (property === 'DESCRIPTION') {
      event.description = cleanText(value);
    } else if (property === 'LOCATION') {
      event.location = cleanText(value);
    } else if (property === 'UID') {
      event.uid = value;
    } else if (property.startsWith('ATTENDEE')) {
      // Parse attendee information
      const attendee = parseAttendee(line);
      if (attendee) {
        event.attendees.push(attendee);
      }
    } else if (property.startsWith('ORGANIZER')) {
      // Parse organizer information
      event.organizer = parseOrganizer(line);
    }
  }

  return event;
}

function parseAttendee(line) {
  try {
    // Extract email from ATTENDEE line
    // Format: ATTENDEE;CN=Name;RSVP=TRUE:mailto:email@domain.com
    const emailMatch = line.match(/mailto:([^;?\s]+)/i);
    const nameMatch = line.match(/CN=([^;]+)/i);
    
    if (emailMatch) {
      const email = emailMatch[1];
      const name = nameMatch ? cleanText(nameMatch[1]) : email.split('@')[0];
      
      return {
        name: name,
        email: email,
        status: getAttendeeStatus(line)
      };
    }
  } catch (error) {
    console.error('Error parsing attendee:', error);
  }
  
  return null;
}

function parseOrganizer(line) {
  try {
    // Extract organizer info
    // Format: ORGANIZER;CN=Name:mailto:email@domain.com
    const emailMatch = line.match(/mailto:([^;?\s]+)/i);
    const nameMatch = line.match(/CN=([^;]+)/i);
    
    if (emailMatch) {
      const email = emailMatch[1];
      const name = nameMatch ? cleanText(nameMatch[1]) : email.split('@')[0];
      return `${name} <${email}>`;
    }
  } catch (error) {
    console.error('Error parsing organizer:', error);
  }
  
  return '';
}

function getAttendeeStatus(line) {
  if (line.includes('PARTSTAT=ACCEPTED')) return 'accepted';
  if (line.includes('PARTSTAT=DECLINED')) return 'declined';
  if (line.includes('PARTSTAT=TENTATIVE')) return 'tentative';
  return 'pending';
}

function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    // Remove timezone info and clean the date
    const cleanDate = dateString.replace(/[TZ]/g, '').replace(/\+.*$/, '');
    
    if (cleanDate.length >= 14) {
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      const hour = cleanDate.substring(8, 10);
      const minute = cleanDate.substring(10, 12);
      
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
    }
  } catch (error) {
    console.error('Date parsing error:', error);
  }
  
  return null;
}

function cleanText(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\t/g, '\t')
    .replace(/"/g, ''); // Remove quotes
}
