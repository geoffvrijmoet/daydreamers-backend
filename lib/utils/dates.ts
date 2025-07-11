import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

const TIMEZONE = 'America/New_York'

// Helper function to validate if a date is valid
function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime())
}

export function toEasternTime(date: Date | string): Date {
  const utcDate = typeof date === 'string' ? new Date(date) : date
  
  if (!isValidDate(utcDate)) {
    console.warn('Invalid date passed to toEasternTime:', date)
    return new Date() // Return current date as fallback
  }
  
  return toZonedTime(utcDate, TIMEZONE)
}

export function fromEasternTime(date: Date | string): string {
  const easternDate = typeof date === 'string' ? new Date(date) : date
  
  if (!isValidDate(easternDate)) {
    console.warn('Invalid date passed to fromEasternTime:', date)
    return new Date().toISOString() // Return current date as fallback
  }
  
  // Convert back to UTC by using the timezone offset
  const offset = easternDate.getTimezoneOffset() * 60000
  return new Date(easternDate.getTime() - offset).toISOString()
}

export function formatInEasternTime(date: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const utcDate = typeof date === 'string' ? new Date(date) : date
  
  if (!isValidDate(utcDate)) {
    console.warn('Invalid date passed to formatInEasternTime:', date)
    return 'Invalid Date' // Return a safe string instead of throwing
  }
  
  return formatInTimeZone(utcDate, TIMEZONE, formatStr)
} 