// src/components/OnlineBOLPage.js

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import JSZip from 'jszip';

const OnlineBOLPage = () => {
  const { loadId } = useParams();
  const [load, setLoad] = useState(null);
  const [driver, setDriver] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [allPhotos, setAllPhotos] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Admin state for photo deletion
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(null); // Stores photo URL being deleted

  // Helper function to format date without time
  const formatDateOnly = (timestamp) => {
    if (!timestamp) return 'N/A';
    let dateToFormat;
    
    // Handle ISO string dates like "2025-07-16T23:01:45.580Z"
    if (typeof timestamp === 'string') {
      dateToFormat = new Date(timestamp);
    } else if (timestamp && typeof timestamp.toDate === 'function') {
      // Handle Firestore timestamps
      dateToFormat = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      // Handle regular Date objects
      dateToFormat = timestamp;
    } else if (timestamp.seconds) {
      // Handle Firestore timestamp objects with seconds property
      dateToFormat = new Date(timestamp.seconds * 1000);
    } else {
      return String(timestamp);
    }
    
    // Check if date is valid
    if (isNaN(dateToFormat.getTime())) {
      return String(timestamp);
    }
    
    return dateToFormat.toLocaleDateString();
  };

  const detectCommodityType = (load) => {
    if (load.vehicles && load.vehicles.length > 0) return 'automobile_hauling';
    if (load.reeferTemp || load.reeferTempRange || load.reeferInstructions) return 'reefer';
    if (load.weight || load.dimensions || load.tarpingRequired || load.securementType) return 'flatbed';
    if (load.productType || load.hazmatRequired || load.tankWashRequired) return 'tanker';
    if (load.cargoWeight || load.palletCount || load.trailerType || load.loadingEquipment || load.cargoType) return 'dry_van';
    return 'general';
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

  // Combine all photos into a single array for navigation
  useEffect(() => {
    if (load) {
      const pickupPhotos = (load.pickupPhotosMetadata || []).map(p => ({ ...p, type: 'pickup' }));
      const deliveryPhotos = (load.deliveryPhotosMetadata || []).map(p => ({ ...p, type: 'delivery' }));
      setAllPhotos([...pickupPhotos, ...deliveryPhotos]);
    }
  }, [load]);

  // Navigate to previous photo
  const goToPrevious = useCallback(() => {
    if (allPhotos.length === 0) return;
    const newIndex = lightboxIndex === 0 ? allPhotos.length - 1 : lightboxIndex - 1;
    setLightboxIndex(newIndex);
    setLightboxImage(allPhotos[newIndex]);
  }, [lightboxIndex, allPhotos]);

  // Navigate to next photo
  const goToNext = useCallback(() => {
    if (allPhotos.length === 0) return;
    const newIndex = lightboxIndex === allPhotos.length - 1 ? 0 : lightboxIndex + 1;
    setLightboxIndex(newIndex);
    setLightboxImage(allPhotos[newIndex]);
  }, [lightboxIndex, allPhotos]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!lightboxOpen) return;
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, goToPrevious, goToNext]);

  // Open lightbox with specific photo
  const openLightbox = (photo, index) => {
    setLightboxImage(photo);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Download all photos as ZIP
  const downloadAllPhotos = async () => {
    if (allPhotos.length === 0) return;
    
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const pickupFolder = zip.folder('pickup_photos');
      const deliveryFolder = zip.folder('delivery_photos');

      // Download each photo and add to ZIP
      for (let i = 0; i < allPhotos.length; i++) {
        const photo = allPhotos[i];
        try {
          const response = await fetch(photo.url);
          const blob = await response.blob();
          
          // Determine file extension from URL or default to jpg
          const urlParts = photo.url.split('.');
          let extension = urlParts[urlParts.length - 1].split('?')[0].toLowerCase();
          if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            extension = 'jpg';
          }
          
          const fileName = `${photo.name || `photo_${i + 1}`}.${extension}`;
          const folder = photo.type === 'pickup' ? pickupFolder : deliveryFolder;
          folder.file(fileName, blob);
        } catch (err) {
          console.error(`Failed to download photo: ${photo.name}`, err);
        }
      }

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BOL_${load.load_id}_photos.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create ZIP:', err);
      alert('Failed to download photos. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Check if logged-in user is admin of this load's tenant
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Check if user belongs to the same tenant as the load
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            // User is admin if they belong to same tenant and have appropriate role
            if (load && userData.tenantId === load.tenantId) {
              const adminRoles = ['admin', 'owner', 'dispatcher', 'Admin', 'Owner', 'Dispatcher', 'Super Admin'];
              // Handle role as string or array
              const userRoles = Array.isArray(userData.role) ? userData.role : [userData.role];
              const hasAdminRole = userRoles.some(role => adminRoles.includes(role));
              setIsAdmin(hasAdminRole);
            }
          }
        } catch (err) {
          console.error('Error checking admin status:', err);
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
      }
    });

    return () => unsubscribe();
  }, [load]);

  // Delete photo handler
  const handleDeletePhoto = async (photo, photoType) => {
    if (!isAdmin || !load) return;
    
    const photoName = photo.name || 'this photo';
    if (!window.confirm(`Are you sure you want to delete "${photoName}"?\n\nThis action cannot be undone and the photo will no longer be visible to anyone viewing this BOL.`)) {
      return;
    }

    setIsDeletingPhoto(photo.url);
    
    try {
      // 1. Delete from Firebase Storage
      if (photo.storagePath) {
        const storage = getStorage();
        const photoRef = ref(storage, photo.storagePath);
        try {
          await deleteObject(photoRef);
          console.log('✅ Photo deleted from storage:', photo.storagePath);
        } catch (storageErr) {
          // Photo might already be deleted from storage, continue with metadata removal
          console.warn('⚠️ Could not delete from storage (may already be deleted):', storageErr);
        }
      }

      // 2. Update Firestore - remove photo from metadata array
      const fieldToUpdate = photoType === 'pickup' ? 'pickupPhotosMetadata' : 'deliveryPhotosMetadata';
      const currentPhotos = load[fieldToUpdate] || [];
      const updatedPhotos = currentPhotos.filter(p => p.url !== photo.url);

      await updateDoc(doc(db, "loads", loadId), {
        [fieldToUpdate]: updatedPhotos
      });

      // 3. Update local state
      setLoad(prev => ({
        ...prev,
        [fieldToUpdate]: updatedPhotos
      }));

      // 4. Update allPhotos state
      setAllPhotos(prev => prev.filter(p => p.url !== photo.url));

      console.log('✅ Photo deleted successfully');
      
    } catch (err) {
      console.error('❌ Error deleting photo:', err);
      alert('Failed to delete photo: ' + err.message);
    } finally {
      setIsDeletingPhoto(null);
    }
  };

  useEffect(() => {
    const fetchBOLData = async () => {
      try {
        setIsLoading(true);
        
        // Force cache bust by logging timestamp
        const timestamp = Date.now();
        console.log('OnlineBOL: Fetching load data for ID:', loadId, '(timestamp:', timestamp, ')');
        console.log('OnlineBOL: Current time:', new Date().toISOString());
        
        // Fetch load data (force fresh fetch, no cache)
        const loadDocRef = doc(db, "loads", loadId);
        const loadDoc = await getDoc(loadDocRef);
        
        if (!loadDoc.exists()) {
          console.error('OnlineBOL: Load not found:', loadId);
          setError("Load not found");
          return;
        }
        
        const loadData = { id: loadDoc.id, ...loadDoc.data() };
        console.log('OnlineBOL: Load data retrieved:', loadData);
        console.log('🔍 OnlineBOL: ALL LOAD FIELDS:', Object.keys(loadData));
        console.log('🔍 OnlineBOL: Company name sources:');
        console.log('   - load.companyName:', loadData.companyName);
        console.log('   - load.companyName type:', typeof loadData.companyName);
        console.log('   - load.companyName is undefined?:', loadData.companyName === undefined);
        console.log('   - load.companyName is null?:', loadData.companyName === null);
        console.log('   - load.companyName is empty string?:', loadData.companyName === '');
        console.log('   - "companyName" field exists in document?:', loadData.hasOwnProperty('companyName'));

        // Security check: Ensure load has tenantId (for multi-tenant security)
        if (!loadData.tenantId) {
          console.error('OnlineBOL: Load missing tenantId - potential security issue');
          setError("Load data is incomplete or invalid");
          return;
        }

        setLoad(loadData);

        // CRITICAL FIX: Check if companyName field exists (not just if it's truthy)
        // Priority: load.companyName (if field exists) > driver.assignedCompanyName (fallback)
        let companyNameToUse = null;
        const hasCompanyNameField = loadData.hasOwnProperty('companyName');
        
        console.log('🔍 OnlineBOL: hasCompanyNameField:', hasCompanyNameField);
        
        if (hasCompanyNameField) {
          // Field exists, use it even if it's empty string
          companyNameToUse = loadData.companyName;
          console.log('🔍 OnlineBOL: Using load.companyName (field exists):', companyNameToUse);
        }

        // Fetch driver data with tenant validation
        let driverData = null;
        if (loadData.driverId) {
          console.log('OnlineBOL: Fetching driver data for:', loadData.driverId);
          const driverDoc = await getDoc(doc(db, "drivers", loadData.driverId));
          if (driverDoc.exists()) {
            driverData = driverDoc.data();
            
            // Security check: Ensure driver belongs to same tenant
            if (driverData.tenantId !== loadData.tenantId) {
              console.error('OnlineBOL: Driver tenantId mismatch. Load tenant:', loadData.tenantId, 'Driver tenant:', driverData.tenantId);
              setError("Data validation failed");
              return;
            }

            setDriver({ id: driverDoc.id, ...driverData });
            console.log('OnlineBOL: Driver data retrieved and validated');
            console.log('🔍 OnlineBOL: Driver company name:', driverData.assignedCompanyName);
            
            // Only use driver's company if load doesn't have companyName field at all
            if (!hasCompanyNameField && driverData.assignedCompanyName) {
              companyNameToUse = driverData.assignedCompanyName;
              console.log('🔍 OnlineBOL: Using driver company name as fallback (no field in load):', companyNameToUse);
            }
          } else {
            console.warn('OnlineBOL: Driver not found:', loadData.driverId);
          }
        }
        
        console.log('🔍 OnlineBOL: Final company name to use:', companyNameToUse);
        console.log('   - Source:', hasCompanyNameField ? '✅ load.companyName (EDITED)' : '⚠️ driver.assignedCompanyName (DEFAULT)');
        
        // Fetch company info with tenant validation
        if (companyNameToUse) {
          console.log('OnlineBOL: Fetching company data for:', companyNameToUse);
          const companiesQuery = query(
            collection(db, "companies"), 
            where("tenantId", "==", loadData.tenantId),
            where("name", "==", companyNameToUse)
          );
          const companiesSnapshot = await getDocs(companiesQuery);
          if (!companiesSnapshot.empty) {
            const companyData = companiesSnapshot.docs[0].data();
            
            // Additional security check
            if (companyData.tenantId !== loadData.tenantId) {
              console.error('OnlineBOL: Company tenantId mismatch');
              setError("Data validation failed");
              return;
            }

            setCompanyInfo(companyData);
            console.log('✅ OnlineBOL: Company data retrieved and validated:', companyData.name);
          } else {
            console.warn('OnlineBOL: Company not found for tenant:', loadData.tenantId, 'Company name:', companyNameToUse);
            // Set a fallback company info with the name we're looking for
            setCompanyInfo({
              name: companyNameToUse,
              address: 'Address Not Available',
              phone: 'Phone Not Available',
              email: 'Email Not Available',
              mcNumber: 'MC Not Available',
              usdot: 'USDOT Not Available'
            });
            console.log('⚠️ OnlineBOL: Using fallback company info');
          }
        } else {
          console.warn('⚠️ OnlineBOL: No company name available from any source');
        }

        console.log('OnlineBOL: All data loaded successfully for tenant:', loadData.tenantId);
      } catch (err) {
        console.error("OnlineBOL: Error fetching BOL data:", err);
        setError("Failed to load BOL data");
      } finally {
        setIsLoading(false);
      }
    };

    if (loadId) {
      fetchBOLData();
    }
  }, [loadId]);

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
          <p className="text-gray-500 text-sm mt-4">If you believe this is an error, please contact the carrier.</p>
        </div>
      </div>
    );
  }

  const commodityType = detectCommodityType(load);
  const pickupPhotoCount = load.pickupPhotosMetadata?.length || 0;
  const deliveryPhotoCount = load.deliveryPhotosMetadata?.length || 0;
  
  const Lightbox = () => {
    if (!lightboxOpen || !lightboxImage) return null;

    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
        onClick={() => setLightboxOpen(false)}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300 z-10"
          onClick={() => setLightboxOpen(false)}
        >
          ×
        </button>

        {/* Left arrow */}
        {allPhotos.length > 1 && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-5xl hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full w-14 h-14 flex items-center justify-center transition-all hover:bg-opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              goToPrevious();
            }}
          >
            ‹
          </button>
        )}

        {/* Image */}
        <img 
          src={lightboxImage.url} 
          alt={lightboxImage.name}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Right arrow */}
        {allPhotos.length > 1 && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-5xl hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full w-14 h-14 flex items-center justify-center transition-all hover:bg-opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
          >
            ›
          </button>
        )}

        {/* Photo info and counter */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end text-white">
          <div>
            <p className="text-lg font-medium">{lightboxImage.name}</p>
            <p className="text-sm opacity-75">{formatDateOnly(lightboxImage.uploadedAt)}</p>
            <p className="text-xs opacity-60 capitalize">{lightboxImage.type} photo</p>
          </div>
          <div className="text-sm opacity-75">
            {lightboxIndex + 1} / {allPhotos.length}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
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
          {/* Admin indicator */}
          {isAdmin && (
            <div className="mt-3">
              <span className="inline-block bg-green-500 px-3 py-1 rounded-full text-xs">
                ✓ Admin Mode - You can delete photos
              </span>
            </div>
          )}
        </div>

        {/* Company and Driver Info */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           
            {/* Driver Information - Only show if showOnBOL is true */}
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

        {/* Photos Section */}
        {(pickupPhotoCount > 0 || deliveryPhotoCount > 0) && (
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">📸 Documentation Photos</h3>
              <button
                onClick={downloadAllPhotos}
                disabled={isDownloading}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
              >
                {isDownloading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download All ({allPhotos.length})
                  </>
                )}
              </button>
            </div>
            
            {/* Admin notice */}
            {isAdmin && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Admin:</strong> Hover over any photo and click the trash icon to delete it. Deleted photos cannot be recovered.
                </p>
              </div>
            )}
            
            {load.pickupPhotosMetadata && load.pickupPhotosMetadata.length > 0 && (
              <div className="mb-6">
                <h4 className="font-medium text-gray-700 mb-3">Pickup Photos ({load.pickupPhotosMetadata.length})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {load.pickupPhotosMetadata.map((photo, idx) => {
                    // Find the global index for this photo
                    const globalIndex = allPhotos.findIndex(p => p.url === photo.url && p.type === 'pickup');
                    const isDeleting = isDeletingPhoto === photo.url;
                    return (
                      <div key={idx} className="border rounded-lg overflow-hidden relative group">
                        {/* Delete button - only visible to admins */}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePhoto(photo, 'pickup');
                            }}
                            disabled={isDeleting}
                            className="absolute top-2 right-2 z-10 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 disabled:bg-red-400"
                            title="Delete photo"
                          >
                            {isDeleting ? (
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        )}
                        <img 
                          src={photo.url} 
                          alt={`Pickup Photo ${idx + 1}`}
                          className={`w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${isDeleting ? 'opacity-50' : ''}`}
                          onClick={() => openLightbox({ ...photo, type: 'pickup' }, globalIndex)}
                        />
                        <div className="p-3 bg-gray-50">
                          <p className="text-sm font-medium">{photo.name}</p>
                          <p className="text-xs text-gray-500">{formatDateOnly(photo.uploadedAt)}</p>
                          {photo.location && <LocationDisplay lat={photo.location.latitude} lng={photo.location.longitude} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {load.deliveryPhotosMetadata && load.deliveryPhotosMetadata.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Delivery Photos ({load.deliveryPhotosMetadata.length})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {load.deliveryPhotosMetadata.map((photo, idx) => {
                    // Find the global index for this photo
                    const globalIndex = allPhotos.findIndex(p => p.url === photo.url && p.type === 'delivery');
                    const isDeleting = isDeletingPhoto === photo.url;
                    return (
                      <div key={idx} className="border rounded-lg overflow-hidden relative group">
                        {/* Delete button - only visible to admins */}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePhoto(photo, 'delivery');
                            }}
                            disabled={isDeleting}
                            className="absolute top-2 right-2 z-10 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 disabled:bg-red-400"
                            title="Delete photo"
                          >
                            {isDeleting ? (
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        )}
                        <img 
                          src={photo.url} 
                          alt={`Delivery Photo ${idx + 1}`}
                          className={`w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${isDeleting ? 'opacity-50' : ''}`}
                          onClick={() => openLightbox({ ...photo, type: 'delivery' }, globalIndex)}
                        />
                        <div className="p-3 bg-gray-50">
                          <p className="text-sm font-medium">{photo.name}</p>
                          <p className="text-xs text-gray-500">{formatDateOnly(photo.uploadedAt)}</p>
                          {photo.location && <LocationDisplay lat={photo.location.latitude} lng={photo.location.longitude} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Signatures Section */}
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
                    />
                    <div className="p-3 bg-gray-50">
                      <p className="text-sm"><span className="font-medium">Signed by:</span> {load.pickupSignatureMetadata?.signerName || 'N/A'}</p>
                      <p className="text-xs text-gray-500">{formatDateOnly(load.pickupSignatureMetadata?.capturedAt)}</p>
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
                    />
                    <div className="p-3 bg-gray-50">
                      <p className="text-sm"><span className="font-medium">Signed by:</span> {load.deliverySignatureMetadata?.signerName || 'N/A'}</p>
                      <p className="text-xs text-gray-500">{formatDateOnly(load.deliverySignatureMetadata?.capturedAt)}</p>
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
          <p>This Bill of Lading was generated on {new Date().toLocaleDateString()}</p>
          <p className="mt-2">For questions about this shipment, please contact the carrier at the information provided above.</p>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              🔒 This BOL contains confidential information. Unauthorized access is prohibited.
            </p>
          </div>
        </div>
      </div>
      <Lightbox />
    </div>
  );
};

export default OnlineBOLPage;