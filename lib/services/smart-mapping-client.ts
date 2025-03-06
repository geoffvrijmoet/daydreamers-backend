/**
 * Client-side version of SmartMappingService that uses API endpoints
 * instead of directly accessing MongoDB
 */
export class SmartMappingClient {
  /**
   * Suggest products for a given name
   */
  static async suggestProductsForName(
    productName: string
  ): Promise<{ productId: string; productName: string; confidence: number }[]> {
    try {
      const response = await fetch(`/api/smart-mapping?mappingType=product_names&source=${encodeURIComponent(productName)}`);
      if (!response.ok) {
        throw new Error('Failed to get smart mapping suggestions');
      }
      
      const data = await response.json();
      return data.suggestions || [];
    } catch (error) {
      console.error('Error getting smart mapping suggestions:', error);
      return [];
    }
  }
  
  /**
   * Record a product name mapping
   */
  static async recordProductMapping(
    excelProductName: string,
    mongoProductName: string,
    mongoProductId: string
  ): Promise<boolean> {
    try {
      const response = await fetch('/api/smart-mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mappingType: 'product_names',
          source: excelProductName.toLowerCase().trim(),
          target: mongoProductName,
          targetId: mongoProductId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to record product mapping');
      }
      
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('Error recording product mapping:', error);
      return false;
    }
  }
  
  /**
   * Record an email supplier mapping
   */
  static async recordEmailSupplierMapping(
    emailPattern: string,
    supplierName: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const response = await fetch('/api/smart-mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mappingType: 'email_supplier',
          source: emailPattern.toLowerCase().trim(),
          target: supplierName,
          metadata
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to record email supplier mapping');
      }
      
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('Error recording email supplier mapping:', error);
      return false;
    }
  }
} 