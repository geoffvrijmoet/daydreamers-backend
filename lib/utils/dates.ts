import { formatInTimeZone, toDate } from 'date-fns-tz'

const TIMEZONE = 'America/New_York'

export function toEasternTime(date: Date | string): Date {
  const utcDate = typeof date === 'string' ? new Date(date) : date
  return toDate(utcDate, { timeZone: TIMEZONE })
}

export function fromEasternTime(date: Date | string): string {
  const easternDate = typeof date === 'string' ? new Date(date) : date
  return toDate(easternDate, { timeZone: TIMEZONE }).toISOString()
}

export function formatInEasternTime(date: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  return formatInTimeZone(date, TIMEZONE, formatStr)
} 