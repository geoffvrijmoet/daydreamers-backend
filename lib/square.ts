import { Client, Environment } from 'square'
import { logger } from './utils/logger'

if (!process.env.SQUARE_ACCESS_TOKEN) {
  throw new Error('SQUARE_ACCESS_TOKEN is not defined')
}

if (!process.env.SQUARE_LOCATION_ID) {
  throw new Error('SQUARE_LOCATION_ID is not defined')
}

export const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  userAgentDetail: 'Daydreamers Pet Supply'
})

interface SquareValidationResult {
  success: boolean;
  locationName?: string;
  error?: string;
}

export async function validateSquareCredentials(): Promise<SquareValidationResult> {
  try {
    logger.info('Validating Square credentials', {
      environment: Environment.Production,
      locationId: process.env.SQUARE_LOCATION_ID,
      tokenPreview: process.env.SQUARE_ACCESS_TOKEN?.substring(0, 6) + '...'
    });

    const { result } = await squareClient.locationsApi.retrieveLocation(
      process.env.SQUARE_LOCATION_ID!
    );
    
    if (result.location?.name) {
      logger.info('Successfully connected to Square location', {
        locationName: result.location.name
      });
      return {
        success: true,
        locationName: result.location.name
      };
    }
    
    logger.error('Location not found in response');
    return {
      success: false,
      error: 'Location not found in response'
    };
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Square Validation Error', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    } else {
      logger.error('Unknown Square Error', { error });
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 