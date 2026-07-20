// src/components/DriverBOLPage.js
// Driver-friendly BOL page - no photos, no dates on signatures, with PDF download option
// ALWAYS uses driver's assignedCompanyName (not load's companyName)

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
const DriverBOLPage = () => {
  const { loadId } = useParams();
  const [load, setLoad] = useState(null);
  const [driver, setDriver] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPrintLoading, setIsPrintLoading] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);

  const detectCommodityType = (load) => {
    if (load.vehicles && load.vehicles.length > 0) return 'automobile_hauling';
    if (load.reeferTemp || load.reeferTempRange || load.reeferInstructions) return 'reefer';
    if (load.weight || load.dimensions || load.tarpingRequired || load.securementType) return 'flatbed';
    if (load.productType || load.hazmatRequired || load.tankWashRequired) return 'tanker';
    if (load.cargoWeight || load.palletCount || load.trailerType || load.loadingEquipment || load.cargoType) return 'dry_van';
    return 'general';
  };

  // Helper function to format date without time
  const formatDateOnly = (timestamp) => {
    if (!timestamp) return 'N/A';
    let dateToFormat;
    
    if (typeof timestamp === 'string') {
      dateToFormat = new Date(timestamp);
    } else if (timestamp && typeof timestamp.toDate === 'function') {
      dateToFormat = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      dateToFormat = timestamp;
    } else if (timestamp.seconds) {
      dateToFormat = new Date(timestamp.seconds * 1000);
    } else {
      return String(timestamp);
    }
    
    if (isNaN(dateToFormat.getTime())) {
      return String(timestamp);
    }
    
    return dateToFormat.toLocaleDateString();
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      );
      const data = await response.json();
      const city = data.city || data.locality || '';
      const state = data.principalSubdivision || '';
      if (city && state) {
        return `${city}, ${state}`;
      }
      return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    } catch (error) {
      return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    }
  };

  const LocationDisplay = ({ lat, lng }) => {
    const [address, setAddress] = useState(`${lat.toFixed(3)}, ${lng.toFixed(3)}`);
    useEffect(() => {
      reverseGeocode(lat, lng).then(setAddress);
    }, [lat, lng]);
    return <span className="text-gray-500 text-sm">📍 {address}</span>;
  };

  // Print/Save as PDF with loading indicator
  const handlePrintPDF = () => {
    setIsPrintLoading(true);
    // Small delay to let images fully render
    setTimeout(() => {
      window.print();
      setIsPrintLoading(false);
    }, 500);
  };

  useEffect(() => {
    const fetchBOLData = async () => {
      try {
        setIsLoading(true);
        
        console.log('DriverBOL: Fetching load data for ID:', loadId);
        
        const loadDocRef = doc(db, "loads", loadId);
        const loadDoc = await getDoc(loadDocRef);
        
        if (!loadDoc.exists()) {
          console.error('DriverBOL: Load not found:', loadId);
          setError("Load not found");
          return;
        }
        
        const loadData = { id: loadDoc.id, ...loadDoc.data() };
        console.log('DriverBOL: Load data retrieved');

        if (!loadData.tenantId) {
          console.error('DriverBOL: Load missing tenantId');
          setError("Load data is incomplete or invalid");
          return;
        }

        setLoad(loadData);

          // Fetch driver data
        let driverData = null;

        if (loadData.driverId) {
          const driverDoc = await getDoc(doc(db, "drivers", loadData.driverId));
          if (driverDoc.exists()) {
            driverData = driverDoc.data();
            
            if (driverData.tenantId !== loadData.tenantId) {
              console.error('DriverBOL: Driver tenantId mismatch');
              setError("Data validation failed");
              return;
            }

            setDriver({ id: driverDoc.id, ...driverData });
          }
        }

        console.log('DriverBOL: All data loaded successfully');
      } catch (err) {
        console.error("DriverBOL: Error fetching BOL data:", err);
        setError("Failed to load BOL data");
      } finally {
        setIsLoading(false);
      }
    };

    if (loadId) {
      fetchBOLData();
    }
  }, [loadId]);
