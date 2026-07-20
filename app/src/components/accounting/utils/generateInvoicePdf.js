// src/components/accounting/utils/generateInvoicePdf.js

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { fetchCompanyInfo, fetchBrokerDetails } from '../services/accountingService';
import { detectCommodityType, getCommodityDisplayName } from './commodityDetection';
import { 
  formatInvoiceTimestamp, 
  calculateDueDate, 
  getPaymentTermsDescription,
  formatCurrency,
  getDefaultCompanyInfo,
  getDefaultDriverInfo,
  getDefaultBrokerInfo
} from './loadHelpers';

// Invoice PDF Styles with optimized spacing
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20, // Reduced from 30
    paddingBottom: 15, // Reduced from 20
    borderBottom: '2pt solid #0369a1'
  },
  companyInfo: {
    flex: 1
  },
  companyName: {
    fontSize: 16, // Reduced from 18
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: 4
  },
  companyAddress: {
    fontSize: 9, // Reduced from 10
    color: '#374151',
    marginBottom: 2
  },
  companyContact: {
    fontSize: 8, // Reduced from 9
    color: '#6b7280',
    marginBottom: 1
  },
  invoiceTitle: {
    alignItems: 'flex-end'
  },
  invoiceTitleText: {
    fontSize: 22, // Reduced from 24
    fontWeight: 'bold',
    color: '#0369a1'
  },
  invoiceNumber: {
    fontSize: 11, // Reduced from 12
    color: '#374151',
    marginTop: 5
  },
  invoiceDetailsRow: {
    flexDirection: 'row',
    marginBottom: 15, // Reduced from 25
    gap: 20 // Reduced from 30
  },
  invoiceDetails: {
    flex: 1,
    padding: 12, // Reduced from 15
    backgroundColor: '#f8fafc',
    border: '1pt solid #e2e8f0'
  },
  billTo: {
    flex: 1,
    padding: 12, // Reduced from 15
    backgroundColor: '#f8fafc',
    border: '1pt solid #e2e8f0'
  },
  sectionTitle: {
    fontSize: 10, // Reduced from 11
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 6, // Reduced from 8
    textTransform: 'uppercase'
  },
  detailText: {
    fontSize: 8, // Reduced from 9
    color: '#4b5563',
    marginBottom: 2
  },
  brokerName: {
    fontSize: 10, // Reduced from 11
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: 3
  },
  brokerAddress: {
    fontSize: 8, // Reduced from 9
    color: '#374151',
    marginBottom: 2
  },
  brokerContact: {
    fontSize: 8, // Reduced from 9
    color: '#6b7280',
    marginBottom: 2
  },
  shipmentSection: {
    marginBottom: 12, // Reduced from 20
    padding: 12, // Reduced from 15
    backgroundColor: '#f0f9ff',
    border: '1pt solid #0369a1'
  },
  shipmentGrid: {
    flexDirection: 'row',
    gap: 15 // Reduced from 20
  },
  shipmentColumn: {
    flex: 1
  },
  shipmentLabel: {
    fontSize: 9, // Reduced from 10
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: 3
  },
  shipmentValue: {
    fontSize: 9, // Reduced from 10
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 2
  },
  shipmentAddress: {
    fontSize: 7, // Reduced from 8
    color: '#6b7280',
    marginBottom: 2
  },
  shipmentDate: {
    fontSize: 8, // Reduced from 9
    color: '#374151'
  },
  cargoSection: {
    marginBottom: 12, // Reduced from 25
    padding: 12, // Reduced from 15
    backgroundColor: '#fefce8',
    border: '1pt solid #ca8a04'
  },
  cargoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10 // Reduced from 15
  },
  cargoItem: {
    fontSize: 8, // Reduced from 9
    color: '#374151',
    minWidth: '45%'
  },
  // NEW: Vehicle section styles
  vehicleSection: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f0fdf4',
    border: '1pt solid #10b981'
  },
  vehicleTable: {
    marginTop: 5
  },
  vehicleHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    padding: 6,
    borderRadius: 2
  },
  vehicleHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1
  },
  vehicleRow: {
    flexDirection: 'row',
    padding: 6,
    borderBottom: '1pt solid #d1fae5'
  },
  vehicleCell: {
    fontSize: 7,
    color: '#374151',
    flex: 1
  },
  lineItemsSection: {
    marginBottom: 12 // Reduced from 20
  },
  lineItemsHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    padding: 8, // Reduced from 10
    borderRadius: '4'
  },
  lineItemHeaderText: {
    flex: 1,
    fontSize: 9, // Reduced from 10
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center'
  },
  lineItem: {
    flexDirection: 'row',
    padding: 10, // Reduced from 12
    borderLeft: '1pt solid #d1d5db',
    borderRight: '1pt solid #d1d5db',
    borderBottom: '1pt solid #d1d5db'
  },
  lineItemText: {
    flex: 1,
    fontSize: 8, // Reduced from 9
    color: '#374151',
    textAlign: 'center'
  },
  totalsSection: {
    alignItems: 'flex-end',
    marginBottom: 15 // Reduced from 25
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 180, // Reduced from 200
    marginBottom: 6, // Reduced from 8
    paddingBottom: 4
  },
  totalsLabel: {
    fontSize: 9, // Reduced from 10
    color: '#374151'
  },
  totalsValue: {
    fontSize: 9, // Reduced from 10
    fontWeight: 'bold',
    color: '#374151'
  },
  totalsFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 180, // Reduced from 200
    padding: 8, // Reduced from 10
    backgroundColor: '#0369a1',
    borderRadius: 4
  },
  totalsFinalLabel: {
    fontSize: 11, // Reduced from 12
    fontWeight: 'bold',
    color: '#ffffff'
  },
  totalsFinalValue: {
    fontSize: 13, // Reduced from 14
    fontWeight: 'bold',
    color: '#ffffff'
  },
  paymentSection: {
    marginBottom: 15, // Reduced from 25
    padding: 12, // Reduced from 15
    backgroundColor: '#f8fafc',
    border: '1pt solid #e2e8f0'
  },
  paymentText: {
    fontSize: 8, // Reduced from 9
    color: '#374151',
    marginBottom: 2
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 12, // Reduced from 15
    borderTop: '1pt solid #d1d5db',
    textAlign: 'center'
  },
  footerText: {
    fontSize: 8, // Reduced from 9
    color: '#6b7280',
    marginBottom: 2
  },
  footerSmall: {
    fontSize: 7,
    color: '#9ca3af'
  }
});

