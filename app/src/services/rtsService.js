// src/services/rtsService.js

import { auth } from '../firebase';

const FUNCTIONS_URL = process.env.REACT_APP_FUNCTIONS_URL || 'https://us-central1-your-project.cloudfunctions.net';

class RTSService {
  // Get auth token for requests
  async getAuthToken() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  // Test RTS connection
  async testConnection(credentials) {
    try {
      const token = await this.getAuthToken();
      
      const response = await fetch(`${FUNCTIONS_URL}/testRTSConnection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Connection test failed');
      }

      return data;
    } catch (error) {
      console.error('RTS connection test error:', error);
      throw error;
    }
  }

  // Submit invoices to RTS
  async submitInvoices(accountId, invoices, credentials, tenantId) {
    try {
      const token = await this.getAuthToken();
      
      const response = await fetch(`${FUNCTIONS_URL}/submitInvoicesToRTS`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountId,
          invoices,
          credentials,
          tenantId
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Invoice submission failed');
      }

      return data;
    } catch (error) {
      console.error('RTS invoice submission error:', error);
      throw error;
    }
  }

  // Check submission status
  async checkSubmissionStatus(submissionId, tenantId) {
    try {
      const token = await this.getAuthToken();
      
      const response = await fetch(`${FUNCTIONS_URL}/checkRTSSubmissionStatus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          submissionId,
          tenantId
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Status check failed');
      }

      return data;
    } catch (error) {
      console.error('RTS status check error:', error);
      throw error;
    }
  }

  // Format invoice data for RTS submission
  formatInvoiceForRTS(load) {
    return {
      invoiceNumber: load.invoiceNumber || `INV-${load.id}`,
      invoiceDate: new Date().toISOString(),
      customerName: load.brokerName || '',
      customerMC: load.brokerMC || '',
      amount: load.amount || 0,
      loadNumber: load.loadNumber || load.id,
      bolNumber: load.bolNumber || '',
      pickupDate: load.pickupDateTime,
      deliveryDate: load.deliveryDateTime,
      originCity: this.extractCity(load.pickupLocation),
      originState: this.extractState(load.pickupLocation),
      destinationCity: this.extractCity(load.deliveryLocation),
      destinationState: this.extractState(load.deliveryLocation),
      miles: load.mileage || 0
    };
  }

  // Extract city from address
  extractCity(address) {
    if (!address) return '';
    const parts = address.split(',');
    return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
  }

  // Extract state from address
  extractState(address) {
    if (!address) return '';
    const parts = address.split(',');
    const stateZip = parts[parts.length - 1].trim();
    return stateZip.split(' ')[0];
  }
}

export default new RTSService();