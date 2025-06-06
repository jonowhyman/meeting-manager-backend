function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    console.log('Parsing date string:', dateString);
    
    // Handle different ICS date formats
    if (dateString.includes('T')) {
      // DateTime format: 20250606T083000Z or 20250606T083000
      const cleanDate = dateString.replace(/[Z]/g, '');
      
      if (cleanDate.length >= 15) { // Has time component
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        const hour = cleanDate.substring(9, 11);
        const minute = cleanDate.substring(11, 13);
        const second = cleanDate.substring(13, 15) || '00';
        
        // Create UTC date if original had Z, otherwise local
        if (dateString.endsWith('Z')) {
          return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
        } else {
          return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        }
      }
    } else {
      // Date only format: 20250606
      if (dateString.length === 8) {
        const year = dateString.substring(0, 4);
        const month = dateString.substring(4, 6);
        const day = dateString.substring(6, 8);
        
        // For date-only events, create at midnight local time
        return new Date(`${year}-${month}-${day}T00:00:00`);
      }
    }
    
    // Fallback: try direct parsing
    return new Date(dateString);
    
  } catch (error) {
    console.error('Date parsing error:', error, 'for input:', dateString);
    return null;
  }
}
