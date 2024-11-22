import { Client, Environment } from 'square'

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

// Enhanced validation function with better error logging
export async function validateSquareCredentials() {
  try {
    console.log('Attempting to validate Square credentials...')
    console.log('Environment:', Environment.Production)
    console.log('Location ID:', process.env.SQUARE_LOCATION_ID)
    console.log('Token Preview:', process.env.SQUARE_ACCESS_TOKEN?.substring(0, 6) + '...')

    const { result } = await squareClient.locationsApi.retrieveLocation(
      process.env.SQUARE_LOCATION_ID!
    )
    
    if (result.location) {
      console.log('Successfully connected to Square location:', result.location.name)
      return true
    }
    
    console.error('Location not found in response')
    return false
  } catch (error) {
    if (error instanceof Error) {
      console.error('Square Validation Error:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      })
    } else {
      console.error('Unknown Square Error:', error)
    }
    return false
  }
} 