export async function generateInvoicePdf(load, drivers, brokers, loggedInUser, returnBlob = false) {
  if (!load) return;

  // Get driver info
  const driverInfo = drivers.find(d => d.id === load.driverId) || getDefaultDriverInfo();

  // Get company info
  let companyInfo = getDefaultCompanyInfo();

  const companyNameToFetch = load.companyName || driverInfo?.assignedCompanyName;

  if (companyNameToFetch && loggedInUser?.tenantId) {
    const fetchedCompanyInfo = await fetchCompanyInfo(
      companyNameToFetch, 
      loggedInUser.tenantId
    );
    if (fetchedCompanyInfo) {
      companyInfo = fetchedCompanyInfo;
    } else {
      companyInfo.name = companyNameToFetch;
    }
  }

  // Get broker details
  let brokerDetailsResult = null;
  if (load.brokerId && loggedInUser?.tenantId) {
    brokerDetailsResult = await fetchBrokerDetails(load.brokerId, loggedInUser.tenantId);
  }
  brokerDetailsResult = brokerDetailsResult || getDefaultBrokerInfo(load);

  // Invoice details
  const commodityDescription = getCommodityDisplayName(detectCommodityType(load));
  const subtotal = Number(load.amount) || 0;
  const invoiceNumber = `INV-${load.load_id}-${new Date().getFullYear()}`;
  const invoiceDate = new Date().toLocaleDateString();
  const dueDate = load.payTerms ? calculateDueDate(load.payTerms) : 'N/A';

  // Invoice Document Component
  const InvoiceDocument = () => (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with Company Info */}
        <View style={styles.header}>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{companyInfo.name}</Text>
            <Text style={styles.companyAddress}>{companyInfo.address}</Text>
            <Text style={styles.companyContact}>Phone: {companyInfo.phone}</Text>
            <Text style={styles.companyContact}>Email: {companyInfo.email}</Text>
            <Text style={styles.companyContact}>MC#: {companyInfo.mcNumber} | USDOT: {companyInfo.usdot}</Text>
          </View>
          <View style={styles.invoiceTitle}>
            <Text style={styles.invoiceTitleText}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>#{invoiceNumber}</Text>
          </View>
        </View>

        {/* Invoice Details and Bill To */}
        <View style={styles.invoiceDetailsRow}>
          <View style={styles.invoiceDetails}>
            <Text style={styles.sectionTitle}>Invoice Details</Text>
            <Text style={styles.detailText}>Invoice Date: {invoiceDate}</Text>
            <Text style={styles.detailText}>Due Date: {dueDate}</Text>
            <Text style={styles.detailText}>Load ID: {load.load_id}</Text>
          </View>
          <View style={styles.billTo}>
            <Text style={styles.sectionTitle}>Bill To</Text>
            <Text style={styles.brokerName}>{brokerDetailsResult.name}</Text>
            <Text style={styles.brokerAddress}>{brokerDetailsResult.address}</Text>
            {brokerDetailsResult.phone !== "Phone Not Available" && (
              <Text style={styles.brokerContact}>Phone: {brokerDetailsResult.phone}</Text>
            )}
            {brokerDetailsResult.email !== "Email Not Available" && (
              <Text style={styles.brokerContact}>Email: {brokerDetailsResult.email}</Text>
            )}
          </View>
        </View>

        {/* Shipment Details */}
        <View style={styles.shipmentSection}>
          <Text style={styles.sectionTitle}>Shipment Details</Text>
          <View style={styles.shipmentGrid}>
            <View style={styles.shipmentColumn}>
              <Text style={styles.shipmentLabel}>Origin:</Text>
              <Text style={styles.shipmentValue}>{load.pickupLocationName || 'N/A'}</Text>
              <Text style={styles.shipmentAddress}>{load.pickupLocation}</Text>
              <Text style={styles.shipmentDate}>Pickup: {formatInvoiceTimestamp(load.pickupDateTime)}</Text>
            </View>
            <View style={styles.shipmentColumn}>
              <Text style={styles.shipmentLabel}>Destination:</Text>
              <Text style={styles.shipmentValue}>{load.deliveryLocationName || 'N/A'}</Text>
              <Text style={styles.shipmentAddress}>{load.deliveryLocation}</Text>
              <Text style={styles.shipmentDate}>Delivery: {formatInvoiceTimestamp(load.deliveryDateTime)}</Text>
            </View>
          </View>
        </View>

        {/* Cargo Information */}
        <View style={styles.cargoSection}>
          <Text style={styles.sectionTitle}>Cargo Information</Text>
          <View style={styles.cargoGrid}>
            <Text style={styles.cargoItem}>Service Type: {commodityDescription}</Text>
            {load.mileage && <Text style={styles.cargoItem}>Distance: {load.mileage} miles</Text>}
            {load.vehicles && load.vehicles.length > 0 && (
              <Text style={styles.cargoItem}>Vehicles: {load.vehicleCount || load.vehicles.length} unit(s)</Text>
            )}
            {load.weight && <Text style={styles.cargoItem}>Weight: {load.weight} lbs</Text>}
            {load.cargoWeight && <Text style={styles.cargoItem}>Cargo Weight: {load.cargoWeight} lbs</Text>}
            {load.reeferTemp && <Text style={styles.cargoItem}>Temperature: {load.reeferTemp}°F</Text>}
          </View>
        </View>

        {/* ⭐ NEW: Vehicle Details Table */}
        {load.vehicles && load.vehicles.length > 0 && (
          <View style={styles.vehicleSection}>
            <Text style={styles.sectionTitle}>Vehicle Details ({load.vehicles.length})</Text>
            <View style={styles.vehicleTable}>
              <View style={styles.vehicleHeaderRow}>
                <Text style={[styles.vehicleHeaderCell, { flex: 0.5 }]}>#</Text>
                <Text style={[styles.vehicleHeaderCell, { flex: 0.8 }]}>Year</Text>
                <Text style={[styles.vehicleHeaderCell, { flex: 1.2 }]}>Make</Text>
                <Text style={[styles.vehicleHeaderCell, { flex: 1.2 }]}>Model</Text>
                <Text style={[styles.vehicleHeaderCell, { flex: 2 }]}>VIN</Text>
              </View>
              {load.vehicles.map((vehicle, index) => (
                <View key={index} style={styles.vehicleRow}>
                  <Text style={[styles.vehicleCell, { flex: 0.5, fontWeight: 'bold' }]}>{index + 1}</Text>
                  <Text style={[styles.vehicleCell, { flex: 0.8 }]}>{vehicle.year || 'N/A'}</Text>
                  <Text style={[styles.vehicleCell, { flex: 1.2 }]}>{vehicle.make || 'N/A'}</Text>
                  <Text style={[styles.vehicleCell, { flex: 1.2 }]}>{vehicle.model || 'N/A'}</Text>
                  <Text style={[styles.vehicleCell, { flex: 2, fontFamily: 'Courier' }]}>
                    {vehicle.vin || 'N/A'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Invoice Line Items */}
        <View style={styles.lineItemsSection}>
          <View style={styles.lineItemsHeader}>
            <Text style={styles.lineItemHeaderText}>Description</Text>
            <Text style={styles.lineItemHeaderText}>Quantity</Text>
            <Text style={styles.lineItemHeaderText}>Rate</Text>
            <Text style={styles.lineItemHeaderText}>Amount</Text>
          </View>
          <View style={styles.lineItem}>
            <Text style={styles.lineItemText}>
              Transportation Services - {commodityDescription}
              {'\n'}Load ID: {load.load_id}
              {load.mileage && `\n${load.mileage} miles`}
              {load.vehicles && load.vehicles.length > 0 && `\n${load.vehicles.length} vehicle(s)`}
            </Text>
            <Text style={styles.lineItemText}>1</Text>
            <Text style={styles.lineItemText}>{formatCurrency(subtotal)}</Text>
            <Text style={styles.lineItemText}>{formatCurrency(subtotal)}</Text>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal:</Text>
            <Text style={styles.totalsValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.totalsFinalRow}>
            <Text style={styles.totalsFinalLabel}>Total Amount Due:</Text>
            <Text style={styles.totalsFinalValue}>{formatCurrency(subtotal)}</Text>
          </View>
        </View>

        {/* Payment Terms */}
        {load.payTerms && (
          <View style={styles.paymentSection}>
            <Text style={styles.sectionTitle}>Payment Terms</Text>
            {getPaymentTermsDescription(load.payTerms).map((term, index) => (
              <Text key={index} style={styles.paymentText}>{term}</Text>
            ))}
            <Text style={styles.paymentText}>• Make checks payable to: {companyInfo.name}</Text>
            {companyInfo.taxId && companyInfo.taxId !== 'Tax ID Not Available' && (
              <Text style={styles.paymentText}>• Tax ID: {companyInfo.taxId}</Text>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for your business! Questions? Contact us at {companyInfo.email} or {companyInfo.phone}
          </Text>
          <Text style={styles.footerSmall}>
            Invoice generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
          </Text>
        </View>
      </Page>
    </Document>
  );

  try {
    const pdfBlob = await pdf(<InvoiceDocument />).toBlob();
    
    if (returnBlob) {
      return pdfBlob;
    }
    
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Invoice_${load.load_id}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating Invoice:', error);
    throw error;
  }
}