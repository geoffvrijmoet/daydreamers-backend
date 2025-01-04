import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getDb } from '@/lib/db';
import { gmailService } from '@/lib/gmail';
import { logger } from '@/lib/utils/logger';

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailTestEmail {
  id: string;
  subject?: string;
  from?: string;
  date?: string;
  snippet?: string;
  fullBody?: string;
}

export async function GET() {
  try {
    logger.info('Starting Gmail API test for Amex Large Transaction emails');
    
    // Get credentials
    const db = await getDb();
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' });
    
    if (!credentials?.data) {
      logger.warn('No Gmail credentials found');
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      );
    }

    // Set credentials and get Gmail API instance
    gmailService.setCredentials(credentials.data);
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() });
    
    // First, test basic profile access
    logger.info('Testing profile access');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    logger.info('Successfully accessed Gmail profile', {
      email: profile.data.emailAddress
    });

    // Search specifically for Large Transaction Approved emails
    const query = 'from:AmericanExpress@welcome.americanexpress.com subject:"Large Transaction Approved"';
    logger.info('Searching for emails', { query });

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10
    });

    if (!response.data.messages) {
      logger.info('No Large Transaction emails found');
      return NextResponse.json({ message: 'No Large Transaction emails found' });
    }

    logger.info('Found Large Transaction emails', {
      count: response.data.messages.length
    });

    const foundEmails: GmailTestEmail[] = [];

    // Get details of each email
    for (const message of response.data.messages) {
      if (!message.id) continue;

      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });

      const headers = email.data.payload?.headers as GmailHeader[] | undefined;
      const emailDetails: GmailTestEmail = {
        id: message.id,
        subject: headers?.find(h => h.name.toLowerCase() === 'subject')?.value,
        from: headers?.find(h => h.name.toLowerCase() === 'from')?.value,
        date: headers?.find(h => h.name.toLowerCase() === 'date')?.value,
        snippet: email.data.snippet || undefined
      };

      // Get the email body
      const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data;
      if (body) {
        emailDetails.fullBody = Buffer.from(body, 'base64').toString('utf-8');
      }

      logger.info('Processed email', {
        id: message.id,
        subject: emailDetails.subject,
        from: emailDetails.from,
        date: emailDetails.date,
        bodyPreview: emailDetails.fullBody?.substring(0, 100)
      });

      foundEmails.push(emailDetails);
    }

    return NextResponse.json({
      success: true,
      profile: profile.data.emailAddress,
      totalEmails: foundEmails.length,
      emails: foundEmails
    });

  } catch (error) {
    logger.error('Gmail test error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test Gmail connection' },
      { status: 500 }
    );
  }
} 