// Preload signature images for faster PDF
useEffect(() => {
  if (!load) return;
  
  const imageUrls = [
    load.pickupSignatureUrl,
    load.deliverySignatureUrl
  ].filter(Boolean);
  
  if (imageUrls.length === 0) {
    setImagesReady(true);
    return;
  }
  
  let loadedCount = 0;
  
  imageUrls.forEach(url => {
    const img = new Image();
    img.onload = () => {
      loadedCount++;
      if (loadedCount === imageUrls.length) setImagesReady(true);
    };
    img.onerror = () => {
      loadedCount++;
      if (loadedCount === imageUrls.length) setImagesReady(true);
    };
    img.src = url;
  });
  
  // Fallback - mark ready after 5 seconds max
  const timeout = setTimeout(() => setImagesReady(true), 5000);
  return () => clearTimeout(timeout);
}, [load]);
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Bill of Lading...</p>
        </div>
      </div>
    );
  }

  if (error || !load) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-xl mb-2">❌ {error || "Load not found"}</p>
          <p className="text-gray-600">Please check the BOL link and try again.</p>
          <p className="text-gray-500 text-sm mt-4">If you believe this is an error, please contact dispatch.</p>
        </div>
      </div>
    );
  }

  const commodityType = detectCommodityType(load);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Print Styles */}
      <style>
        {`
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print\\:hidden { display: none !important; }
            .page-break { page-break-before: always; }
          }
        `}
      </style>

      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 text-center">
          <h1 className="text-3xl font-bold mb-2">BILL OF LADING</h1>
          <p className="text-xl">Load ID: {load.load_id}</p>
          <div className="mt-2">
            <span className="inline-block bg-blue-500 px-3 py-1 rounded-full text-sm">
              {commodityType === 'automobile_hauling' ? '🚗 Vehicle Transport' :
               commodityType === 'reefer' ? '❄️ Refrigerated' :
               commodityType === 'flatbed' ? '🏗️ Flatbed' :
               commodityType === 'tanker' ? '🛢️ Tanker' :
               commodityType === 'dry_van' ? '📦 Dry Van' : '📦 General Freight'}
            </span>
          </div>
          
          {/* PDF Download Button - Hidden in print */}
          <div className="mt-4 print:hidden">
           <button
  onClick={handlePrintPDF}
  disabled={isPrintLoading || !imagesReady}
  className={`inline-flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-colors ${
    (isPrintLoading || !imagesReady)
      ? 'bg-gray-300 text-gray-500 cursor-wait' 
      : 'bg-white text-blue-600 hover:bg-blue-50'
  }`}
>
  {!imagesReady ? (
    <>
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Loading signatures...
    </>
  ) : isPrintLoading ? (
    <>
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Preparing PDF...
    </>
  ) : (
    <>
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
      Save as PDF / Print
    </>
  )}
