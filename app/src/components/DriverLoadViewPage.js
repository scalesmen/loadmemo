// src/pages/DriverLoadViewPage.js (or src/components/DriverLoadViewPage.js)
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { db, storage } from '../firebase'; // Adjust path if needed
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, Timestamp, addDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, uploadString } from "firebase/storage";
import { v4 as uuidv4 } from 'uuid';
import SignatureCanvas from 'react-signature-canvas';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';
// Add this line with your other imports at the top
import { useUploadQueue, EnhancedFileUpload } from '../components/EnhancedUploadSystem';
import GatePassDocuments from '../components/GatePassDocuments';

// Notification Component
const NotificationContainer = ({ notifications, onDismiss }) => (
  <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
    {notifications.map(notification => (
      <div
        key={notification.id}
        className={`transform transition-all duration-300 ease-in-out p-4 rounded-lg shadow-lg border-l-4 ${
          notification.type === 'error' 
            ? 'bg-red-50 border-red-500 text-red-800' 
            : notification.type === 'warning' 
            ? 'bg-yellow-50 border-yellow-500 text-yellow-800'
            : notification.type === 'success' 
            ? 'bg-green-50 border-green-500 text-green-800'
            : 'bg-blue-50 border-blue-500 text-blue-800'
        }`}
        style={{
          animation: 'slideInRight 0.3s ease-out'
        }}
      >
        <div className="flex justify-between items-start">
          <div className="flex">
            <div className="flex-shrink-0 mr-3">
              {notification.type === 'error' && '❌'}
              {notification.type === 'warning' && '⚠️'}
              {notification.type === 'success' && '✅'}
              {notification.type === 'info' && 'ℹ️'}
            </div>
            <div>
              <p className="text-sm font-medium">{notification.message}</p>
              {notification.details && (
                <p className="text-xs mt-1 opacity-75">{notification.details}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => onDismiss(notification.id)}
            className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
      </div>
    ))}
  </div>
);

// Notification Hook
const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  
  const showNotification = useCallback((message, type = 'info', details = '', duration = 5000) => {
    const id = Date.now() + Math.random();
    const notification = { id, message, type, details };
    
    setNotifications(prev => [...prev.slice(-2), notification]); // Keep max 3 notifications
    
    // Auto-dismiss after duration
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return { notifications, showNotification, dismissNotification };
};

// CSS for animations (add to your style tag at the bottom)
const notificationStyles = `
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}
`;

// Error Boundary Component
class DriverPageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('DriverLoadViewPage crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Oops! Something went wrong</h2>
              <p className="text-gray-600 mb-4">
                We're sorry, but there was an error loading your driver portal.
              </p>
              <button 
                onClick={() => window.location.reload()} 
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                🔄 Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Enhanced Tenant Validation Function
const validateAndExtractTenant = (driverData) => {
  console.log("🔍 Starting tenant validation for driver data:", driverData);
  
  if (!driverData) {
    throw new Error('Driver data is required for tenant validation');
  }

  // Check tenantId first
  if (driverData.tenantId?.trim() && driverData.tenantId.trim().length >= 3) {
    console.log("✅ Valid tenantId found:", driverData.tenantId);
    return driverData.tenantId.trim();
  }

  // Check assignedCompanyId second
  if (driverData.assignedCompanyId?.trim() && driverData.assignedCompanyId.trim().length >= 3) {
    console.log("✅ Valid assignedCompanyId found:", driverData.assignedCompanyId);
    return driverData.assignedCompanyId.trim();
  }

  // Check assignedCompanyName third
  if (driverData.assignedCompanyName?.trim() && driverData.assignedCompanyName.trim().length >= 2) {
    const tenantFromName = `tenant_${driverData.assignedCompanyName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    console.log("✅ Generated tenant from company name:", tenantFromName);
    return tenantFromName;
  }
  
  console.error("❌ No valid tenant information found");
  throw new Error('No valid tenant information found. Driver profile may be incomplete.');
};

const ACTIVE_STATUSES = ['Booked', 'Dispatched', 'At Shipper', 'In Transit', 'At Receiver'];

// Helper function for audit logging with tenant support
async function logAudit({ userId, userEmail, action, targetType, targetId, details, tenantId }) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      userId, userEmail, action, targetType, targetId, details,
      tenantId, // Add tenant tracking
      timestamp: serverTimestamp()
    });
  } catch (e) { console.error("Audit log error:", e); }
}

// Simple date formatter
const formatDriverTimestamp = (timestamp) => {
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    }
    if (timestamp instanceof Date) {
        return timestamp.toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return 'N/A';
};

// Helper function to extract city, state, zip from full address
const extractCityStateZip = (fullAddress) => {
  if (!fullAddress) return '';
  
  const parts = fullAddress.split(',').map(part => part.trim());
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1];
    const city = parts[parts.length - 2];
    return `${city}, ${stateZip}`;
  } else if (parts.length === 2) {
    return parts[1];
  }
  return fullAddress;
};
// 🔔 ADD THE NOTIFICATION FUNCTION HERE (after line 82)
const createDriverNotification = async (load, driverName, statusChange, tenantId) => {
  try {
    // Send notification to dispatcher assigned to this load
    if (load.dispatcherId) {
      await addDoc(collection(db, "notifications"), {
        userId: load.dispatcherId, // Dispatcher receives the notification
        tenantId: tenantId,
        type: "driver_activity",
        message: `Driver ${driverName} marked load ${load.load_id} as ${statusChange}`,
        loadId: load.load_id,
        loadDocId: load.id,
        driverName: driverName,
        read: false,
        createdAt: serverTimestamp()
      });
      console.log("✅ Notification sent to dispatcher:", load.dispatcherId);
    }
  } catch (error) {
    console.error("❌ Error creating driver notification:", error);
  }
};

// Helper function to format date without time
const formatDateOnly = (timestamp) => {
  if (!timestamp) return 'N/A';
  let dateToFormat;
  if (timestamp instanceof Timestamp) {
    dateToFormat = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    dateToFormat = timestamp;
  } else {
    return String(timestamp);
  }
  return dateToFormat.toLocaleDateString();
};

// Add commodity type detection function
const detectCommodityType = (load) => {
  // Check if load has vehicle information
  if (load.vehicles && load.vehicles.length > 0) {
    return 'automobile_hauling';
  }
  
  // Check for reefer indicators
  if (load.reeferTemp || load.reeferTempRange || load.reeferInstructions) {
    return 'reefer';
  }
  
  // Check for flatbed indicators
  if (load.weight || load.dimensions || load.tarpingRequired || load.securementType) {
    return 'flatbed';
  }
  
  // Check for tanker indicators
  if (load.productType || load.hazmatRequired || load.tankWashRequired) {
    return 'tanker';
  }
  
  // Check for dry van indicators
  if (load.cargoWeight || load.palletCount || load.trailerType || load.loadingEquipment || load.cargoType) {
    return 'dry_van';
  }
  
  // Default to general freight
  return 'general';
};

// Component to display commodity-specific information
const CommodityDetails = ({ load }) => {
  const commodityType = detectCommodityType(load);
  
  if (commodityType === 'automobile_hauling' && load.vehicles && load.vehicles.length > 0) {
    return (
      <div className="mt-3 p-3 bg-blue-50 rounded-md border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-2">🚗 Vehicle Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {load.vehicles.map((vehicle, idx) => (
            <div key={idx} className="bg-white p-2 rounded border">
              <p className="text-sm font-medium text-blue-700">Vehicle #{idx + 1}</p>
              <p className="text-xs"><strong>Make/Model:</strong> {vehicle.make} {vehicle.model}</p>
              <p className="text-xs"><strong>Year:</strong> {vehicle.year}</p>
              <p className="text-xs"><strong>VIN:</strong> {vehicle.vin}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-blue-600 mt-2">
          <strong>Total Vehicles:</strong> {load.vehicleCount || load.vehicles.length}
        </p>
        {load.mileage && load.amount && Number(load.mileage) > 0 && (load.vehicleCount || load.vehicles.length) > 0 && (
          <p className="text-xs text-purple-700 font-semibold mt-1">
            Per Vehicle Per Mile: ${(Number(load.amount) / (load.vehicleCount || load.vehicles.length) / Number(load.mileage)).toFixed(2)}
          </p>
        )}
      </div>
    );
  }
  
  if (commodityType === 'reefer') {
    return (
      <div className="mt-3 p-3 bg-cyan-50 rounded-md border border-cyan-200">
        <h4 className="font-semibold text-cyan-800 mb-2">❄️ Reefer Information</h4>
        {load.reeferTemp && <p className="text-xs"><strong>Temperature:</strong> {load.reeferTemp}°F</p>}
        {load.reeferTempRange && <p className="text-xs"><strong>Range:</strong> {load.reeferTempRange}</p>}
        {load.reeferInstructions && <p className="text-xs"><strong>Instructions:</strong> {load.reeferInstructions}</p>}
      </div>
    );
  }
  
  if (commodityType === 'flatbed') {
    return (
      <div className="mt-3 p-3 bg-orange-50 rounded-md border border-orange-200">
        <h4 className="font-semibold text-orange-800 mb-2">🏗️ Flatbed Information</h4>
        {load.weight && <p className="text-xs"><strong>Weight:</strong> {load.weight} lbs</p>}
        {load.dimensions && <p className="text-xs"><strong>Dimensions:</strong> {load.dimensions}</p>}
        {load.tarpingRequired && <p className="text-xs"><strong>Tarping:</strong> {load.tarpingRequired}</p>}
        {load.securementType && <p className="text-xs"><strong>Securement:</strong> {load.securementType}</p>}
      </div>
    );
  }
  
  if (commodityType === 'tanker') {
    return (
      <div className="mt-3 p-3 bg-purple-50 rounded-md border border-purple-200">
        <h4 className="font-semibold text-purple-800 mb-2">🛢️ Tanker Information</h4>
        {load.productType && <p className="text-xs"><strong>Product:</strong> {load.productType.replace('_', ' ')}</p>}
        {load.hazmatRequired === 'yes' && <p className="text-xs text-red-600"><strong>⚠️ HAZMAT Required</strong></p>}
        {load.tankWashRequired && <p className="text-xs"><strong>Tank Wash:</strong> {load.tankWashRequired}</p>}
      </div>
    );
  }
  
  if (commodityType === 'dry_van') {
    return (
      <div className="mt-3 p-3 bg-green-50 rounded-md border border-green-200">
        <h4 className="font-semibold text-green-800 mb-2">📦 Dry Van Information</h4>
        {load.cargoWeight && <p className="text-xs"><strong>Cargo Weight:</strong> {load.cargoWeight} lbs</p>}
        {load.palletCount && <p className="text-xs"><strong>Pallets:</strong> {load.palletCount}</p>}
        {load.trailerType && <p className="text-xs"><strong>Trailer Type:</strong> {load.trailerType.replace('_', ' ')}</p>}
        {load.loadingEquipment && <p className="text-xs"><strong>Loading:</strong> {load.loadingEquipment.replace('_', ' ')}</p>}
        {load.cargoType && <p className="text-xs"><strong>Cargo Type:</strong> {load.cargoType.replace('_', ' ')}</p>}
      </div>
    );
  }
  
  return null; // No special commodity info to display
};

// Enhanced Route Display Component for Auto Hauling
const RouteDisplay = ({ load }) => {
  const commodityType = detectCommodityType(load);
  
  if (commodityType === 'automobile_hauling') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <div>
          <h3 className="font-semibold text-gray-700">Pickup Information:</h3>
          <p><span className="font-medium">Dealer:</span> {load.pickupLocationName || 'Pickup Location'}</p>
          <p><span className="font-medium">City/State:</span> {extractCityStateZip(load.pickupLocation)}</p>
          <p><span className="font-medium">Date:</span> {formatDateOnly(load.pickupDateTime)}</p>
          <p>
            <span className="font-medium">Full Address:</span>{' '}
            {load.pickupLocation ? (
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(load.pickupLocation)}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
              >
                {load.pickupLocation}
              </a>
            ) : 'N/A'}
          </p>
          <p className="mt-1"><span className="font-medium">Instructions:</span> <span className="text-gray-600 whitespace-pre-wrap">{load.pickupInstructions || 'N/A'}</span></p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-700">Delivery Information:</h3>
          <p><span className="font-medium">Dealer:</span> {load.deliveryLocationName || 'Delivery Location'}</p>
          <p><span className="font-medium">City/State:</span> {extractCityStateZip(load.deliveryLocation)}</p>
          <p><span className="font-medium">Date:</span> {formatDateOnly(load.deliveryDateTime)}</p>
          <p>
            <span className="font-medium">Full Address:</span>{' '}
            {load.deliveryLocation ? (
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(load.deliveryLocation)}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
              >
                {load.deliveryLocation}
              </a>
            ) : 'N/A'}
          </p>
          <p className="mt-1"><span className="font-medium">Instructions:</span> <span className="text-gray-600 whitespace-pre-wrap">{load.deliveryInstructions || 'N/A'}</span></p>
        </div>
      </div>
    );
  }
  
  // Default route display for other commodity types
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
      <div>
        <h3 className="font-semibold text-gray-700">Pickup Information:</h3>
        <p><span className="font-medium">Facility:</span> {load.pickupLocationName || 'N/A'}</p>
        <p>
          <span className="font-medium">Address:</span>{' '}
          {load.pickupLocation ? (
            <a 
              href={`https://maps.google.com/?q=${encodeURIComponent(load.pickupLocation)}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {load.pickupLocation}
            </a>
          ) : 'N/A'}
        </p>
<p><span className="font-medium">Scheduled:</span> {formatDateOnly(load.pickupDateTime) || 'N/A'}</p>
        <p className="mt-1"><span className="font-medium">Instructions:</span> <span className="text-gray-600 whitespace-pre-wrap">{load.pickupInstructions || 'N/A'}</span></p>
      </div>
      <div>
        <h3 className="font-semibold text-gray-700">Delivery Information:</h3>
        <p><span className="font-medium">Facility:</span> {load.deliveryLocationName || 'N/A'}</p>
        <p>
          <span className="font-medium">Address:</span>{' '}
          {load.deliveryLocation ? (
            <a 
              href={`https://maps.google.com/?q=${encodeURIComponent(load.deliveryLocation)}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {load.deliveryLocation}
            </a>
          ) : 'N/A'}
        </p>
<p><span className="font-medium">Scheduled:</span> {formatDateOnly(load.deliveryDateTime) || 'N/A'}</p>
        <p className="mt-1"><span className="font-medium">Instructions:</span> <span className="text-gray-600 whitespace-pre-wrap">{load.deliveryInstructions || 'N/A'}</span></p>
      </div>
    </div>
  );
};

function DriverLoadViewPageInternal() {
  const { driverId } = useParams();
  const [driver, setDriver] = useState(null);
  const [assignedLoads, setAssignedLoads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedLoadId, setExpandedLoadId] = useState(null);
  const [tenantId, setTenantId] = useState(null); // Add tenant state
  const { notifications, showNotification, dismissNotification } = useNotifications();

  const CameraCapture = ({ loadId, type, onPhotoTaken, onClose }) => {
    // ... camera component code ...
  };
  
  
  const [showDeliveredFilter, setShowDeliveredFilter] = useState(false);

  const [capturingSignatureFor, setCapturingSignatureFor] = useState(null);
  const [signerName, setSignerName] = useState("");
  const sigPadRefs = useRef({}); 
  const [expandedDeliveredDocs, setExpandedDeliveredDocs] = useState({});
  const [deliveredFilter, setDeliveredFilter] = useState({
    start: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().slice(0, 10);
    })(),
    end: (() => {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d.toISOString().slice(0, 10);
    })(),
    showAll: false
  });

  // Define helper functions before they are used in other functions or useEffects
  const getGeoLocation = async () => {
    if (!navigator.geolocation) {
        console.warn("Geolocation is not supported by this browser.");
        return null;
    }
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true });
        });
        return {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp, 
        };
    } catch (geoError) {
        console.warn("Geolocation error or permission denied:", geoError.message);
        return null;
    }
  };

  // UPDATED: handleFileUpload with tenant-aware storage paths
 

  // UPDATED: handleSaveSignature with tenant-aware storage paths
  const handleSaveSignature = async () => {
    console.log("--- handleSaveSignature START ---");
    console.log("Current state: capturingSignatureFor:", capturingSignatureFor, "signerName:", signerName);
    
    if (!capturingSignatureFor) {
        console.warn("handleSaveSignature: No signature capture in progress. Exiting.");
        return;
    }

    if (!tenantId) {
      console.error("Tenant ID not available for signature upload");
showNotification("Unable to save signature - tenant information missing", "error");
      return;
    }

    const { loadId, type } = capturingSignatureFor;
    const sigPadKey = `${loadId}_${type}`;
    const sigPad = sigPadRefs.current[sigPadKey];

    console.log("handleSaveSignature: sigPad object (from react-signature-canvas):", sigPad); 
    if (!sigPad) {
        console.error("handleSaveSignature: Signature pad ref not found for key:", sigPadKey);
showNotification("Signature pad error. Please refresh and try again", "error");
        return;
    }

    if (typeof sigPad.isEmpty !== 'function' || typeof sigPad.getTrimmedCanvas !== 'function') {
        console.error("handleSaveSignature: SignatureCanvas methods (isEmpty, getTrimmedCanvas) not found. Instance:", sigPad);
showNotification("Signature pad is not correctly initialized. Please try again", "error");
        return;
    }

    if (sigPad.isEmpty()) {
showNotification("Please provide a signature first", "warning");
      return;
    }
    if (!signerName.trim()) {
showNotification("Please enter the signer's name", "warning");
      return;
    }

    let signatureDataUrl;
    try {
        const canvas = sigPad.getTrimmedCanvas();
        if (typeof canvas.toDataURL !== 'function') {
            console.error("handleSaveSignature: canvas.toDataURL is not a function. canvas:", canvas);
showNotification("Could not get signature image data. Please try again", "error");
            return;
        }
        signatureDataUrl = canvas.toDataURL('image/png');
        console.log("handleSaveSignature: Signature data URL obtained (length):", signatureDataUrl.length);
    } catch (e) {
        console.error("handleSaveSignature: Error getting data URL from signature pad:", e);
showNotification("Could not get signature image. Please try again", "error");
        return;
    }
    
    const signatureFileName = `${type}_signature_${uuidv4()}.png`;
    // UPDATED: Use tenant-aware storage path
    const storagePath = `load_signatures/${tenantId}/${loadId}/${signatureFileName}`;
    
    const progressKey = `${loadId}_${type}_signature`;
    console.log("handleSaveSignature: Preparing to upload signature to:", storagePath);

    try {
      if (typeof storage !== 'object' || storage === null) {
        console.error("handleSaveSignature: Firebase 'storage' object is invalid or not initialized at point of use.");
        throw new Error("Storage service is not available.");
      }
      if (typeof ref !== 'function') {
        console.error("handleSaveSignature: Firebase Storage 'ref' function is invalid at point of use.");
        throw new Error("Storage 'ref' function is not available.");
      }
      const storageRefVal = ref(storage, storagePath);
      console.log("handleSaveSignature: Storage ref for signature created:", storageRefVal);

      if (typeof uploadString !== 'function') {
        console.error("handleSaveSignature: Firebase Storage 'uploadString' function is invalid.");
        throw new Error("Storage 'uploadString' function is not available.");
      }
      await uploadString(storageRefVal, signatureDataUrl, 'data_url');
      console.log("handleSaveSignature: Signature uploaded to storage.");

      if (typeof getDownloadURL !== 'function') {
        console.error("handleSaveSignature: Firebase Storage 'getDownloadURL' function is invalid.");
        throw new Error("Storage 'getDownloadURL' function is not available.");
      }
      const downloadURL = await getDownloadURL(storageRefVal);
      console.log("handleSaveSignature: Signature download URL:", downloadURL);

      const captureTimestamp = Timestamp.now(); 
      const locationData = await getGeoLocation(); 
      console.log("handleSaveSignature: Location data:", locationData);

      const signatureMetadata = {
        url: downloadURL,
        signerName: signerName.trim(), 
        capturedAt: captureTimestamp, 
        clientTimestamp: new Date().toISOString(),
        tenantId, // Add tenant tracking
        ...(locationData && { location: locationData }) 
      };
      console.log("handleSaveSignature: Signature metadata to save:", signatureMetadata);
      
      const signatureUrlField = type === 'pickup' ? 'pickupSignatureUrl' : 'deliverySignatureUrl';
      const signatureMetaField = type === 'pickup' ? 'pickupSignatureMetadata' : 'deliverySignatureMetadata';
      
      if (typeof doc !== 'function' || typeof db !== 'object' || db === null) {
        console.error("handleSaveSignature: Firebase Firestore 'doc' function or 'db' object is invalid.");
        throw new Error("Database service is not available.");
      }
      const loadDocRef = doc(db, "loads", loadId); 
      console.log("handleSaveSignature: Updating Firestore for load:", loadId, "with fields:", signatureUrlField, signatureMetaField);

      if (typeof updateDoc !== 'function' || typeof serverTimestamp !== 'function') {
        console.error("handleSaveSignature: Firebase Firestore 'updateDoc' or 'serverTimestamp' function is invalid.");
        throw new Error("Database service function is not available.");
      }
      await updateDoc(loadDocRef, {
        [signatureUrlField]: downloadURL,
        [signatureMetaField]: signatureMetadata,
        updatedAt: serverTimestamp()
      });
      console.log("handleSaveSignature: Firestore updated successfully for signature.");

      setCapturingSignatureFor(null); 
      setSignerName(""); 
      if (typeof sigPad.clear === 'function') {
        sigPad.clear(); 
      } else {
        console.warn("handleSaveSignature: sigPad.clear() is not a function. sigPad:", sigPad);
      }

      await logAudit({
        userId: driver?.id || 'driver_portal_action', userEmail: driver?.email || 'N/A',
        action: `capture_${type}_signature`, targetType: "load", targetId: loadId,
        details: { signerName: signerName.trim(), signatureUrl: downloadURL, location: locationData || "Not available" },
        tenantId // Add tenant to audit log
      });

    } catch (error) {
      console.error(`handleSaveSignature: Error saving ${type} signature:`, error);
showNotification(`Failed to save signature: ${error.message}`, "error");
    }
    console.log("--- handleSaveSignature END ---");
  };

  // UPDATED: useEffect to fetch driver and determine tenant
  useEffect(() => {
  console.log("🚀 Starting driver data fetch for ID:", driverId);
  
  if (!driverId) {
    setError("Driver ID not provided in URL.");
    setIsLoading(false);
    return;
  }

  // Reset all state
  setDriver(null);
  setAssignedLoads([]);
  setError(null);
  setCapturingSignatureFor(null); 
  setSignerName(""); 
  setTenantId(null);
  setIsLoading(true);

  let unsubDriver, unsubLoads;

  try {
    const driverDocRef = doc(db, "drivers", driverId);
    
    unsubDriver = onSnapshot(driverDocRef, 
      (docSnap) => {
        console.log("📄 Driver document exists:", docSnap.exists());
        
        try {
          if (docSnap.exists()) {
            const driverData = { id: docSnap.id, ...docSnap.data() };
            console.log("👤 Driver data retrieved:", driverData);
            
            setDriver(driverData);
            
            // NEW: Enhanced tenant validation using our new function
            try {
              const extractedTenantId = validateAndExtractTenant(driverData);
              setTenantId(extractedTenantId);
              console.log("🏢 Tenant ID successfully set:", extractedTenantId);
            } catch (tenantError) {
              console.error("🚨 Tenant validation failed:", tenantError);
              setError(`Driver profile incomplete: ${tenantError.message}`);
              setTenantId(null);
              setIsLoading(false);
              return; // Stop here if tenant validation fails
            }
          } else {
            console.error("❌ Driver document does not exist");
            setError("Driver profile not found. This link may be invalid or the driver profile has been removed.");
            setDriver(null);
            setTenantId(null);
            setIsLoading(false);
          }
        } catch (processingError) {
          console.error("🚨 Error processing driver document:", processingError);
          setError(`Failed to process driver information: ${processingError.message}`);
          setIsLoading(false);
        }
      }, 
      (err) => {
        console.error("🚨 Firestore driver listener error:", err);
        setError(`Failed to load driver details: ${err.code || err.message}`);
        setDriver(null);
        setTenantId(null);
        setIsLoading(false);
      }
    );

    // Keep your existing loads query exactly the same
    const loadsQuery = query(
      collection(db, "loads"),
      where("driverId", "==", driverId),
      where("status", "not-in", ["Cancelled"])
    );

    unsubLoads = onSnapshot(loadsQuery, 
      (snapshot) => {
        console.log("📦 Loads snapshot received, count:", snapshot.docs.length);
        
        try {
          const allLoads = snapshot.docs.map(docData => ({ 
            id: docData.id, 
            ...docData.data() 
          }));
          
          // Filter out loads with missing critical data
          const validLoads = allLoads.filter(load => {
            if (!load.id || !load.load_id || !load.status) {
              console.warn("⚠️ Skipping invalid load:", load);
              return false;
            }
            return true;
          });
          
          console.log(`📦 Valid loads processed: ${validLoads.length}/${allLoads.length}`);
          setAssignedLoads(validLoads);
          setIsLoading(false);
          
        } catch (processingError) {
          console.error("🚨 Error processing loads:", processingError);
          setError(`Failed to process load data: ${processingError.message}`);
          setIsLoading(false);
        }
      }, 
      (err) => {
        console.error("🚨 Firestore loads listener error:", err);
        setError(`Failed to fetch assigned loads: ${err.code || err.message}`);
        setIsLoading(false);
      }
    );

  } catch (initError) {
    console.error("🚨 Error initializing data listeners:", initError);
    setError(`Failed to initialize driver portal: ${initError.message}`);
    setIsLoading(false);
  }

  // Cleanup function
  return () => {
    console.log("🧹 Cleaning up driver data listeners");
    if (unsubDriver) unsubDriver();
    if (unsubLoads) unsubLoads();
  };
}, [driverId]);
  const unfinishedLoads = assignedLoads.filter(load => ACTIVE_STATUSES.includes(load.status));
  const deliveredLoadsAll = assignedLoads
    .filter(load => load.status === "Delivered")
    .sort((a, b) => {
      const da = a.deliveryDateTime?.toDate?.() || new Date(0);
      const db = b.deliveryDateTime?.toDate?.() || new Date(0);
      return db - da; 
    });

  let deliveredLoads = deliveredLoadsAll;
  if (!deliveredFilter.showAll) {
    const start = new Date(deliveredFilter.start);
    start.setHours(0,0,0,0); 
    const end = new Date(deliveredFilter.end);
    end.setHours(23, 59, 59, 999); 
    deliveredLoads = deliveredLoadsAll.filter(load => {
      const d = load.actualDEL?.toDate?.() || load.deliveryDateTime?.toDate?.() || new Date(0); 
      return d >= start && d <= end;
    });
  }

  

  const openSignaturePad = (loadId, type) => {
    setSignerName(""); 
    setCapturingSignatureFor({ loadId, type });
  };

  const clearSignature = () => {
    if (!capturingSignatureFor) return;
    const { loadId, type } = capturingSignatureFor;
    const sigPadKey = `${loadId}_${type}`;
    const sigPadInstance = sigPadRefs.current[sigPadKey];
    if (sigPadInstance && typeof sigPadInstance.clear === 'function') {
        sigPadInstance.clear();
    } else {
        console.warn("clearSignature: .clear() method not found on sigPadInstance", sigPadInstance);
    }
  };

const reverseGeocode = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    const data = await response.json();
    
    // Format a clean address
    const city = data.city || data.locality || '';
    const state = data.principalSubdivision || '';
    const country = data.countryName || '';
    
    // Return a formatted address
    if (city && state) {
      return `${city}, ${state}`;
    } else if (data.locality) {
      return data.locality;
    } else {
      return `${lat.toFixed(3)}, ${lng.toFixed(3)}`; // Fallback to coordinates
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`; // Fallback to coordinates
  }
};

const LocationDisplay = ({ lat, lng }) => {
  const [address, setAddress] = useState(`${lat.toFixed(3)}, ${lng.toFixed(3)}`);
  
  useEffect(() => {
    reverseGeocode(lat, lng).then(setAddress);
  }, [lat, lng]);
  
  return <p className="text-xs text-gray-500">Loc: {address}</p>;
};

const LocationSpan = ({ lat, lng }) => {
  const [address, setAddress] = useState(`${lat.toFixed(3)}, ${lng.toFixed(3)}`);
  useEffect(() => {
    reverseGeocode(lat, lng).then(setAddress);
  }, [lat, lng]);
  return <span className="text-gray-400 text-xxs"> (Loc: {address})</span>;
};

  // UPDATED: handleMarkAsPickedUp with tenant-aware audit logging
  // REPLACE this entire function:
const handleMarkAsPickedUp = async (loadId) => {
  if (!driver) return;
  const loadDocRef = doc(db, "loads", loadId);
  const currentLoad = assignedLoads.find(l => l.id === loadId); 
  if (!currentLoad || !currentLoad.pickupSignatureUrl) { 
showNotification("Please capture the shipper signature before marking as picked up", "warning");
    return;
  }
  try {
    await updateDoc(loadDocRef, {
      status: "In Transit", 
      actualPU: serverTimestamp(), 
      updatedAt: serverTimestamp()
    });
    
    // 🔔 ADD NOTIFICATION HERE
    await createDriverNotification(
      currentLoad, 
      driver.name || driver.email || "Driver", 
      "picked up", 
      tenantId
    );
    
    await logAudit({
      userId: driver.id, userEmail: driver.email, action: "mark_picked_up",
      targetType: "load", targetId: loadId, details: { newStatus: "In Transit" },
      tenantId
    });
    
showNotification("Load marked as picked up! 🚛", "success");
    
  } catch (err) { 
    console.error("Error marking load as picked up:", err); 
showNotification("Failed to update load status", "error");
  }
};

const calculateWeeklyGross = (deliveredLoads) => {
  // Get current Monday (start of week)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);

  // Get Sunday (end of week)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  // Filter loads delivered this week
  const thisWeekLoads = deliveredLoads.filter(load => {
    const deliveryDate = load.actualDEL?.toDate?.() || load.deliveryDateTime?.toDate?.() || new Date(0);
    return deliveryDate >= monday && deliveryDate <= sunday;
  });
  
  // Calculate total amount
  const totalAmount = thisWeekLoads.reduce((sum, load) => {
    return sum + (Number(load.amount) || 0);
  }, 0);
  
  return {
    totalAmount,
    loadCount: thisWeekLoads.length,
    weekStart: monday,
    weekEnd: sunday
  };
};

// UPDATED: generateBOL function with tenant-aware company fetching
const generateBOL = async (load) => {
  // Get company info for this driver - fetch from companies collection with tenant awareness
  let companyInfo = {
    name: 'Company Name Not Available',
    address: 'Company Address Not Available', 
    phone: 'Phone Not Available',
    email: 'Email Not Available',
    usdot: 'USDOT Not Available',
    mcNumber: 'MC Not Available',
    taxId: 'Tax ID Not Available'
  };

  // Try to get company info from driver's assigned company with tenant filtering
  if (driver?.assignedCompanyName && tenantId) {
    try {
      // UPDATED: Add tenant-aware company query
      const companiesQuery = query(
        collection(db, "companies"), 
        where("name", "==", driver.assignedCompanyName),
        where("tenantId", "==", tenantId) // Add tenant filtering
      );
      const companiesSnapshot = await getDocs(companiesQuery);
      
      if (!companiesSnapshot.empty) {
        const companyDoc = companiesSnapshot.docs[0];
        const companyData = companyDoc.data();
        
        companyInfo = {
          name: companyData.name || driver.assignedCompanyName,
          address: companyData.address || 'Address Not Available',
          phone: companyData.phone || 'Phone Not Available',
          email: companyData.email || 'Email Not Available',
          usdot: companyData.usdot || 'USDOT Not Available',
          mcNumber: companyData.mcNumber || 'MC Not Available',
          taxId: companyData.taxId || 'Tax ID Not Available'
        };
      } else {
        companyInfo.name = driver.assignedCompanyName;
      }
    } catch (error) {
      console.error("Error fetching company info for BOL:", error);
      if (driver?.assignedCompanyName) {
        companyInfo.name = driver.assignedCompanyName;
      }
    }
  }

  // Generate online BOL URL with tenant-aware path
  const baseUrl = window.location.origin;
const onlineBOLUrl = `${baseUrl}/online-bol/${load.id}`;
  
  // Generate QR code for the online BOL URL
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

  // Detect commodity type and prepare commodity-specific data
  const commodityType = detectCommodityType(load);
  const pickupPhotoCount = load.pickupPhotosMetadata?.length || 0;
  const deliveryPhotoCount = load.deliveryPhotosMetadata?.length || 0;

  // Helper function to get location string
  const getLocationString = (locationData) => {
    if (!locationData) return 'Location not recorded';
    return `${locationData.latitude.toFixed(6)}, ${locationData.longitude.toFixed(6)}`;
  };

  // Helper function to shorten URL for display
  const shortenUrl = (url) => {
    if (!url) return 'No URL';
    const parts = url.split('/');
    const fileName = parts[parts.length - 1];
    const fileNamePart = fileName.split('?')[0];
    return fileNamePart.substring(0, 50) + (fileNamePart.length > 50 ? '...' : '');
  };

  // Commodity-specific information component
  const CommoditySection = () => {
    if (commodityType === 'automobile_hauling' && load.vehicles && load.vehicles.length > 0) {
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

    if (commodityType === 'reefer') {
      return (
        <View style={styles.commoditySection}>
          <Text style={styles.commodityTitle}>❄️ REFRIGERATED CARGO DETAILS</Text>
          {load.reeferTemp && <Text style={styles.bodyText}>Required Temperature: {load.reeferTemp}°F</Text>}
          {load.reeferTempRange && <Text style={styles.bodyText}>Temperature Range: {load.reeferTempRange}</Text>}
          {load.reeferInstructions && <Text style={styles.bodyText}>Special Instructions: {load.reeferInstructions}</Text>}
        </View>
      );
    }

    if (commodityType === 'flatbed') {
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

    if (commodityType === 'tanker') {
      return (
        <View style={styles.commoditySection}>
          <Text style={styles.commodityTitle}>🛢️ TANKER CARGO DETAILS</Text>
          {load.productType && <Text style={styles.bodyText}>Product Type: {load.productType.replace('_', ' ')}</Text>}
          {load.hazmatRequired === 'yes' && <Text style={styles.hazmatText}>⚠️ HAZMAT CERTIFICATION REQUIRED</Text>}
          {load.tankWashRequired && <Text style={styles.bodyText}>Tank Wash Required: {load.tankWashRequired}</Text>}
        </View>
      );
    }

    if (commodityType === 'dry_van') {
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

    return null; // No commodity details to show
  };

  // Enhanced BOL Document Component with Online BOL section
  const BOLDocument = () => (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>BILL OF LADING</Text>
          <Text style={styles.loadId}>Load ID: {load.load_id}</Text>
          <Text style={styles.commodityBadge}>
            {commodityType === 'automobile_hauling' ? 'Vehicle Transport Document' :
             commodityType === 'reefer' ? '❄️ Refrigerated' :
             commodityType === 'flatbed' ? '🏗️ Flatbed' :
             commodityType === 'tanker' ? '🛢️ Tanker' :
             commodityType === 'dry_van' ? '📦 Dry Van' : '📦 General Freight'}
          </Text>
        </View>

        {/* Online BOL Section with QR Code */}
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
              <Image 
                src={qrCodeDataUrl} 
                style={styles.qrCode}
              />
              <Text style={styles.qrCodeLabel}>Scan for Online BOL</Text>
            </View>
          )}
        </View>
        
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

        <View style={styles.locationRow}>
          <View style={styles.leftColumn}>
            <Text style={styles.sectionTitle}>PICKUP INFORMATION</Text>
            <Text style={styles.bodyText}>
              {commodityType === 'automobile_hauling' ? 'Dealer:' : 'Facility:'} {load.pickupLocationName || 'N/A'}
            </Text>
            <Text style={styles.bodyText}>Address: {load.pickupLocation}</Text>
<Text style={styles.bodyText}>Scheduled: {formatDateOnly(load.pickupDateTime)}</Text>
            {load.pickupInstructions && (
              <Text style={styles.bodyText}>Instructions: {load.pickupInstructions}</Text>
            )}
          </View>
          
          <View style={styles.rightColumn}>
            <Text style={styles.sectionTitle}>DELIVERY INFORMATION</Text>
            <Text style={styles.bodyText}>
              {commodityType === 'automobile_hauling' ? 'Dealer:' : 'Facility:'} {load.deliveryLocationName || 'N/A'}
            </Text>
            <Text style={styles.bodyText}>Address: {load.deliveryLocation}</Text>
<Text style={styles.bodyText}>Scheduled: {formatDateOnly(load.deliveryDateTime)}</Text>
            {load.deliveryInstructions && (
              <Text style={styles.bodyText}>Instructions: {load.deliveryInstructions}</Text>
            )}
          </View>
        </View>

        {/* Commodity-specific details */}
        <CommoditySection />

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
<Text style={styles.bodyText}>Date: {formatDateOnly(load.pickupSignatureMetadata?.capturedAt)}</Text>
                <Text style={styles.bodyText}>Location: {getLocationString(load.pickupSignatureMetadata?.location)}</Text>
                <View style={styles.signatureContainer}>
                  <Text style={styles.noImageText}>✓ Pickup signature captured digitally</Text>
                  <Text style={styles.urlText}>File: {shortenUrl(load.pickupSignatureUrl)}</Text>
                  <Text style={styles.noteText}>Access signature via online BOL</Text>
                </View>
              </View>
            )}

            {load.deliverySignatureUrl && (
              <View style={styles.rightColumn}>
                <Text style={styles.sectionTitle}>DELIVERY SIGNATURE</Text>
                <Text style={styles.bodyText}>Signed by: {load.deliverySignatureMetadata?.signerName || 'N/A'}</Text>
<Text style={styles.bodyText}>Date: {formatDateOnly(load.deliverySignatureMetadata?.capturedAt)}</Text>
                <Text style={styles.bodyText}>Location: {getLocationString(load.deliverySignatureMetadata?.location)}</Text>
                <View style={styles.signatureContainer}>
                  <Text style={styles.noImageText}>✓ Delivery signature captured digitally</Text>
                  <Text style={styles.urlText}>File: {shortenUrl(load.deliverySignatureUrl)}</Text>
                  <Text style={styles.noteText}>Access signature via online BOL</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Footer with online access reminder */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            This Bill of Lading was generated on {new Date().toLocaleDateString()}
          </Text>
          <Text style={styles.footerText}>
            📱 For complete digital documentation including photos and signatures, visit: {onlineBOLUrl}
          </Text>
        </View>
      </Page>
    </Document>
  );

  // Generate and download PDF
  try {
    const pdfBlob = await pdf(<BOLDocument />).toBlob();
    
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
showNotification("Failed to generate BOL PDF", "error");
  }
};

// Enhanced styles with new online BOL section styling
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
  // New Online BOL Section Styles
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
  signatureContainer: {
    marginTop: 8,
    alignItems: 'center',
    border: '1pt solid #ddd',
    padding: 6,
    backgroundColor: '#fafafa'
  },
  noImageText: {
    fontSize: 8,
    color: '#0369a1',
    textAlign: 'center',
    fontWeight: 'bold'
  },
  urlText: {
    fontSize: 7,
    color: '#666',
    textAlign: 'center',
    marginTop: 2
  },
  noteText: {
    fontSize: 6,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 2
  },
  // Enhanced Footer
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

  // REPLACE this entire function:
const handleMarkAsDelivered = async (loadId) => {
  if (!driver) return;
  const loadDocRef = doc(db, "loads", loadId);
  const currentLoad = assignedLoads.find(l => l.id === loadId); 
  if (!currentLoad || !currentLoad.deliverySignatureUrl) { 
showNotification("Please capture the receiver signature before marking as delivered", "warning");
    return;
  }
  try {
    await updateDoc(loadDocRef, {
      status: "Delivered", 
      actualDEL: serverTimestamp(), 
      updatedAt: serverTimestamp()
    });
    
    // 🔔 ADD NOTIFICATION HERE
    await createDriverNotification(
      currentLoad, 
      driver.name || driver.email || "Driver", 
      "delivered", 
      tenantId
    );
    
    await logAudit({
      userId: driver.id, userEmail: driver.email, action: "mark_delivered",
      targetType: "load", targetId: loadId, details: { newStatus: "Delivered" },
      tenantId
    });
    
showNotification("Load marked as delivered! 🎉", "success");
    
  } catch (err) { 
    console.error("Error marking load as delivered:", err); 
showNotification("Failed to update load status", "error");
  }
};
  const toggleDeliveredDocs = (loadId) => {
    setExpandedDeliveredDocs(prev => ({
      ...prev,
      [loadId]: !prev[loadId]
    }));
  };

  const handleDeliveredFilter = (e) => {
    setDeliveredFilter(filter => ({
      ...filter,
      [e.target.name]: e.target.value,
      showAll: false
    }));
  };
  const handleShowAllDelivered = () => setDeliveredFilter(f => ({...f, showAll: true}));

  if (isLoading) return <div className="p-6 text-center text-gray-600">Loading driver loads...</div>;
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>;
  if (!driver) return <div className="p-6 text-center text-gray-500">Driver profile not accessible or not found. This link may be invalid or the driver profile has been removed.</div>;

  return (
    <div className="container mx-auto p-4 min-h-screen bg-gray-100">
          <NotificationContainer notifications={notifications} onDismiss={dismissNotification} />
      <header className="mb-8 py-6 bg-white shadow-md rounded-lg">
        <h1 className="text-3xl font-bold text-gray-800 text-center">Driver Portal</h1>
        <p className="text-xl text-gray-600 text-center">Welcome, {driver.name || driver.email}!</p>
        
      </header>
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
  <div className="flex flex-wrap gap-4 items-center justify-between">
    {/* Weekly Gross with dropdown arrow */}
    <div className="flex items-center gap-2">
      <div className="text-right">
        <div className="text-lg font-bold text-green-600">
          Weekly Gross: {calculateWeeklyGross(deliveredLoadsAll).totalAmount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
        </div>
        <div className="text-xs text-gray-500">
          {calculateWeeklyGross(deliveredLoadsAll).loadCount} loads • Mon-Sun this week
        </div>
      </div>
      <button
        onClick={() => setShowDeliveredFilter(!showDeliveredFilter)}
        className="text-gray-600 hover:text-gray-800 p-1"
      >
        <span className={`transform transition-transform duration-200 ${showDeliveredFilter ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
    </div>
    
    <button onClick={handleShowAllDelivered} className="text-blue-600 underline text-xs px-2 py-1 rounded">
      Show All Delivered Loads
    </button>
  </div>
  
  {/* Collapsible date filter section */}
  {showDeliveredFilter && (
    <div className="mt-4 pt-4 border-t flex items-center gap-2">
      <span className="font-medium text-sm">Filter by date:</span>
      <input 
        type="date" 
        name="start" 
        value={deliveredFilter.start} 
        onChange={handleDeliveredFilter} 
        className="border rounded px-2 py-1 text-sm" 
      />
      <span className="text-sm">to</span>
      <input 
        type="date" 
        name="end" 
        value={deliveredFilter.end} 
        onChange={handleDeliveredFilter} 
        className="border rounded px-2 py-1 text-sm" 
      />
    </div>
  )}
</div>
      <div className="space-y-8">
        {/* Unfinished Loads */}
        {unfinishedLoads.length > 0 && <h3 className="text-xl font-semibold text-gray-700 mt-4">Active Loads</h3>}
        {unfinishedLoads.map(load => (
          <div key={load.id} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
              <div>
<div className="flex items-center gap-2">
<div className="flex items-center gap-2">
  <h2 className="mb-1 sm:mb-0 font-semibold text-blue-700 load-id-custom" style={{fontSize:"1.12rem", fontWeight:600}}>Load ID: {load.load_id}</h2>
  {/* Payment collection indicator for automobile hauling */}
  {detectCommodityType(load) === 'automobile_hauling' && ((load.driverCollectionAmount && Number(load.driverCollectionAmount) > 0) || 
    (load.brokerFeeCollection && Number(load.brokerFeeCollection) > 0)) && (
    <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-medium">
      💰 COD
    </span>
  )}
  {/* INOP indicator for automobile hauling */}
  {detectCommodityType(load) === 'automobile_hauling' && load.vehicles && 
    load.vehicles.some(vehicle => vehicle.inop === true) && (
    <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
      ⚠️ INOP
    </span>
  )}
</div> 
</div>                <div className="amount-mileage-custom" style={{fontSize:"1.1rem", fontWeight:700}}>
                  <span>Rate: {(Number(load.amount) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                  {load.mileage && <span> / Miles: {load.mileage}</span>}
                  {Number(load.mileage) > 0 && Number(load.amount) > 0 && (
                    <span className="ml-2 text-blue-900 font-semibold">(${ (Number(load.amount) / Number(load.mileage)).toFixed(2) }/mi)</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
  <span className={`px-3 py-1.5 text-sm font-semibold rounded-full self-start sm:self-center ${
    load.status === 'Booked' ? 'bg-blue-100 text-blue-800' :
    load.status === 'Dispatched' ? 'bg-cyan-100 text-cyan-800' :
    load.status === 'At Shipper' ? 'bg-indigo-100 text-indigo-800' :
    load.status === 'In Transit' ? 'bg-yellow-100 text-yellow-800' :
    load.status === 'At Receiver' ? 'bg-purple-100 text-purple-800' :
    'bg-gray-200 text-gray-800'
  }`}>{load.status}</span>
  <button 
    onClick={() => generateBOL(load)}
    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-1"
  >
    📄 BOL
  </button>
</div>
            </div>
            <button
              onClick={() => setExpandedLoadId(expandedLoadId === load.id ? null : load.id)}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline mb-4 inline-block"
            >
              {expandedLoadId === load.id ? 'Hide Load Details' : 'Show Load Details'}
            </button>
            {expandedLoadId === load.id && (
              <div className="space-y-4 mb-6 text-sm border-t border-b py-4">
  <RouteDisplay load={load} />
  <CommodityDetails load={load} />
      <GatePassDocuments documents={load.gatePassDocuments} loadId={load.id} />

  {/* Payment Collection Details for Auto Hauling */}
    {detectCommodityType(load) === 'automobile_hauling' && ((load.driverCollectionAmount && Number(load.driverCollectionAmount) > 0) || 
      (load.brokerFeeCollection && Number(load.brokerFeeCollection) > 0) ||
      load.collectionInstructions || load.paymentMethod) && (
      <div className="mt-3 p-3 bg-orange-50 rounded-md border border-orange-200">
        {load.driverCollectionAmount && Number(load.driverCollectionAmount) > 0 && (
          <p className="text-sm font-semibold text-orange-800">
            <strong>Driver to get:</strong> {Number(load.driverCollectionAmount).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
          </p>
        )}
        {load.brokerFeeCollection && Number(load.brokerFeeCollection) > 0 && (
          <p className="text-sm font-semibold text-orange-800">
            <strong>Broker Fee:</strong> {Number(load.brokerFeeCollection).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
          </p>
        )}
        {load.paymentMethod && (
          <p className="text-xs text-gray-600 mt-1">
            <strong>Payment Method:</strong> {load.paymentMethod}
          </p>
        )}
        {load.collectionInstructions && (
          <p className="text-xs text-gray-600 mt-1">
            <strong>Collection Instructions:</strong> {load.collectionInstructions}
          </p>
        )}
        
      </div>
    )}
  {load.adminNotes && (
    <div>
      <h3 className="font-semibold text-gray-700 mt-2">Admin Notes for Driver:</h3>
      <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200 whitespace-pre-wrap">{load.adminNotes}</p>
    </div>
  )}
</div>
            )}
            {(load.status === "Dispatched" || load.status === "Booked" || load.status === "At Shipper") && (
  <div className="mt-4 p-4 border rounded-md bg-gray-50">
    <h3 className="text-lg font-semibold text-gray-800 mb-3">Pickup Actions</h3>
    <EnhancedFileUpload
  loadId={load.id}
  type="pickup"
  tenantId={tenantId}
  driver={driver}
  onUploadComplete={(uploadIds) => {
    showNotification(`${uploadIds.length} pickup files queued for upload`, "info");
  }}
/>
    
    {/* Show signature capture button only if no signature exists */}
    {!load.pickupSignatureUrl && !capturingSignatureFor && (
      <button onClick={() => openSignaturePad(load.id, 'pickup')} className="btn-indigo w-full sm:w-auto mb-3">
        📝 Capture Shipper Signature
      </button>
    )}
    
    {/* Show signature capture UI */}
    {capturingSignatureFor?.loadId === load.id && capturingSignatureFor?.type === 'pickup' && (
      <div className="border p-3 rounded-md bg-white shadow my-3">
        <label htmlFor={`signerNamePickup-${load.id}`} className="block text-sm font-medium text-gray-700 mb-1">Shipper's Name:</label>
        <input 
          type="text" 
          id={`signerNamePickup-${load.id}`}
          value={signerName} 
          onChange={(e) => setSignerName(e.target.value)} 
          placeholder="Enter signer's name"
          className="mb-2 p-2 border border-gray-300 rounded-md w-full"
        />
        <p className="text-sm font-medium mb-1">Sign below for Pickup:</p>
        <SignatureCanvas 
          ref={el => sigPadRefs.current[`${load.id}_pickup`] = el} 
          penColor='black' 
          canvasProps={{width: 300, height: 150, className: 'border border-gray-400 rounded-md bg-white'}} 
        />
        <div className="mt-2 space-x-2 flex flex-wrap gap-2">
          <button onClick={clearSignature} className="btn-gray-small">Clear</button>
          <button onClick={handleSaveSignature} className="btn-green-small">Save Signature</button>
          <button onClick={() => setCapturingSignatureFor(null)} className="btn-red-small">Cancel</button>
        </div>
      </div>
    )}
    
    {/* Show "Mark as Picked Up" button ONLY after signature is captured */}
    {load.pickupSignatureUrl && (
      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
        <p className="text-sm text-green-700 mb-2">✅ Shipper signature captured!</p>
        <button 
          onClick={() => handleMarkAsPickedUp(load.id)} 
          className="btn-orange w-full sm:w-auto"
          disabled={load.status === "In Transit" || load.status === "At Receiver" || load.status === "Delivered"}
        >
          🚛 Mark as Picked Up / Departed Shipper
        </button>
      </div>
    )}
  </div>
)}
            {(load.status === "In Transit" || load.status === "At Receiver") && (
  <div className="mt-6 p-4 border rounded-md bg-gray-50">
    <h3 className="text-lg font-semibold text-gray-800 mb-3">Delivery Actions</h3>
     <EnhancedFileUpload
  loadId={load.id}
  type="delivery"
  tenantId={tenantId}
  driver={driver}
  onUploadComplete={(uploadIds) => {
    showNotification(`${uploadIds.length} delivery files queued for upload`, "info");
  }}
/>
    
    {/* Show signature capture button only if no signature exists */}
    {!load.deliverySignatureUrl && !capturingSignatureFor && (
      <button onClick={() => openSignaturePad(load.id, 'delivery')} className="btn-pink w-full sm:w-auto mb-3">
        📝 Capture Receiver Signature (POD)
      </button>
    )}
    
    {/* Show signature capture UI */}
    {capturingSignatureFor?.loadId === load.id && capturingSignatureFor?.type === 'delivery' && (
       <div className="border p-3 rounded-md bg-white shadow my-3">
        <label htmlFor={`signerNameDelivery-${load.id}`} className="block text-sm font-medium text-gray-700 mb-1">Receiver's Name:</label>
        <input 
          type="text" 
          id={`signerNameDelivery-${load.id}`}
          value={signerName} 
          onChange={(e) => setSignerName(e.target.value)} 
          placeholder="Enter signer's name"
          className="mb-2 p-2 border border-gray-300 rounded-md w-full"
        />
        <p className="text-sm font-medium mb-1">Sign below for Delivery:</p>
        <SignatureCanvas 
          ref={el => sigPadRefs.current[`${load.id}_delivery`] = el} 
          penColor='black' 
          canvasProps={{width: 300, height: 150, className: 'border border-gray-400 rounded-md bg-white'}} 
        />
        <div className="mt-2 space-x-2 flex flex-wrap gap-2">
          <button onClick={clearSignature} className="btn-gray-small">Clear</button>
          <button onClick={handleSaveSignature} className="btn-green-small">Save Signature</button>
          <button onClick={() => setCapturingSignatureFor(null)} className="btn-red-small">Cancel</button>
        </div>
      </div>
    )}
    
    {/* Show "Mark as Delivered" button ONLY after signature is captured */}
    {load.deliverySignatureUrl && (
      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
        <p className="text-sm text-green-700 mb-2">✅ Receiver signature captured!</p>
        <button 
          onClick={() => handleMarkAsDelivered(load.id)} 
          className="btn-teal w-full sm:w-auto"
          disabled={load.status === 'Delivered'}
        >
          🎉 Mark as Delivered
        </button>
      </div>
    )}
  </div>
            )}
            {(load.pickupPhotosMetadata?.length > 0 || load.deliveryPhotosMetadata?.length > 0 || load.pickupSignatureUrl || load.deliverySignatureUrl) && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-md font-semibold mb-2">Uploaded Documents & Signatures:</h4>
                {load.pickupPhotosMetadata?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium">Pickup Photos/Docs:</p>
                    <ul className="list-disc list-inside pl-4 text-xs">
                      {load.pickupPhotosMetadata.map((photo, idx) => (
<li key={`pickupPhoto-${idx}`}><a href={photo.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{photo.name} ({formatDateOnly(photo.uploadedAt)}) {photo.location && <LocationSpan lat={photo.location.latitude} lng={photo.location.longitude} />}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
                {load.pickupSignatureUrl && <div className="mb-2"><p className="text-sm font-medium">Pickup Signature:</p><img src={load.pickupSignatureUrl} alt="Pickup Signature" className="max-w-xs border rounded shadow"/> {load.pickupSignatureMetadata && <><p className="text-xs text-gray-500">Signer: {load.pickupSignatureMetadata.signerName}</p><p className="text-xs text-gray-500">At: {formatDateOnly(load.pickupSignatureMetadata.capturedAt)}</p> {load.pickupSignatureMetadata.location && <LocationDisplay 
  lat={load.pickupSignatureMetadata.location.latitude} 
  lng={load.pickupSignatureMetadata.location.longitude} 
/>}</>}</div>}
                {(load.deliveryPhotosMetadata?.length > 0 || load.deliverySignatureUrl) && (
                  <>
                    {load.deliveryPhotosMetadata?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-medium">Delivery Photos/Docs:</p>
                        <ul className="list-disc list-inside pl-4 text-xs">
                          {load.deliveryPhotosMetadata.map((photo, idx) => (
<li key={`deliveryPhoto-${idx}`}><a href={photo.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{photo.name} ({formatDateOnly(photo.uploadedAt)}) {photo.location && <LocationSpan lat={photo.location.latitude} lng={photo.location.longitude} />}</a></li>                          ))}
                        </ul>
                      </div>
                    )}
                    {load.deliverySignatureUrl && (
                      <div className="mb-2">
                        <p className="text-sm font-medium">Delivery Signature:</p>
                        <img src={load.deliverySignatureUrl} alt="Delivery Signature" className="max-w-xs border rounded shadow"/>
                        {load.deliverySignatureMetadata && (
                          <>
                            <p className="text-xs text-gray-500">Signer: {load.deliverySignatureMetadata.signerName}</p>
<p className="text-xs text-gray-500">At: {formatDateOnly(load.deliverySignatureMetadata.capturedAt)}</p>
                            {load.deliverySignatureMetadata.location && 
  <LocationDisplay lat={load.deliverySignatureMetadata.location.latitude} lng={load.deliverySignatureMetadata.location.longitude} />
}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {/* Delivered Loads Section */}
        {deliveredLoads.length > 0 && (
          <div className="mt-10">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Delivered Loads History</h3>
            {deliveredLoads.map(load => (
               <div key={load.id} className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                    <div>
<div className="flex items-center gap-2">
  <h2 className="mb-1 sm:mb-0 font-semibold text-blue-700 load-id-custom" style={{fontSize:"1.12rem", fontWeight:600}}>Load ID: {load.load_id}</h2>
  {/* Payment collection indicator for automobile hauling */}
  {detectCommodityType(load) === 'automobile_hauling' && ((load.driverCollectionAmount && Number(load.driverCollectionAmount) > 0) || 
    (load.brokerFeeCollection && Number(load.brokerFeeCollection) > 0)) && (
    <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-medium">
      💰 COD
    </span>
  )}
  {/* INOP indicator for automobile hauling */}
  {detectCommodityType(load) === 'automobile_hauling' && load.vehicles && 
    load.vehicles.some(vehicle => vehicle.inop === true) && (
    <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
      ⚠️ INOP
    </span>
  )}
</div>
                        <div className="amount-mileage-custom" style={{fontSize:"1.1rem", fontWeight:700}}>
  <span>Rate: {(Number(load.amount) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
  {load.mileage && <span> / Miles: {load.mileage}</span>}
  
  {/* Show different rate calculations based on commodity type */}
  {detectCommodityType(load) === 'automobile_hauling' ? (
    // Show PV/m for vehicle loads
    load.mileage && load.amount && Number(load.mileage) > 0 && (load.vehicleCount || (load.vehicles && load.vehicles.length) || 1) > 0 && (
      <span className="ml-2 text-purple-700 font-semibold">
        PV/m ${(Number(load.amount) / (load.vehicleCount || (load.vehicles && load.vehicles.length) || 1) / Number(load.mileage)).toFixed(2)}
      </span>
    )
  ) : (
    // Show regular P/m for other commodities
    Number(load.mileage) > 0 && Number(load.amount) > 0 && (
      <span className="ml-2 text-blue-900 font-semibold">
        P/m ${(Number(load.amount) / Number(load.mileage)).toFixed(2)}
      </span>
    )
  )}
</div>
<p className="text-xs text-gray-500">Delivered: {formatDateOnly(load.actualDEL || load.deliveryDateTime)}</p>
                    </div>
                    <div className="flex items-center gap-2">
  <span className="px-3 py-1.5 text-sm font-semibold rounded-full self-start sm:self-center bg-green-100 text-green-800">
      Delivered
  </span>
  <button 
    onClick={() => generateBOL(load)}
    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-1"
  >
    📄 BOL
  </button>
</div>
                </div>
                 <button
                    onClick={() => toggleDeliveredDocs(load.id)}
                    className="text-blue-600 text-sm hover:underline flex items-center gap-1 mb-2"
                  >
                    <span>
                      {expandedDeliveredDocs[load.id] ? "▼ Hide Documents & Signatures" : "▶ Show Documents & Signatures"}
                    </span>
                  </button>
                {expandedDeliveredDocs[load.id] && (
  <div className="mt-4 pt-4 border-t">
    {/* Add route and commodity details for delivered loads */}
    <div className="mb-4">
      <RouteDisplay load={load} />
      <CommodityDetails load={load} />
      {/* Payment Collection Details for Auto Hauling */}
      {detectCommodityType(load) === 'automobile_hauling' && ((load.driverCollectionAmount && Number(load.driverCollectionAmount) > 0) || 
        (load.brokerFeeCollection && Number(load.brokerFeeCollection) > 0) ||
        load.collectionInstructions || load.paymentMethod) && (
        <div className="mt-3 p-3 bg-orange-50 rounded-md border border-orange-200">
          {load.driverCollectionAmount && Number(load.driverCollectionAmount) > 0 && (
            <p className="text-sm font-semibold text-orange-800">
              <strong>Driver to get:</strong> {Number(load.driverCollectionAmount).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
            </p>
          )}
          {load.brokerFeeCollection && Number(load.brokerFeeCollection) > 0 && (
            <p className="text-sm font-semibold text-orange-800">
              <strong>Broker Fee:</strong> {Number(load.brokerFeeCollection).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
            </p>
          )}
          {load.paymentMethod && (
            <p className="text-xs text-gray-600 mt-1">
              <strong>Payment Method:</strong> {load.paymentMethod}
            </p>
          )}
          {load.collectionInstructions && (
            <p className="text-xs text-gray-600 mt-1">
              <strong>Collection Instructions:</strong> {load.collectionInstructions}
            </p>
          )}
        </div>
      )}
    </div>
    
    {/* Re-using the same display logic for docs & signatures */}
    {(load.pickupPhotosMetadata?.length > 0 || load.deliveryPhotosMetadata?.length > 0 || load.pickupSignatureUrl || load.deliverySignatureUrl) && (
      <>
        {load.pickupPhotosMetadata?.length > 0 && (
          <div className="mb-2">
            <p className="text-sm font-medium">Pickup Photos/Docs:</p>
            <ul className="list-disc list-inside pl-4 text-xs">
              {load.pickupPhotosMetadata.map((photo, idx) => (
<li key={`del-pickupPhoto-${idx}`}><a href={photo.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{photo.name} ({formatDateOnly(photo.uploadedAt)}) {photo.location && <LocationSpan lat={photo.location.latitude} lng={photo.location.longitude} />}</a></li>
              ))}
            </ul>
          </div>
        )}
        {load.pickupSignatureUrl && <div className="mb-2"><p className="text-sm font-medium">Pickup Signature:</p><img src={load.pickupSignatureUrl} alt="Pickup Signature" className="max-w-xs border rounded shadow"/> {load.pickupSignatureMetadata && <><p className="text-xs text-gray-500">Signer: {load.pickupSignatureMetadata.signerName}</p><p className="text-xs text-gray-500">At: {formatDateOnly(load.pickupSignatureMetadata.capturedAt)}</p> {load.pickupSignatureMetadata.location && <LocationDisplay lat={load.pickupSignatureMetadata.location.latitude} lng={load.pickupSignatureMetadata.location.longitude} />}</>}</div>}
        
        {load.deliveryPhotosMetadata?.length > 0 && (
          <div className="mb-2">
            <p className="text-sm font-medium">Delivery Photos/Docs:</p>
            <ul className="list-disc list-inside pl-4 text-xs">
              {load.deliveryPhotosMetadata.map((photo, idx) => (
<li key={`del-deliveryPhoto-${idx}`}><a href={photo.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{photo.name} ({formatDateOnly(photo.uploadedAt)}) {photo.location && <LocationSpan lat={photo.location.latitude} lng={photo.location.longitude} />}</a></li>
              ))}
            </ul>
          </div>
        )}
        {load.deliverySignatureUrl && (
          <div className="mb-2">
            <p className="text-sm font-medium">Delivery Signature:</p>
            <img
              src={load.deliverySignatureUrl}
              alt="Delivery Signature"
              className="max-w-xs border rounded shadow"
            />
            {load.deliverySignatureMetadata && (
              <>
                <p className="text-xs text-gray-500">
                  Signer: {load.deliverySignatureMetadata.signerName}
                </p>
                <p className="text-xs text-gray-500">
                  At: {formatDriverTimestamp(load.deliverySignatureMetadata.capturedAt)}
                </p>
                {load.deliverySignatureMetadata.location && 
                  <LocationDisplay lat={load.deliverySignatureMetadata.location.latitude} lng={load.deliverySignatureMetadata.location.longitude} />
                }
              </>
            )}
          </div>
        )}
      </>
    )}
    {!(load.pickupPhotosMetadata?.length > 0 || load.deliveryPhotosMetadata?.length > 0 || load.pickupSignatureUrl || load.deliverySignatureUrl) && (
      <p className="text-xs text-gray-500">No documents or signatures found for this delivered load.</p>
    )}
  </div>
)}
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`
        .input-file-styling { margin-top: 0.25rem; display: block; width: 100%; font-size: 0.875rem; line-height: 1.25rem; color: #6B7280; }
        .input-file-styling::file-selector-button { margin-right: 1rem; padding-top: 0.5rem; padding-bottom: 0.5rem; padding-left: 1rem; padding-right: 1rem; border-radius: 0.5rem; border-width: 0px; font-size: 0.875rem; font-weight: 600; }
        .btn-green { background-color: #10B981; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; } .btn-green:hover { background-color: #059669; }
        .btn-indigo { background-color: #6366F1; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; } .btn-indigo:hover { background-color: #4F46E5; }
        .btn-orange { background-color: #F97316; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; } .btn-orange:hover { background-color: #EA580C; }
        .btn-pink   { background-color: #EC4899; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; } .btn-pink:hover   { background-color: #DB2777; }
        .btn-teal   { background-color: #14B8A6; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; } .btn-teal:hover   { background-color: #0D9488; }
        .btn-gray-small { padding: 0.25rem 0.5rem; font-size: 0.75rem; background-color: #E5E7EB; color: #374151; border-radius: 0.375rem; font-weight: 500; } .btn-gray-small:hover { background-color: #D1D5DB; }
        .btn-green-small { padding: 0.25rem 0.5rem; font-size: 0.75rem; background-color: #10B981; color: white; border-radius: 0.375rem; font-weight: 500; } .btn-green-small:hover { background-color: #059669; }
        .btn-red-small { padding: 0.25rem 0.5rem; font-size: 0.75rem; background-color: #EF4444; color: white; border-radius: 0.375rem; font-weight: 500; } .btn-red-small:hover { background-color: #DC2626; }
        button:disabled { opacity: 0.7; cursor: not-allowed; }
        .text-xxs { font-size: 0.65rem; line-height: 0.9rem; }
        .load-id-custom { font-size: 1.12rem; }
        .amount-mileage-custom { font-size: 1.1rem; font-weight: 700; }
         @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.95);
    }
  }
      `}</style>
    </div>
  );
}
// Remove the current export and replace with this:
const DriverLoadViewPage = () => {
  return (
    <DriverPageErrorBoundary>
      <DriverLoadViewPageInternal />
    </DriverPageErrorBoundary>
  );
};

export default DriverLoadViewPage;