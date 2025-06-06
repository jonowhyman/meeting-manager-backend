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
    
    console.log(`\n🔍 PARSING ${eventBlocks.length - 1} event blocks from ICS data`);
    console.log(`📊 ICS data length: ${icsData.length} characters`);
    
    // Define our date range for filtering - EXPAND THE RANGE
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); // 6 months back
    const sixMonthsFromNow = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 6 months forward
    
    // First pass: collect all events and group by UID
    const eventsByUID = new Map();
    const modifiedInstances = new Map(); // UID -> Map of RECURRENCE-ID -> event
    
    console.log(`📅 Processing events between ${sixMonthsAgo.toISOString()} and ${sixMonthsFromNow.toISOString()}`);
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventData = eventBlocks[i];
      const endIndex = eventData.indexOf('END:VEVENT');
      if (endIndex === -1) continue;
      
      const eventContent = eventData.substring(0, endIndex);
      const parsedEvent = parseEvent(eventContent);
      
      // Debug every event that contains "travel" or "office" (case insensitive)
      if (parsedEvent && parsedEvent.summary && 
          (parsedEvent.summary.toLowerCase().includes('travel') || 
           parsedEvent.summary.toLowerCase().includes('office'))) {
        console.log(`\n🚗 FOUND TRAVEL/OFFICE EVENT #${i}:`);
        console.log(`  Title: "${parsedEvent.summary}"`);
        console.log(`  UID: ${parsedEvent.uid}`);
        console.log(`  Start: ${parsedEvent.start}`);
        console.log(`  Is Recurring: ${parsedEvent.isRecurring}`);
        console.log(`  RRULE: ${parsedEvent.rrule}`);
        console.log(`  Exception dates: ${parsedEvent.exdates?.length || 0}`);
        console.log(`  Raw event content preview:`, eventContent.substring(0, 200) + '...');
      }
      
      if (parsedEvent && parsedEvent.uid) {
        if (parsedEvent.recurrenceId) {
          // This is a modified instance of a recurring event
          console.log(`🔄 MODIFIED INSTANCE FOUND:`, {
            title: parsedEvent.summary,
            uid: parsedEvent.uid,
            recurrenceId: parsedEvent.recurrenceId,
            start: parsedEvent.start,
            end: parsedEvent.end,
            dtstart: parsedEvent.dtstart,
            dtend: parsedEvent.dtend,
            hasEndTime: !!parsedEvent.end
          });
          
          if (!modifiedInstances.has(parsedEvent.uid)) {
            modifiedInstances.set(parsedEvent.uid, new Map());
          }
          modifiedInstances.get(parsedEvent.uid).set(parsedEvent.recurrenceId, parsedEvent);
          console.log(`Found modified instance for UID ${parsedEvent.uid} on ${parsedEvent.recurrenceId}`);
        } else {
          // This is a base event (either single or recurring master)
          eventsByUID.set(parsedEvent.uid, parsedEvent);
          
          // Log all recurring events for debugging
          if (parsedEvent.isRecurring) {
            console.log(`📅 Added recurring event: "${parsedEvent.summary}" (${parsedEvent.uid})`);
          }
        }
      } else {
        console.log(`⚠️ Skipped event #${i} - missing UID or failed parsing`);
        if (eventContent.toLowerCase().includes('travel') || eventContent.toLowerCase().includes('office')) {
          console.log(`🚨 ALERT: Skipped event contains 'travel' or 'office'!`);
          console.log(`Event content preview:`, eventContent.substring(0, 500));
        }
      }
    }
    
    console.log(`\n📊 PARSING SUMMARY:`);
    console.log(`  Total event blocks found: ${eventBlocks.length - 1}`);
    console.log(`  Base events parsed: ${eventsByUID.size}`);
    console.log(`  Modified recurring instances: ${modifiedInstances.size}`);
    console.log(`  Events with 'travel' or 'office' in title: ${Array.from(eventsByUID.values()).filter(e => e.summary && (e.summary.toLowerCase().includes('travel') || e.summary.toLowerCase().includes('office'))).length}`);
    
    // Second pass: process events with exception handling
    for (const [uid, baseEvent] of eventsByUID) {
      if (baseEvent.start) {
        if (baseEvent.isRecurring && baseEvent.rrule) {
          // Expand recurring event into individual instances
          console.log(`\n=== DEBUGGING RECURRING EVENT ===`);
          console.log(`Event: "${baseEvent.summary}" (UID: ${uid})`);
          console.log(`Start: ${baseEvent.start?.toISOString()}`);
          console.log(`RRULE: ${baseEvent.rrule}`);
          console.log(`Exception dates: ${baseEvent.exdates?.length || 0}`);
          
          // Get exception dates and modified instances for this UID
          const exceptionDates = baseEvent.exdates || [];
          const modifiedInstancesForUID = modifiedInstances.get(uid) || new Map();
          
          const recurringInstances = expandRecurringEventWithExceptions(
            baseEvent, 
            sixMonthsAgo, 
            sixMonthsFromNow,
            exceptionDates,
            modifiedInstancesForUID
          );
          
          console.log(`Generated ${recurringInstances.length} instances for "${baseEvent.summary}" after applying exceptions`);
          console.log(`Date range: ${sixMonthsAgo.toISOString()} to ${sixMonthsFromNow.toISOString()}`);
          
          if (baseEvent.summary && baseEvent.summary.toLowerCase().includes('travel')) {
            console.log(`\n🚗 TRAVEL EVENT DETAILED DEBUG:`);
            console.log(`  Title: ${baseEvent.summary}`);
            console.log(`  Start date: ${baseEvent.start}`);
            console.log(`  RRULE parsed:`, parseRRule(baseEvent.rrule));
            console.log(`  Instances generated: ${recurringInstances.length}`);
            console.log(`  First few instances:`, recurringInstances.slice(0, 5).map(i => i.start));
          }
          
          events.push(...recurringInstances);
        } else {
          // Single event - check if it's in our date range
          const eventDate = new Date(baseEvent.start);
          const isRelevant = eventDate >= sixMonthsAgo && eventDate <= sixMonthsFromNow;
          
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
      rawDtend: event.dtend, // Keep for debugging
      originalProperty: event.dtstartProperty, // Keep for debugging
      
      // DEBUG: Log each meeting as it's processed
      debug: (() => {
        if (event.summary && event.summary.includes('Power 15')) {
          console.log(`🔍 PROCESSING POWER 15 MEETING:`, {
            title: event.summary,
            start: event.start,
            end: event.end,
            dtstart: event.dtstart,
            dtend: event.dtend,
            isModified: event.isModified,
            isRecurring: event.isRecurring
          });
        }
        return undefined;
      })()
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
        from: sixMonthsAgo.toISOString(),
        to: sixMonthsFromNow.toISOString()
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
          console.log(`  Modified instance end time:`, modifiedInstance.end);
          const instance = {
            ...modifiedInstance,
            isRecurring: true,
            recurringInstanceDate: modifiedDate.toISOString(),
            instanceId: `mod-${Date.now()}`,
            originalUid: baseEvent.uid,
            isModified: true,
            isMovedInstance: true
          };
          console.log(`  Final instance end time:`, instance.end);
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
  // Format date as YYYYMMDD or YYYYMMDDTHHMMSS for comparison with RECURRENCE-ID and EXDATE
  if (!date) return null;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  
  // For comparison purposes, we'll use the full timestamp format
  return `${year}${month}${day}T${hour}${minute}${second}`;
}

function formatDateForComparisonShort(date) {
  // Format date as YYYYMMDD for basic date comparison
  if (!date) return null;
  
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
  
  // Special handling for multiple days in the same week (Mon-Fri pattern)
  if (targetDays.length > 1) {
    // Find the next day in the current week first
    for (const targetDay of targetDays) {
      if (targetDay > currentDay) {
        nextDate.setDate(nextDate.getDate() + (targetDay - currentDay));
        console.log(`Next day in current week: ${nextDate.toDateString()}`);
        return nextDate;
      }
    }
    
    // If no more days in current week, go to the first day of next interval
    const weeksToAdd = interval;
    const daysToAdd = (7 - currentDay) + (7 * (weeksToAdd - 1)) + targetDays[0];
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    console.log(`First day of next ${interval}-week interval: ${nextDate.toDateString()}`);
    return nextDate;
  } else {
    // Single day pattern - original logic
    const targetDay = targetDays[0];
    if (targetDay > currentDay) {
      nextDate.setDate(nextDate.getDate() + (targetDay - currentDay));
    } else {
      const daysToNextWeek = 7 - currentDay + (7 * (interval - 1));
      nextDate.setDate(nextDate.getDate() + daysToNextWeek + targetDay);
    }
    return nextDate;
  }
}

function parseEvent(eventContent) {
  const event = { attendees: [], organizer: '', isAllDay: false, isRecurring: false, exdates: [] };
  const lines = eventContent.split('\n');
  
  // First pass: handle line continuations (lines that start with space or tab)
  const consolidatedLines = [];
  let currentLine = '';
  
  console.log(`🔄 Processing ${lines.length} raw lines from event content`);
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    
    // Check if this line is a continuation (starts with space or tab in original)
    if (lines[i].match(/^\s/) || (currentLine && !line.includes(':'))) {
      // This is a continuation of the previous line
      currentLine += line.replace(/^\s+/, ''); // Remove leading whitespace
    } else {
      // This is a new property line
      if (currentLine) {
        consolidatedLines.push(currentLine);
      }
      currentLine = line;
    }
  }
  
  // Don't forget the last line
  if (currentLine) {
    consolidatedLines.push(currentLine);
  }
  
  console.log(`📝 Consolidated ${lines.length} raw lines into ${consolidatedLines.length} property lines`);
  
  // Log first few lines for debugging
  console.log(`📋 First few consolidated lines:`, consolidatedLines.slice(0, 5));
  
  for (let line of consolidatedLines) {
    if (!line.includes(':')) continue;
    
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
      event.dtend = value; // Keep original for debugging
      event.dtendProperty = property; // Keep property for debugging
    } else if (property.startsWith('RECURRENCE-ID')) {
      // This is a modified instance of a recurring event
      console.log('Found RECURRENCE-ID:', property, value);
      const recurrenceDate = parseDate(value, property);
      event.recurrenceId = formatDateForComparison(recurrenceDate);
      event.isModifiedInstance = true;
      console.log(`  Parsed RECURRENCE-ID: ${value} -> ${recurrenceDate} -> ${event.recurrenceId}`);
    } else if (property.startsWith('EXDATE')) {
      // Exception dates (cancelled instances) - handle multiple formats
      console.log('Found EXDATE:', property, value);
      
      // Split by comma to handle multiple dates in one EXDATE line
      const dateStrings = value.split(',');
      
      for (let dateStr of dateStrings) {
        dateStr = dateStr.trim();
        if (dateStr) {
          const parsedDate = parseDate(dateStr, property);
          if (parsedDate) {
            event.exdates.push(parsedDate);
            console.log(`  Added exception date: ${parsedDate.toISOString()}`);
          } else {
            console.log(`  Failed to parse exception date: ${dateStr}`);
          }
        }
      }
      
      console.log(`Total exception dates found: ${event.exdates.length}`);
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
    end: event.end,
    isAllDay: event.isAllDay,
    isRecurring: event.isRecurring,
    isModifiedInstance: event.isModifiedInstance,
    recurrenceId: event.recurrenceId,
    exdates: event.exdates.length,
    rrule: event.rrule,
    dtstart: event.dtstart,
    dtend: event.dtend,
    dtstartProperty: event.dtstartProperty,
    dtendProperty: event.dtendProperty
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
      } else if (cleanDate.length === 8) {
        // Handle YYYYMMDD format without time (treat as midnight)
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        
        const dateStr = `${year}-${month}-${day}T00:00:00`;
        const result = new Date(dateStr);
        console.log('Date-only format parsed as local midnight:', result);
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