</button>
          </div>
        </div>

        {/* Company and Driver Info */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
            {driver && driver.showOnBOL && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Driver Information</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Driver:</span> {driver?.name || 'N/A'}</p>
                  <p><span className="font-medium">Email:</span> {driver?.email || 'N/A'}</p>
                  <p><span className="font-medium">Phone:</span> {driver?.phone || 'N/A'}</p>
                  {load.mileage && <p><span className="font-medium">Miles:</span> {load.mileage}</p>}
                  <p><span className="font-medium">Status:</span> <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">{load.status}</span></p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pickup and Delivery */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Pickup Information</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">{commodityType === 'automobile_hauling' ? 'Dealer:' : 'Facility:'}</span> {load.pickupLocationName || 'N/A'}</p>
                <p><span className="font-medium">Address:</span> {load.pickupLocation}</p>
                <p><span className="font-medium">Scheduled:</span> {formatDateOnly(load.pickupDateTime)}</p>
                {load.actualPU && <p><span className="font-medium">Actual Pickup:</span> {formatDateOnly(load.actualPU)}</p>}
                {load.pickupInstructions && <p><span className="font-medium">Instructions:</span> {load.pickupInstructions}</p>}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Delivery Information</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">{commodityType === 'automobile_hauling' ? 'Dealer:' : 'Facility:'}</span> {load.deliveryLocationName || 'N/A'}</p>
                <p><span className="font-medium">Address:</span> {load.deliveryLocation}</p>
                <p><span className="font-medium">Scheduled:</span> {formatDateOnly(load.deliveryDateTime)}</p>
                {load.actualDEL && <p><span className="font-medium">Actual Delivery:</span> {formatDateOnly(load.actualDEL)}</p>}
                {load.deliveryInstructions && <p><span className="font-medium">Instructions:</span> {load.deliveryInstructions}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Commodity Details */}
        {commodityType !== 'general' && (
          <div className="p-6 border-b border-gray-200">
            {commodityType === 'automobile_hauling' && load.vehicles && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">🚗 Vehicle Details</h3>
                <p className="text-sm mb-3"><span className="font-medium">Total Vehicles:</span> {load.vehicleCount || load.vehicles.length}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {load.vehicles.map((vehicle, idx) => (
                    <div key={idx} className="bg-blue-50 p-3 rounded border">
                      <h4 className="font-medium text-blue-800 mb-2">Vehicle #{idx + 1}</h4>
                      <div className="text-sm space-y-1">
                        <p><span className="font-medium">Make/Model:</span> {vehicle.make} {vehicle.model}</p>
                        <p><span className="font-medium">Year:</span> {vehicle.year}</p>
                        <p><span className="font-medium">VIN:</span> {vehicle.vin}</p>
                        {vehicle.inop && <p className="text-red-600 font-bold">⚠️ INOPERABLE</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {commodityType === 'reefer' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">❄️ Refrigerated Cargo</h3>
                <div className="text-sm space-y-2">
                  {load.reeferTemp && <p><span className="font-medium">Temperature:</span> {load.reeferTemp}°F</p>}
                  {load.reeferTempRange && <p><span className="font-medium">Range:</span> {load.reeferTempRange}</p>}
                  {load.reeferInstructions && <p><span className="font-medium">Instructions:</span> {load.reeferInstructions}</p>}
                </div>
              </div>
            )}

            {commodityType === 'flatbed' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">🏗️ Flatbed Cargo</h3>
                <div className="text-sm space-y-2">
                  {load.weight && <p><span className="font-medium">Weight:</span> {load.weight} lbs</p>}
                  {load.dimensions && <p><span className="font-medium">Dimensions:</span> {load.dimensions}</p>}
                  {load.tarpingRequired && <p><span className="font-medium">Tarping:</span> {load.tarpingRequired}</p>}
                  {load.securementType && <p><span className="font-medium">Securement:</span> {load.securementType}</p>}
                </div>
              </div>
            )}

            {commodityType === 'tanker' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">🛢️ Tanker Cargo</h3>
                <div className="text-sm space-y-2">
                  {load.productType && <p><span className="font-medium">Product:</span> {load.productType.replace('_', ' ')}</p>}
                  {load.hazmatRequired === 'yes' && <p className="text-red-600 font-bold">⚠️ HAZMAT CERTIFICATION REQUIRED</p>}
                  {load.tankWashRequired && <p><span className="font-medium">Tank Wash:</span> {load.tankWashRequired}</p>}
                </div>
              </div>
            )}

            {commodityType === 'dry_van' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">📦 Dry Van Cargo</h3>
                <div className="text-sm space-y-2">
                  {load.cargoWeight && <p><span className="font-medium">Weight:</span> {load.cargoWeight} lbs</p>}
                  {load.palletCount && <p><span className="font-medium">Pallets:</span> {load.palletCount}</p>}
                  {load.trailerType && <p><span className="font-medium">Trailer:</span> {load.trailerType.replace('_', ' ')}</p>}
                  {load.loadingEquipment && <p><span className="font-medium">Loading:</span> {load.loadingEquipment.replace('_', ' ')}</p>}
                  {load.cargoType && <p><span className="font-medium">Cargo Type:</span> {load.cargoType.replace('_', ' ')}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Signatures Section - NO DATES, NO PHOTOS */}
        {(load.pickupSignatureUrl || load.deliverySignatureUrl) && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">✍️ Digital Signatures</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {load.pickupSignatureUrl && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Pickup Signature</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <img 
                      src={load.pickupSignatureUrl} 
                      alt="Pickup Signature"
                      className="w-full h-32 object-contain bg-white border-b"
                      loading="eager"
                    />
                    <div className="p-3 bg-gray-50">
                      <p className="text-sm"><span className="font-medium">Signed by:</span> {load.pickupSignatureMetadata?.signerName || 'N/A'}</p>
                      {load.pickupSignatureMetadata?.location && (
                        <LocationDisplay lat={load.pickupSignatureMetadata.location.latitude} lng={load.pickupSignatureMetadata.location.longitude} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {load.deliverySignatureUrl && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Delivery Signature</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <img 
                      src={load.deliverySignatureUrl} 
                      alt="Delivery Signature"
                      className="w-full h-32 object-contain bg-white border-b"
                      loading="eager"
                    />
                    <div className="p-3 bg-gray-50">
                      <p className="text-sm"><span className="font-medium">Signed by:</span> {load.deliverySignatureMetadata?.signerName || 'N/A'}</p>
                      {load.deliverySignatureMetadata?.location && (
                        <LocationDisplay lat={load.deliverySignatureMetadata.location.latitude} lng={load.deliverySignatureMetadata.location.longitude} />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin Notes */}
        {load.adminNotes && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">📝 Special Notes</h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{load.adminNotes}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 bg-gray-50 text-center text-sm text-gray-600">
          <p>Bill of Lading for Load #{load.load_id}</p>
          <p className="mt-2">For questions about this shipment, please contact your dispatcher.</p>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              🔒 This BOL contains confidential information. Unauthorized access is prohibited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverBOLPage;