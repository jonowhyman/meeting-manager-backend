export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get custom ICS URL from query parameter or request body
    let icsUrl;
    
    if (req.method === 'GET') {
      icsUrl = req.query.url;
    } else if (req.method === 'POST') {
      const body = req.body;
      icsUrl = body.url;
    }

    // Validate that a URL was provided
    if (!icsUrl) {
      return res.status(400).json({ 
        error: 'ICS URL is required',
        details: 'Please provide an ICS URL via query parameter (?url=...) or request body',
        usage: 'GET /api/calendar/outlook.js?url=YOUR_ICS_URL'
      });
    }

    // Validate URL format
    try {
      new URL(icsUrl);
    } catch (urlError) {
      return res.status(400).json({ 
        error: 'Invalid URL format',
        details: 'Please provide a valid ICS URL',
        provided: icsUrl
      });
    }

    console.log('Fetching ICS from:', icsUrl);

    // Fetch ICS data with proper headers
    const response = await fetch(icsUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/calendar, text/plain, */*',
        'User-Agent': 'Calendar-Sync-Bot/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const icsData = await response.text();
    console.log('ICS data length:', icsData.length);
    
    // Enhanced parsing with recurring event expansion and exception handling
    const events = [];
    const eventBlocks = icsData.split('BEGIN:VEVENT');
    
    console.log(`Found ${eventBlocks.length - 1} event blocks in ICS`);
    
    // Define our date range for filtering
    const now = new Date();
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days back
    const threeMonthsFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days forward
    
    // First pass: collect all events and group by UID
    const eventsByUID = new Map();
    const modifiedInstances = new Map(); // UID -> Map of RECURRENCE-ID -> event
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventData = eventBlocks[i];
      const endIndex = eventData.indexOf('END:VEVENT');
      if (endIndex === -1) continue;
      
      const eventContent = eventData.substring(0, endIndex);
      const parsedEvent = parseEvent(eventContent);
      
      if (parsedEvent && parsedEvent.uid) {
        if (parsedEvent.recurrenceId) {
          // This is a modified instance of a recurring event
          if (!modifiedInstances.has(parsedEvent.uid)) {
            modifiedInstances.set(parsedEvent.uid, new Map());
          }
          modifiedInstances.get(parsedEvent.uid).set(parsedEvent.recurrenceId, parsedEvent);
          console.log(`Found modified instance for UID ${parsedEvent.uid} on ${parsedEvent.recurrenceId}`);
        } else {
          // This is a base event (either single or recurring master)
          eventsByUID.set(parsedEvent.uid, parsedEvent);
        }
      }
    }
    
    console.log(`Processed ${eventsByUID.size} base events and ${modifiedInstances.size} modified recurring series`);
    
    // Second pass: process events with exception handling
    for (const [uid, baseEvent] of eventsByUID) {
      if (baseEvent.start) {
        if (baseEvent.isRecurring && baseEvent.rrule) {
          // Expand recurring event into individual instances
          console.log(`Expanding recurring event: "${baseEvent.summary}" (UID: ${uid})`);
          
          // Get exception dates and modified instances for this UID
          const exceptionDates = baseEvent.exdates || [];
          const modifiedInstancesForUID = modifiedInstances.get(uid) || new Map();
          
          const recurringInstances = expandRecurringEventWithExceptions(
            baseEvent, 
            twoMonthsAgo, 
            threeMonthsFromNow,
            exceptionDates,
            modifiedInstancesForUID
          );
          
          console.log(`Generated ${recurringInstances.length} instances for "${baseEvent.summary}" after applying exceptions`);
          events.push(...recurringInstances);
        } else {
          // Single event - check if it's in our date range
          const eventDate = new Date(baseEvent.start);
          const isRelevant = eventDate >= twoMonthsAgo && eventDate <= threeMonthsFromNow;
          
          if (isRelevant) {
            console.log(`Including single event: "${baseEvent.summary}" on ${eventDate.toISOString()}`);
            events.push(baseEvent);
          } else {
            console.log(`Filtering out single event: "${baseEvent.summary}" on ${eventDate.toISOString()} (outside range)`);
          }
        }
      } else {
        console.log('Skipping event with invalid/missing start time');
      }
    }
    
    // Sort events by start time
    events.sort((a, b) => a.start - b.start);
    
    const meetings = events.map((event, index) => ({
      id: `custom-${event.uid || index}-${event.instanceId || ''}`,
      title: event.summary || 'Untitled Event',
      start: event.start,
      end: event.end,
      description: event.description || '',
      location: event.location || '',
      attendees: event.attendees || [],
      organizer: event.organizer || '',
      source: 'custom-ics',
      isAllDay: event.isAllDay || false,
      isRecurring: event.isRecurring || false,
      recurringInstanceDate: event.recurringInstanceDate || null,
      originalUid: event.originalUid || event.uid,
      rawDtstart: event.dtstart, // Keep for debugging
      originalProperty: event.dtstartProperty // Keep for debugging
    }));

    console.log(`Processed ${meetings.length} meetings from ${events.length} total events`);
    
    // Enhanced logging for debugging
    const todayMeetings = meetings.filter(m => {
      const today = new Date().toISOString().split('T')[0];
      const meetingDate = new Date(m.start).toISOString().split('T')[0];
      return meetingDate === today;
    });
    
    const allDayMeetings = meetings.filter(m => m.isAllDay);
    const recurringMeetings = meetings.filter(m => m.isRecurring);
    const recurringInstances = meetings.filter(m => m.recurringInstanceDate);
    
    console.log(`Today's meetings: ${todayMeetings.length}`);
    console.log(`All-day meetings: ${allDayMeetings.length}`);
    console.log(`Recurring meetings: ${recurringMeetings.length}`);
    console.log(`Recurring instances: ${recurringInstances.length}`);

    return res.status(200).json({
      success: true,
      meetings,
      totalEvents: meetings.length,
      source: 'custom-ics',
      sourceUrl: icsUrl,
      stats: {
        todayMeetings: todayMeetings.length,
        allDayMeetings: allDayMeetings.length,
        recurringMeetings: recurringMeetings.length,
        recurringInstances: recurringInstances.length
      },
      dateRange: {
        from: twoMonthsAgo.toISOString(),
        to: threeMonthsFromNow.toISOString()
      }
    });

  } catch (error) {
    console.error('Calendar error:', error);
    return res.status(500).json({ 
      error: 'Failed to process calendar data',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

function expandRecurringEventWithExceptions(baseEvent, startRange, endRange, exceptionDates, modifiedInstances) {
  const instances = [];
  
  if (!baseEvent.rrule) {
    console.log('No RRULE found for recurring event');
    return [baseEvent];
  }
  
  try {
    const rrule = parseRRule(baseEvent.rrule);
    console.log('Parsed RRULE:', rrule);
    console.log('Exception dates:', exceptionDates);
    console.log('Modified instances:', Array.from(modifiedInstances.keys()));
    
    if (!rrule.freq) {
      console.log('No FREQ found in RRULE');
      return [baseEvent];
    }
    
    const startDate = new Date(baseEvent.start);
    const eventDuration = baseEvent.end ? new Date(baseEvent.end) - new Date(baseEvent.start) : 0;
    
    let currentDate = new Date(startDate);
    let instanceCount = 0;
    const maxInstances = 100; // Safety limit
    
    // Calculate until date
    let untilDate = endRange;
    if (rrule.until) {
      untilDate = new Date(Math.min(rrule.until.getTime(), endRange.getTime()));
    }
    
    console.log(`Expanding from ${currentDate.toISOString()} until ${untilDate.toISOString()}`);
    
    while (currentDate <= untilDate && instanceCount < maxInstances) {
      // Check if this instance falls within our date range
      if (currentDate >= startRange && currentDate <= endRange) {
        const currentDateStr = formatDateForComparison(currentDate);
        
        // Check if this instance is cancelled (in EXDATE)
        const isCancelled = exceptionDates.some(exDate => {
          const exDateStr = formatDateForComparison(exDate);
          return exDateStr === currentDateStr;
        });
        
        if (isCancelled) {
          console.log(`Instance for ${currentDateStr} is cancelled (EXDATE)`);
        } else {
          // Check if this instance has been modified
          const modifiedInstance = modifiedInstances.get(currentDateStr);
          
          if (modifiedInstance) {
            console.log(`Using modified instance for ${currentDateStr}`);
            // Use the modified instance instead of generating from base
            const instance = {
              ...modifiedInstance,
              isRecurring: true,
              recurringInstanceDate: currentDate.toISOString(),
              instanceId: `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`,
              originalUid: baseEvent.uid,
              isModified: true
            };
            instances.push(instance);
          } else {
            // Create a regular instance from the base event
            const instance = {
              ...baseEvent,
              start: new Date(currentDate),
              end: eventDuration > 0 ? new Date(currentDate.getTime() + eventDuration) : null,
              isRecurring: true,
              recurringInstanceDate: currentDate.toISOString(),
              instanceId: `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`,
              originalUid: baseEvent.uid,
              isModified: false
            };
            
            instances.push(instance);
            console.log(`Created regular instance for ${currentDate.toISOString()}`);
          }
        }
      }
      
      // Calculate next occurrence based on frequency
      switch (rrule.freq.toUpperCase()) {
        case 'DAILY':
          currentDate.setDate(currentDate.getDate() + (rrule.interval || 1));
          break;
        case 'WEEKLY':
          if (rrule.byday && rrule.byday.length > 0) {
            // Handle specific days of the week
            currentDate = getNextWeeklyOccurrence(currentDate, rrule.byday, rrule.interval || 1);
          } else {
            currentDate.setDate(currentDate.getDate() + (7 * (rrule.interval || 1)));
          }
          break;
        case 'MONTHLY':
          currentDate.setMonth(currentDate.getMonth() + (rrule.interval || 1));
          break;
        case 'YEARLY':
          currentDate.setFullYear(currentDate.getFullYear() + (rrule.interval || 1));
          break;
        default:
          console.log('Unsupported frequency:', rrule.freq);
          break;
      }
      
      instanceCount++;
      
      // Safety check for count limit
      if (rrule.count && instanceCount >= rrule.count) {
        console.log(`Reached COUNT limit: ${rrule.count}`);
        break;
      }
    }
    
    // Also add any modified instances that don't fall on regular recurrence dates
    // (these are instances that were moved to completely different dates)
    for (const [recurrenceId, modifiedInstance] of modifiedInstances) {
      const modifiedDate = new Date(modifiedInstance.start);
      if (modifiedDate >= startRange && modifiedDate <= endRange) {
        // Check if we already included this (i.e., it's a time change but same date)
        const alreadyIncluded = instances.some(inst => 
          Math.abs(new Date(inst.start) - modifiedDate) < 1000 * 60 * 60 // within 1 hour
        );
        
        if (!alreadyIncluded) {
          console.log(`Adding standalone modified instance for ${modifiedDate.toISOString()}`);
          const instance = {
            ...modifiedInstance,
            isRecurring: true,
            recurringInstanceDate: modifiedDate.toISOString(),
            instanceId: `mod-${Date.now()}`,
            originalUid: baseEvent.uid,
            isModified: true,
            isMovedInstance: true
          };
          instances.push(instance);
        }
      }
    }
    
    console.log(`Generated ${instances.length} instances for recurring event (${exceptionDates.length} cancelled, ${modifiedInstances.size} modified)`);
    return instances;
    
  } catch (error) {
    console.error('Error expanding recurring event with exceptions:', error);
    return [baseEvent]; // Return original event if expansion fails
  }
}

function formatDateForComparison(date) {
  // Format date as YYYYMMDD for comparison with RECURRENCE-ID and EXDATE
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function expandRecurringEvent(baseEvent, startRange, endRange) {
  // This function is now replaced by expandRecurringEventWithExceptions
  // Keeping for backward compatibility
  return expandRecurringEventWithExceptions(baseEvent, startRange, endRange, [], new Map());
}

function parseRRule(rruleString) {
  const rrule = {};
  const parts = rruleString.split(';');
  
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;
    
    switch (key.toUpperCase()) {
      case 'FREQ':
        rrule.freq = value;
        break;
      case 'INTERVAL':
        rrule.interval = parseInt(value);
        break;
      case 'COUNT':
        rrule.count = parseInt(value);
        break;
      case 'UNTIL':
        rrule.until = parseDate(value);
        break;
      case 'BYDAY':
        rrule.byday = value.split(',');
        break;
      case 'BYMONTHDAY':
        rrule.bymonthday = value.split(',').map(d => parseInt(d));
        break;
      case 'BYMONTH':
        rrule.bymonth = value.split(',').map(m => parseInt(m));
        break;
      case 'WKST':
        rrule.wkst = value;
        break;
    }
  }
  
  return rrule;
}

function getNextWeeklyOccurrence(currentDate, byday, interval) {
  // Map day abbreviations to numbers (0 = Sunday, 1 = Monday, etc.)
  const dayMap = {
    'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
  };
  
  // Convert BYDAY values to day numbers
  const targetDays = byday.map(day => {
    const dayCode = day.replace(/[+-]?\d+/, ''); // Remove any week number prefixes
    return dayMap[dayCode.toUpperCase()];
  }).filter(day => day !== undefined).sort((a, b) => a - b);
  
  if (targetDays.length === 0) {
    // No valid days specified, just add interval weeks
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + (7 * interval));
    return nextDate;
  }
  
  const currentDay = currentDate.getDay();
  const nextDate = new Date(currentDate);
  
  // Find the next occurrence
  let found = false;
  
  // First, check if there's a target day later in the current week
  for (const targetDay of targetDays) {
    if (targetDay > currentDay) {
      nextDate.setDate(nextDate.getDate() + (targetDay - currentDay));
      found = true;
      break;
    }
  }
  
  // If no day found in current week, go to next interval and find first target day
  if (!found) {
    const daysToNextWeek = 7 - currentDay + (7 * (interval - 1));
    nextDate.setDate(nextDate.getDate() + daysToNextWeek + targetDays[0]);
  }
  
  return nextDate;
}

function parseEvent(eventContent) {
  const event = { attendees: [], organizer: '', isAllDay: false, isRecurring: false, exdates: [] };
  const lines = eventContent.split('\n');
  
  for (let line of lines) {
    line = line.trim();
    if (!line || !line.includes(':')) continue;
    
    // Handle multiline properties (lines that start with space or tab)
    while (lines.indexOf(line) + 1 < lines.length && 
           /^\s/.test(lines[lines.indexOf(line) + 1])) {
      const nextLineIndex = lines.indexOf(line) + 1;
      line += lines[nextLineIndex].trim();
      lines.splice(nextLineIndex, 1);
    }
    
    const colonIndex = line.indexOf(':');
    const property = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    
    if (property.startsWith('DTSTART')) {
      console.log('Found DTSTART:', property, value);
      
      // Check if it's an all-day event (no time component)
      if (property.includes('VALUE=DATE') || (!value.includes('T') && value.length === 8)) {
        event.isAllDay = true;
        console.log('Detected all-day event');
      }
      
      event.start = parseDate(value, property);
      event.dtstart = value; // Keep original for debugging
      event.dtstartProperty = property; // Keep property for debugging
    } else if (property.startsWith('DTEND')) {
      console.log('Found DTEND:', property, value);
      event.end = parseDate(value, property);
    } else if (property.startsWith('RECURRENCE-ID')) {
      // This is a modified instance of a recurring event
      console.log('Found RECURRENCE-ID:', property, value);
      event.recurrenceId = formatDateForComparison(parseDate(value, property));
      event.isModifiedInstance = true;
    } else if (property.startsWith('EXDATE')) {
      // Exception dates (cancelled instances)
      console.log('Found EXDATE:', property, value);
      const exceptionDates = value.split(',').map(dateStr => parseDate(dateStr.trim(), property)).filter(d => d);
      event.exdates.push(...exceptionDates);
    } else if (property === 'SUMMARY') {
      event.summary = cleanText(value);
    } else if (property === 'DESCRIPTION') {
      event.description = cleanText(value);
    } else if (property === 'LOCATION') {
      event.location = cleanText(value);
    } else if (property === 'UID') {
      event.uid = value;
    } else if (property === 'RRULE') {
      // Detect recurring events
      event.isRecurring = true;
      event.rrule = value;
      console.log('Detected recurring event with RRULE:', value);
    } else if (property.startsWith('ORGANIZER')) {
      // Extract organizer info
      if (value.includes('CN=')) {
        const cnMatch = value.match(/CN=([^:;]+)/);
        if (cnMatch) {
          event.organizer = cleanText(cnMatch[1]);
        }
      } else if (value.includes('MAILTO:')) {
        event.organizer = value.replace('MAILTO:', '');
      } else {
        event.organizer = cleanText(value);
      }
    } else if (property.startsWith('ATTENDEE')) {
      // Extract attendee info
      let attendee = { email: '', name: '' };
      
      if (value.includes('CN=')) {
        const cnMatch = value.match(/CN=([^:;]+)/);
        if (cnMatch) {
          attendee.name = cleanText(cnMatch[1]);
        }
      }
      
      if (value.includes('MAILTO:')) {
        attendee.email = value.replace(/.*MAILTO:/, '');
      }
      
      if (attendee.name || attendee.email) {
        event.attendees.push(attendee);
      }
    }
  }
  
  console.log('Parsed event:', {
    summary: event.summary,
    start: event.start,
    isAllDay: event.isAllDay,
    isRecurring: event.isRecurring,
    isModifiedInstance: event.isModifiedInstance,
    recurrenceId: event.recurrenceId,
    exdates: event.exdates.length,
    rrule: event.rrule,
    dtstart: event.dtstart,
    dtstartProperty: event.dtstartProperty
  });
  
  return event;
}

function parseDate(dateString, property = '') {
  if (!dateString) return null;
  
  try {
    console.log('Parsing date:', dateString, 'with property:', property);
    
    // Handle different ICS date formats
    let cleanDate = dateString.trim();
    
    // Remove any timezone identifiers that might be in the property line
    // Example: DTSTART;TZID=Australia/Sydney:20250607T140000
    if (cleanDate.includes(';')) {
      cleanDate = cleanDate.split(':').pop();
    }
    
    // Check if this is an all-day event
    const isAllDay = property.includes('VALUE=DATE') || (!cleanDate.includes('T') && cleanDate.length === 8);
    
    if (isAllDay) {
      // All-day event format: YYYYMMDD (e.g., 20250607)
      // IMPORTANT: For all-day events, use local midnight instead of UTC 9 AM
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      
      // Use local time midnight for all-day events
      const result = new Date(`${year}-${month}-${day}T00:00:00`);
      console.log('All-day event parsed as local midnight:', result);
      return result;
      
    } else {
      // Remove timezone suffixes like +1000, -0500, Z for timed events
      cleanDate = cleanDate.replace(/[+-]\d{4}$/, '').replace(/Z$/, '');
      
      if (cleanDate.length >= 14 && cleanDate.includes('T')) {
        // Timed event format: YYYYMMDDTHHMMSS (e.g., 20250607T140000)
        const datePart = cleanDate.substring(0, 8);
        const timePart = cleanDate.substring(9);
        
        const year = datePart.substring(0, 4);
        const month = datePart.substring(4, 6);
        const day = datePart.substring(6, 8);
        
        const hour = timePart.substring(0, 2);
        const minute = timePart.substring(2, 4);
        const second = timePart.substring(4, 6) || '00';
        
        // For timed events, treat as local time (this may need timezone adjustment)
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const result = new Date(dateStr);
        console.log('Timed event parsed as local time:', result);
        return result;
        
      } else if (cleanDate.length >= 14) {
        // Handle format without T separator: YYYYMMDDHHMMSS
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        const hour = cleanDate.substring(8, 10);
        const minute = cleanDate.substring(10, 12);
        const second = cleanDate.substring(12, 14) || '00';
        
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const result = new Date(dateStr);
        console.log('No-T format parsed as local time:', result);
        return result;
      }
    }
    
    console.log('Could not parse date format:', cleanDate);
    return null;
    
  } catch (error) {
    console.error('Date parsing error:', error, 'for date:', dateString);
    return null;
  }
}

function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}
