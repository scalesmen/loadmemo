// src/components/accounting/utils/generateBOLPdf.js
// ⭐ UPDATED: Added returnBlob parameter to support email attachment

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { query, where, getDocs, collection, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { detectCommodityType, getCommodityBadgeText, getFacilityLabel } from './commodityDetection';
import { getLocationString, getDefaultCompanyInfo } from './loadHelpers';
import { formatDriverTimestamp } from './dateFormatters';
import { BASE_BOL_URL, COMMODITY_TYPES } from '../constants/accountingConstants';

// PDF Styles (unchanged)
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    padding: 20,
    fontSize: 10
  },
  header: {
    marginBottom: 12,
    textAlign: 'center'
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  loadId: {
    fontSize: 12,
    color: '#666'
  },
  commodityBadge: {
    fontSize: 10,
    color: '#0369a1',
    backgroundColor: '#dbeafe',
    padding: 4,
    borderRadius: 4,
    marginTop: 4
  },
  // Online BOL Section Styles
  onlineBOLSection: {
    flexDirection: 'row',
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#f0f9ff',
    border: '2pt solid #0369a1',
    borderRadius: 4,
    alignItems: 'center'
  },
  onlineBOLLeft: {
    flex: 1,
    paddingRight: 10
  },
  onlineBOLRight: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  onlineBOLTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: 4
  },
  onlineBOLText: {
    fontSize: 9,
    color: '#1e40af',
    marginBottom: 3
  },
  onlineBOLUrl: {
    fontSize: 8,
    color: '#0369a1',
    fontWeight: 'bold',
    marginBottom: 4,
    padding: 3,
    backgroundColor: '#ffffff',
    border: '1pt solid #bfdbfe',
    borderRadius: 2
  },
  onlineBOLInstructions: {
    fontSize: 7,
    color: '#374151',
    fontStyle: 'italic'
  },
  qrCode: {
    width: 60,
    height: 60,
    marginBottom: 2
  },
  qrCodeLabel: {
    fontSize: 6,
    color: '#0369a1',
    textAlign: 'center',
    fontWeight: 'bold'
  },
  carrierDriverRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 20
  },
  locationRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 20
  },
  signatureRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 20
  },
  leftColumn: {
    flex: 1,
    padding: 8,
    border: '1pt solid #ccc'
  },
  rightColumn: {
    flex: 1,
    padding: 8,
    border: '1pt solid #ccc'
  },
  section: {
    marginBottom: 8,
    padding: 8,
    border: '1pt solid #ccc'
  },
  signatureContainer: {
    marginTop: 8,
    alignItems: 'center',
    border: '1pt solid #ddd',
    padding: 6,
    backgroundColor: '#fafafa',
    minHeight: 80
  },
  signatureImage: {
    width: 180,
    height: 60,
    objectFit: 'contain',
    marginBottom: 4,
    border: '1pt solid #e5e5e5'
  },
  signatureTimestamp: {
    fontSize: 6,
    color: '#999',
    textAlign: 'center',
    marginTop: 2
  },
  commoditySection: {
    marginBottom: 10,
    padding: 8,
    border: '1pt solid #0369a1',
    backgroundColor: '#f0f9ff'
  },
  commodityTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: 6,
    textAlign: 'center'
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333'
  },
  bodyText: {
    fontSize: 9,
    marginBottom: 2,
    color: '#333'
  },
  hazmatText: {
    fontSize: 9,
    marginBottom: 2,
    color: '#dc2626',
    fontWeight: 'bold'
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  vehicleItem: {
    border: '1pt solid #bfdbfe',
    backgroundColor: '#ffffff',
    padding: 4,
    borderRadius: 2,
    minWidth: '45%'
  },
  vehicleHeader: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 2
  },
  vehicleText: {
    fontSize: 7,
    color: '#374151',
    marginBottom: 1
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 10,
    borderTop: '1pt solid #ccc',
    textAlign: 'center'
  },
  footerText: {
    fontSize: 7,
    color: '#666',
    marginBottom: 2
  }
});

