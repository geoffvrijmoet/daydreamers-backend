import { ObjectId } from 'mongodb';

/**
 * MongoDB Dog Training Client Schema
 * 
 * This represents the structure of dog training clients stored in MongoDB.
 * It includes information about the client and their dogs.
 */

export interface DogSchema {
  /**
   * Dog's ID, generated automatically
   */
  _id?: ObjectId;
  
  /**
   * Dog's name
   */
  name: string;
  
  /**
   * Dog's breed
   */
  breed?: string;
  
  /**
   * Dog's age in years
   */
  age?: number;
  
  /**
   * Dog's sex (Male/Female)
   */
  sex?: 'Male' | 'Female';
  
  /**
   * Whether the dog is spayed or neutered
   */
  isFixed?: boolean;
  
  /**
   * Dog's weight in pounds
   */
  weight?: number;
  
  /**
   * Medical notes or conditions
   */
  medicalNotes?: string;
  
  /**
   * Behavioral notes or concerns
   */
  behavioralNotes?: string;
  
  /**
   * Training progress notes
   */
  trainingNotes?: string;
  
  /**
   * Dates for tracking
   */
  createdAt: string;
  updatedAt: string;
}

export interface DogTrainingClientSchema {
  /**
   * MongoDB document ID
   */
  _id: ObjectId;
  
  /**
   * Unique client ID
   */
  id: string;
  
  /**
   * Client's full name
   */
  name: string;
  
  /**
   * Client's email address
   */
  email?: string;
  
  /**
   * Client's phone number
   */
  phone?: string;
  
  /**
   * Client's address
   */
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  
  /**
   * Client's dogs
   */
  dogs: DogSchema[];
  
  /**
   * References to training session transaction IDs
   */
  trainingSessions?: string[];

  /**
   * Total number of sessions with this client
   */
  sessionCount: number;
  
  /**
   * Total revenue generated from this client (including tax)
   */
  totalRevenue: number;
  
  /**
   * Total sales amount (pre-tax) generated from this client
   */
  totalSales: number;
  
  /**
   * Total sales tax collected from this client
   */
  totalTax: number;
  
  /**
   * How the client was referred
   */
  referredBy?: string;
  
  /**
   * Client notes (payment preferences, scheduling preferences, etc.)
   */
  notes?: string;
  
  /**
   * Whether the client is active
   */
  isActive: boolean;
  
  /**
   * Date of first session
   */
  firstSessionDate?: string;
  
  /**
   * Date of most recent session
   */
  mostRecentSessionDate?: string;
  
  /**
   * Timestamps
   */
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate a unique ID for a dog training client
 */
export function createDogTrainingClientId(): string {
  const timestamp = new Date().getTime();
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `dtc_${timestamp}_${randomPart}`;
} 