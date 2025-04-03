import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

const TIMEZONE = 'America/New_York'

export function toEasternTime(date: Date | string): Date {
  const utcDate = typeof date === 'string' ? new Date(date) : date
  return toZonedTime(utcDate, TIMEZONE)
}

export function fromEasternTime(date: Date | string): string {
  const easternDate = typeof date === 'string' ? new Date(date) : date
  // Convert back to UTC by using the timezone offset
  const offset = easternDate.getTimezoneOffset() * 60000
  return new Date(easternDate.getTime() - offset).toISOString()
}

export function formatInEasternTime(date: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const utcDate = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(utcDate, TIMEZONE, formatStr)
} 