// Commodity Section Component (unchanged)
const CommoditySection = ({ load, commodityType }) => {
  if (commodityType === COMMODITY_TYPES.AUTOMOBILE && load.vehicles && load.vehicles.length > 0) {
    return (
      <View style={styles.commoditySection}>
        <Text style={styles.commodityTitle}>VEHICLE DETAILS</Text>
        <Text style={styles.bodyText}>Total Vehicles: {load.vehicleCount || load.vehicles.length}</Text>
        <View style={styles.vehicleGrid}>
          {load.vehicles.map((vehicle, idx) => (
            <View key={idx} style={styles.vehicleItem}>
              <Text style={styles.vehicleHeader}>Vehicle #{idx + 1}</Text>
              <Text style={styles.vehicleText}>Make/Model: {vehicle.make} {vehicle.model}</Text>
              <Text style={styles.vehicleText}>Year: {vehicle.year}</Text>
              <Text style={styles.vehicleText}>VIN: {vehicle.vin}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (commodityType === COMMODITY_TYPES.REEFER) {
    return (
      <View style={styles.commoditySection}>
        <Text style={styles.commodityTitle}>❄️ REFRIGERATED CARGO DETAILS</Text>
        {load.reeferTemp && <Text style={styles.bodyText}>Required Temperature: {load.reeferTemp}°F</Text>}
        {load.reeferTempRange && <Text style={styles.bodyText}>Temperature Range: {load.reeferTempRange}</Text>}
        {load.reeferInstructions && <Text style={styles.bodyText}>Special Instructions: {load.reeferInstructions}</Text>}
      </View>
    );
  }

  if (commodityType === COMMODITY_TYPES.FLATBED) {
    return (
      <View style={styles.commoditySection}>
        <Text style={styles.commodityTitle}>🏗️ FLATBED CARGO DETAILS</Text>
        {load.weight && <Text style={styles.bodyText}>Weight: {load.weight} lbs</Text>}
        {load.dimensions && <Text style={styles.bodyText}>Dimensions: {load.dimensions}</Text>}
        {load.tarpingRequired && <Text style={styles.bodyText}>Tarping Required: {load.tarpingRequired}</Text>}
        {load.securementType && <Text style={styles.bodyText}>Securement Type: {load.securementType}</Text>}
      </View>
    );
  }

  if (commodityType === COMMODITY_TYPES.TANKER) {
    return (
      <View style={styles.commoditySection}>
        <Text style={styles.commodityTitle}>🛢️ TANKER CARGO DETAILS</Text>
        {load.productType && <Text style={styles.bodyText}>Product Type: {load.productType.replace('_', ' ')}</Text>}
        {load.hazmatRequired === 'yes' && <Text style={styles.hazmatText}>⚠️ HAZMAT CERTIFICATION REQUIRED</Text>}
        {load.tankWashRequired && <Text style={styles.bodyText}>Tank Wash Required: {load.tankWashRequired}</Text>}
      </View>
    );
  }

  if (commodityType === COMMODITY_TYPES.DRY_VAN) {
    return (
      <View style={styles.commoditySection}>
        <Text style={styles.commodityTitle}>📦 DRY VAN CARGO DETAILS</Text>
        {load.cargoWeight && <Text style={styles.bodyText}>Cargo Weight: {load.cargoWeight} lbs</Text>}
        {load.palletCount && <Text style={styles.bodyText}>Pallet Count: {load.palletCount}</Text>}
        {load.trailerType && <Text style={styles.bodyText}>Trailer Type: {load.trailerType.replace('_', ' ')}</Text>}
        {load.loadingEquipment && <Text style={styles.bodyText}>Loading Equipment: {load.loadingEquipment.replace('_', ' ')}</Text>}
        {load.cargoType && <Text style={styles.bodyText}>Cargo Type: {load.cargoType.replace('_', ' ')}</Text>}
      </View>
    );
  }

  return null;
};

// ⭐ UPDATED: Added returnBlob parameter (default false for backward compatibility)
export async function generateBOLPdf(load, drivers, loggedInUser, returnBlob = false) {
  // Get driver info - fetch from Firestore to ensure we have the latest showOnBOL value
  let driver = {
    name: "N/A",
    email: "N/A",
    phone: "N/A",
    showOnBOL: false
  };

  if (load.driverId) {
    try {
      const driverDoc = await getDoc(doc(db, "drivers", load.driverId));
      if (driverDoc.exists()) {
        driver = { id: driverDoc.id, ...driverDoc.data() };
      }
    } catch (error) {
      console.error("Error fetching driver for BOL:", error);
      // Fallback to drivers array if Firestore fetch fails
      driver = drivers.find(d => d.id === load.driverId) || driver;
    }
  }

  // Check if driver should be shown on BOL
  const showDriverInfo = driver && driver.showOnBOL === true;

  // Get company info
  let companyInfo = getDefaultCompanyInfo();

  // Prioritize load's companyName (set via edit modal) over driver's assignedCompanyName
  const companyNameToFetch = load.companyName || driver?.assignedCompanyName;

  if (companyNameToFetch) {
    try {
      const companiesQuery = query(
        collection(db, "companies"),
        where("name", "==", companyNameToFetch)
      );
      const companiesSnapshot = await getDocs(companiesQuery);

      if (!companiesSnapshot.empty) {
        const companyDoc = companiesSnapshot.docs[0];
        const companyData = companyDoc.data();
        companyInfo = {
          name: companyData.name || companyNameToFetch,
          address: companyData.address || 'Address Not Available',
          phone: companyData.phone || 'Phone Not Available',
          email: companyData.email || 'Email Not Available',
          usdot: companyData.usdot || 'USDOT Not Available',
          mcNumber: companyData.mcNumber || 'MC Not Available',
          taxId: companyData.taxId || 'Tax ID Not Available'
        };
      } else {
        companyInfo.name = companyNameToFetch;
      }
    } catch (error) {
      console.error("Error fetching company info for BOL:", error);
      companyInfo.name = companyNameToFetch;
    }
  } else if (companyNameToFetch) {
    companyInfo.name = companyNameToFetch;
  }

  // Generate online BOL URL
  const onlineBOLUrl = `${BASE_BOL_URL}/online-bol/${load.docId}`;

  // Generate QR code
  let qrCodeDataUrl = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(onlineBOLUrl, {
      width: 120,
      height: 120,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
  }

  const commodityType = detectCommodityType(load);
  const pickupPhotoCount = load.pickupPhotosMetadata?.length || 0;
  const deliveryPhotoCount = load.deliveryPhotosMetadata?.length || 0;

  // BOL Document Component
  const BOLDocument = () => (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>BILL OF LADING</Text>
          <Text style={styles.loadId}>Load ID: {load.load_id}</Text>
          <Text style={styles.commodityBadge}>
            {getCommodityBadgeText(commodityType)}
          </Text>
        </View>

        <View style={styles.onlineBOLSection}>
          <View style={styles.onlineBOLLeft}>
            <Text style={styles.onlineBOLTitle}>ONLINE BILL OF LADING</Text>
            <Text style={styles.onlineBOLText}>View this BOL online with photos and signatures:</Text>
            <Text style={styles.onlineBOLUrl}>{onlineBOLUrl}</Text>
            <Text style={styles.onlineBOLInstructions}>
              Scan QR code or visit the URL above to view the complete digital BOL
              with photos, signatures, and location data.
            </Text>
          </View>
          {qrCodeDataUrl && (
            <View style={styles.onlineBOLRight}>
              <Image src={qrCodeDataUrl} style={styles.qrCode} />
              <Text style={styles.qrCodeLabel}>Scan for Online BOL</Text>
            </View>
          )}
        </View>

        {showDriverInfo ? (
          <View style={styles.carrierDriverRow}>
            <View style={styles.leftColumn}>
              <Text style={styles.sectionTitle}>CARRIER INFORMATION</Text>
              <Text style={styles.bodyText}>Company: {companyInfo.name}</Text>
              <Text style={styles.bodyText}>Address: {companyInfo.address}</Text>
              <Text style={styles.bodyText}>Phone: {companyInfo.phone}</Text>
              <Text style={styles.bodyText}>Email: {companyInfo.email}</Text>
              <Text style={styles.bodyText}>MC#: {companyInfo.mcNumber}</Text>
              <Text style={styles.bodyText}>USDOT: {companyInfo.usdot}</Text>
            </View>

            <View style={styles.rightColumn}>
              <Text style={styles.sectionTitle}>DRIVER INFORMATION</Text>
              <Text style={styles.bodyText}>Driver: {driver.name}</Text>
              <Text style={styles.bodyText}>Email: {driver.email}</Text>
              <Text style={styles.bodyText}>Phone: {driver.phone}</Text>
              {load.mileage && <Text style={styles.bodyText}>Miles: {load.mileage}</Text>}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CARRIER INFORMATION</Text>
            <Text style={styles.bodyText}>Company: {companyInfo.name}</Text>
            <Text style={styles.bodyText}>Address: {companyInfo.address}</Text>
            <Text style={styles.bodyText}>Phone: {companyInfo.phone}</Text>
            <Text style={styles.bodyText}>Email: {companyInfo.email}</Text>
            <Text style={styles.bodyText}>MC#: {companyInfo.mcNumber}</Text>
            <Text style={styles.bodyText}>USDOT: {companyInfo.usdot}</Text>
          </View>
        )}

        <View style={styles.locationRow}>
          <View style={styles.leftColumn}>
            <Text style={styles.sectionTitle}>PICKUP INFORMATION</Text>
            <Text style={styles.bodyText}>
              {getFacilityLabel(commodityType)} {load.pickupLocationName || 'N/A'}
            </Text>
            <Text style={styles.bodyText}>Address: {load.pickupLocation}</Text>
            <Text style={styles.bodyText}>
              Scheduled: {formatDriverTimestamp(load.pickupDateTime)}
            </Text>
            {load.pickupInstructions && (
              <Text style={styles.bodyText}>Instructions: {load.pickupInstructions}</Text>
            )}
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.sectionTitle}>DELIVERY INFORMATION</Text>
            <Text style={styles.bodyText}>
              {getFacilityLabel(commodityType)} {load.deliveryLocationName || 'N/A'}
            </Text>
            <Text style={styles.bodyText}>Address: {load.deliveryLocation}</Text>
            <Text style={styles.bodyText}>
              Scheduled: {formatDriverTimestamp(load.deliveryDateTime)}
            </Text>
            {load.deliveryInstructions && (
              <Text style={styles.bodyText}>Instructions: {load.deliveryInstructions}</Text>
            )}
          </View>
        </View>

        <CommoditySection load={load} commodityType={commodityType} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DOCUMENTATION</Text>
          <Text style={styles.bodyText}>Pickup Photos Taken: {pickupPhotoCount}</Text>
          <Text style={styles.bodyText}>Delivery Photos Taken: {deliveryPhotoCount}</Text>
          {load.adminNotes && <Text style={styles.bodyText}>Special Notes: {load.adminNotes}</Text>}
        </View>

        {(load.pickupSignatureUrl || load.deliverySignatureUrl) && (
          <View style={styles.signatureRow}>
            {load.pickupSignatureUrl && (
              <View style={styles.leftColumn}>
                <Text style={styles.sectionTitle}>PICKUP SIGNATURE</Text>
                <Text style={styles.bodyText}>Signed by: {load.pickupSignatureMetadata?.signerName || 'N/A'}</Text>
                <Text style={styles.bodyText}>Date: {load.pickupSignatureMetadata?.capturedAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</Text>
                <Text style={styles.bodyText}>Location: {getLocationString(load.pickupSignatureMetadata?.location)}</Text>
                <View style={styles.signatureContainer}>
                  <Image src={load.pickupSignatureUrl} style={styles.signatureImage} />
                  <Text style={styles.signatureTimestamp}>
                    Captured on: {load.pickupSignatureMetadata?.capturedAt?.toDate?.()?.toLocaleDateString() || 'N/A'}
                  </Text>
                </View>
              </View>
            )}

            {load.deliverySignatureUrl && (
              <View style={styles.rightColumn}>
                <Text style={styles.sectionTitle}>DELIVERY SIGNATURE</Text>
                <Text style={styles.bodyText}>Signed by: {load.deliverySignatureMetadata?.signerName || 'N/A'}</Text>
                <Text style={styles.bodyText}>Date: {load.deliverySignatureMetadata?.capturedAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</Text>
                <Text style={styles.bodyText}>Location: {getLocationString(load.deliverySignatureMetadata?.location)}</Text>
                <View style={styles.signatureContainer}>
                  <Image src={load.deliverySignatureUrl} style={styles.signatureImage} />
                  <Text style={styles.signatureTimestamp}>
                    Captured on: {load.deliverySignatureMetadata?.capturedAt?.toDate?.()?.toLocaleDateString() || 'N/A'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            This Bill of Lading was generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
          </Text>
          <Text style={styles.footerText}>
            📱 For complete digital documentation including photos and signatures, visit: {onlineBOLUrl}
          </Text>
        </View>
      </Page>
    </Document>
  );

  // Generate PDF
  try {
    const pdfBlob = await pdf(<BOLDocument />).toBlob();
    
    // ⭐ NEW: If returnBlob is true, return the blob instead of downloading
    if (returnBlob) {
      return pdfBlob;
    }
    
    // Otherwise, download the file (original behavior)
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BOL_${load.load_id}_${commodityType}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating BOL:', error);
    throw error;
  }
}