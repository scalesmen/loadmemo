// src/components/liveload/dealer/CreateLiveLoadModal.js
// Modal for dealers to create new LiveLoads with PDF upload

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../firebase';
import { 
  getInitialLiveLoadForm, 
  VEHICLE_CONDITION,
  PDF_SOURCES,
  PLATFORM_CONFIG 
} from '../utils/liveLoadConstants';
import { 
  formatCurrency, 
  getDefaultExpiration,
  generateReferenceId 
} from '../utils/liveLoadHelpers';

// Icons
const XIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const LocationIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const SpinnerIcon = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
);

export default function CreateLiveLoadModal({ 
  onClose, 
  onCreated, 
  loggedInUser,
  dealerProfile 
}) {
  // Form State
  const [formData, setFormData] = useState(getInitialLiveLoadForm());
  const [step, setStep] = useState(1); // 1: Upload, 2: Review/Edit, 3: Confirm
  
  // Upload State
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  
  // Location State
  const [userLocation, setUserLocation] = useState(null);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);

  // Get user location if "Use My Location" is selected
  const getCurrentLocation = useCallback(() => {
    setIsGettingLocation(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          
          // Reverse geocode to get address
          try {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`
            );
            const data = await response.json();
            
            if (data.results && data.results[0]) {
              const addressComponents = data.results[0].address_components;
              const formatted = data.results[0].formatted_address;
              
              // Extract city, state, zip
              let city = '', state = '', zip = '';
              addressComponents.forEach(comp => {
                if (comp.types.includes('locality')) city = comp.long_name;
                if (comp.types.includes('administrative_area_level_1')) state = comp.short_name;
                if (comp.types.includes('postal_code')) zip = comp.short_name;
              });
              
              setFormData(prev => ({
                ...prev,
                delivery: {
                  ...prev.delivery,
                  address: formatted.split(',')[0], // Street address
                  city,
                  state,
                  zip,
                  facilityName: dealerProfile?.businessName || '',
                  phone: dealerProfile?.phone || '',
                  useMyLocation: true
                }
              }));
            }
          } catch (err) {
            console.error('Geocoding error:', err);
          }
          
          setIsGettingLocation(false);
        },
        (error) => {
          console.error('Location error:', error);
          setError('Could not get your location. Please enter the address manually.');
          setIsGettingLocation(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setError('Geolocation is not supported by your browser');
      setIsGettingLocation(false);
    }
  }, [dealerProfile]);

  // Handle file selection
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setError('File size must be less than 10MB');
      return;
    }
    
    setUploadedFile(file);
    setError(null);
    
    // Upload and parse
    await uploadAndParsePdf(file);
  };

  // Upload PDF and send to Gemini for parsing
  const uploadAndParsePdf = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Upload to Firebase Storage
      const fileRef = ref(
        storage, 
        `liveload-documents/${loggedInUser.uid}/${Date.now()}-${file.name}`
      );
      
      const uploadTask = uploadBytesResumable(fileRef, file);
      
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Upload error:', error);
          setError('Failed to upload file. Please try again.');
          setIsUploading(false);
        },
        async () => {
          // Upload complete, get download URL
          const downloadUrl = await getDownloadURL(fileRef);
          
          setIsUploading(false);
          setIsParsing(true);
          
          // Call Cloud Function to parse PDF with Gemini
          try {
            const idToken = await loggedInUser.getIdToken?.(true) || 
              (await import('firebase/auth').then(m => m.getAuth().currentUser?.getIdToken(true)));
            
            const response = await fetch(
              'https://us-central1-truckmemo2.cloudfunctions.net/parseLiveLoadDocument',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                  storagePath: fileRef.fullPath,
                  downloadUrl,
                  fileName: file.name,
                  userId: loggedInUser.uid
                })
              }
            );
            
            if (!response.ok) {
              throw new Error('Failed to parse document');
            }
            
            const parsed = await response.json();
            setParsedData(parsed);
            
            // Populate form with parsed data
            populateFormFromParsed(parsed, downloadUrl, fileRef.fullPath);
            
            setIsParsing(false);
            setStep(2); // Move to review step
            
          } catch (parseError) {
            console.error('Parse error:', parseError);
            setError('Failed to analyze document. Please fill in details manually.');
            setIsParsing(false);
            setStep(2); // Still move to review step, but with empty form
          }
        }
      );
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload file. Please try again.');
      setIsUploading(false);
    }
  };

  // Populate form from parsed PDF data
  const populateFormFromParsed = (parsed, downloadUrl, storagePath) => {
    setFormData(prev => ({
      ...prev,
      vehicles: parsed.vehicles?.length > 0 
        ? parsed.vehicles.map(v => ({
            vin: v.vin || '',
            year: v.year || '',
            make: v.make || '',
            model: v.model || '',
            color: v.color || '',
            body: v.body || '',
            condition: v.inop ? VEHICLE_CONDITION.INOPERABLE : VEHICLE_CONDITION.OPERABLE,
            lotLocation: v.lotLocation || ''
          }))
        : prev.vehicles,
      vehicleCount: parsed.vehicles?.length || 1,
      pickup: {
        facilityName: parsed.pickup?.facilityName || '',
        address: parsed.pickup?.address || '',
        city: parsed.pickup?.city || '',
        state: parsed.pickup?.state || '',
        zip: parsed.pickup?.zip || '',
        phone: parsed.pickup?.phone || '',
        instructions: parsed.pickup?.instructions || '',
        releaseId: parsed.releaseId || ''
      },
      delivery: {
        ...prev.delivery,
        facilityName: parsed.buyer?.name || dealerProfile?.businessName || '',
        address: parsed.buyer?.address || dealerProfile?.defaultLocation?.address || '',
        city: parsed.buyer?.city || dealerProfile?.defaultLocation?.city || '',
        state: parsed.buyer?.state || dealerProfile?.defaultLocation?.state || '',
        zip: parsed.buyer?.zip || dealerProfile?.defaultLocation?.zip || '',
        phone: parsed.buyer?.phone || dealerProfile?.phone || ''
      },
      documents: [{
        type: parsed.documentType || 'gate_pass',
        source: parsed.source || PDF_SOURCES.OTHER,
        storagePath,
        downloadUrl,
        uploadedAt: new Date(),
        parsedData: parsed
      }],
      sourceType: 'pdf_import',
      pdfSource: parsed.source || ''
    }));
  };

  // Handle form field changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Handle nested fields (e.g., "pickup.city")
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Handle vehicle changes
  const handleVehicleChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      vehicles: prev.vehicles.map((v, i) => 
        i === index ? { ...v, [field]: value } : v
      )
    }));
  };

  // Add vehicle
  const addVehicle = () => {
    if (formData.vehicles.length >= PLATFORM_CONFIG.MAX_VEHICLES_PER_LOAD) return;
    
    setFormData(prev => ({
      ...prev,
      vehicles: [...prev.vehicles, {
        vin: '', year: '', make: '', model: '', 
        color: '', body: '', condition: VEHICLE_CONDITION.OPERABLE, lotLocation: ''
      }],
      vehicleCount: prev.vehicleCount + 1
    }));
  };

  // Remove vehicle
  const removeVehicle = (index) => {
    if (formData.vehicles.length <= 1) return;
    
    setFormData(prev => ({
      ...prev,
      vehicles: prev.vehicles.filter((_, i) => i !== index),
      vehicleCount: prev.vehicleCount - 1
    }));
  };

  // Submit LiveLoad
  const handleSubmit = async () => {
    setError(null);
    
    // Validation
    if (!formData.vehicles[0]?.vin && !formData.vehicles[0]?.make) {
      setError('Please enter at least one vehicle');
      return;
    }
    
    if (!formData.pickup.city || !formData.pickup.state) {
      setError('Please enter pickup location');
      return;
    }
    
    if (!formData.delivery.city || !formData.delivery.state) {
      setError('Please enter delivery location');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Create vehicle display summary
      const vehicleDisplaySummary = formData.vehicles[0]
        ? `${formData.vehicles[0].year} ${formData.vehicles[0].make} ${formData.vehicles[0].model}`.trim()
        : 'Vehicle';
      
      // Calculate expiration
      const expiresAt = formData.expirationPreset === 'custom' && formData.expiresAt
        ? new Date(formData.expiresAt)
        : getDefaultExpiration(formData.expirationPreset || 'eod');
      
      // Build the LiveLoad document
      const liveLoadData = {
        // Reference
        referenceId: generateReferenceId(),
        
        // Dealer Info
        dealerId: loggedInUser.uid,
        dealerName: dealerProfile?.businessName || loggedInUser.displayName || 'Dealer',
        dealerEmail: loggedInUser.email,
        dealerPhone: dealerProfile?.phone || '',
        dealerRating: dealerProfile?.averageRating || null,
        dealerReviewCount: dealerProfile?.totalRatings || 0,
        
        // Vehicles
        vehicles: formData.vehicles.map(v => ({
          ...v,
          year: parseInt(v.year) || null
        })),
        vehicleCount: formData.vehicles.length,
        vehicleDisplaySummary,
        
        // Locations
        pickup: {
          ...formData.pickup,
          geopoint: null // TODO: Geocode pickup address
        },
        delivery: {
          ...formData.delivery,
          geopoint: userLocation 
            ? new GeoPoint(userLocation.latitude, userLocation.longitude)
            : null
        },
        
        // Pricing
        suggestedPrice: formData.suggestedPrice ? parseFloat(formData.suggestedPrice) : null,
        minAcceptablePrice: formData.minAcceptablePrice ? parseFloat(formData.minAcceptablePrice) : null,
        
        // Timing
        createdAt: serverTimestamp(),
        expiresAt,
        
        // Status
        status: 'posted',
        bidCount: 0,
        
        // Documents
        documents: formData.documents,
        
        // Source
        sourceType: formData.sourceType,
        pdfSource: formData.pdfSource,
        
        // Payment (will be updated when card is added)
        payment: {
          status: 'pending'
        }
      };
      
      const docRef = await addDoc(collection(db, 'liveLoads'), liveLoadData);
      
      onCreated(docRef.id);
      
    } catch (err) {
      console.error('Error creating LiveLoad:', err);
      setError('Failed to create LiveLoad. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Render Step 1: Upload
  const renderUploadStep = () => (
    <div className="p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Upload Gate Pass or Bill of Sale
        </h3>
        <p className="text-sm text-gray-600">
          We'll automatically extract vehicle and pickup information from your document
        </p>
      </div>
      
      {/* Upload Area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          uploadedFile 
            ? 'border-green-400 bg-green-50' 
            : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50'
        }`}
      >
        {isUploading ? (
          <div>
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32" cy="32" r="28"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="32" cy="32" r="28"
                  stroke="#f97316"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${uploadProgress * 1.76} 176`}
                  className="transition-all duration-300"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-orange-600">
                {Math.round(uploadProgress)}%
              </span>
            </div>
            <p className="text-gray-600">Uploading document...</p>
          </div>
        ) : isParsing ? (
          <div>
            <div className="animate-pulse">
              <div className="w-16 h-16 mx-auto mb-4 bg-orange-200 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-orange-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            </div>
            <p className="text-gray-600 font-medium">Analyzing document with AI...</p>
            <p className="text-sm text-gray-500 mt-1">Extracting vehicle and location details</p>
          </div>
        ) : uploadedFile ? (
          <div>
            <DocumentIcon />
            <p className="mt-2 font-medium text-gray-900">{uploadedFile.name}</p>
            <p className="text-sm text-green-600">Document uploaded successfully</p>
          </div>
        ) : (
          <div>
            <UploadIcon />
            <p className="mt-4 font-medium text-gray-900">
              Drop your PDF here or click to browse
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Supports: Manheim, Adesa, OpenLane, SmartAuction, BacklotCars
            </p>
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
      
      {/* Manual Entry Option */}
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Don't have a document?</p>
        <button
          onClick={() => setStep(2)}
          className="text-orange-600 hover:text-orange-700 font-medium text-sm"
        >
          Enter details manually →
        </button>
      </div>
    </div>
  );

  // Render Step 2: Review/Edit
  const renderReviewStep = () => (
    <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
      {/* Vehicle Information */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          🚗 Vehicle Information
          <button
            onClick={addVehicle}
            disabled={formData.vehicles.length >= PLATFORM_CONFIG.MAX_VEHICLES_PER_LOAD}
            className="ml-auto text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded-full hover:bg-orange-200 disabled:opacity-50"
          >
            + Add Vehicle
          </button>
        </h3>
        
        {formData.vehicles.map((vehicle, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-600">Vehicle #{index + 1}</span>
              {formData.vehicles.length > 1 && (
                <button
                  onClick={() => removeVehicle(index)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Year"
                value={vehicle.year}
                onChange={(e) => handleVehicleChange(index, 'year', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              />
              <input
                type="text"
                placeholder="Make"
                value={vehicle.make}
                onChange={(e) => handleVehicleChange(index, 'make', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              />
              <input
                type="text"
                placeholder="Model"
                value={vehicle.model}
                onChange={(e) => handleVehicleChange(index, 'model', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              />
              <input
                type="text"
                placeholder="Color"
                value={vehicle.color}
                onChange={(e) => handleVehicleChange(index, 'color', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 mt-3">
              <input
                type="text"
                placeholder="VIN"
                value={vehicle.vin}
                onChange={(e) => handleVehicleChange(index, 'vin', e.target.value.toUpperCase())}
                maxLength={17}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-orange-500"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={vehicle.condition === VEHICLE_CONDITION.INOPERABLE}
                    onChange={(e) => handleVehicleChange(
                      index, 
                      'condition', 
                      e.target.checked ? VEHICLE_CONDITION.INOPERABLE : VEHICLE_CONDITION.OPERABLE
                    )}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-red-600">⚠️ Inoperable</span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pickup Location */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">📍 Pickup Location</h3>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              name="pickup.facilityName"
              placeholder="Facility Name (e.g., Manheim Detroit)"
              value={formData.pickup.facilityName}
              onChange={handleInputChange}
              className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
            <input
              type="text"
              name="pickup.address"
              placeholder="Street Address"
              value={formData.pickup.address}
              onChange={handleInputChange}
              className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
            <input
              type="text"
              name="pickup.city"
              placeholder="City"
              value={formData.pickup.city}
              onChange={handleInputChange}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                name="pickup.state"
                placeholder="State"
                value={formData.pickup.state}
                onChange={handleInputChange}
                maxLength={2}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                name="pickup.zip"
                placeholder="ZIP"
                value={formData.pickup.zip}
                onChange={handleInputChange}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <input
            type="text"
            name="pickup.phone"
            placeholder="Contact Phone"
            value={formData.pickup.phone}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
          />
          <textarea
            name="pickup.instructions"
            placeholder="Pickup instructions (gate codes, hours, etc.)"
            value={formData.pickup.instructions}
            onChange={handleInputChange}
            rows={2}
            className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Delivery Location */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          📍 Delivery Location
          <button
            onClick={getCurrentLocation}
            disabled={isGettingLocation}
            className="ml-auto text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 flex items-center gap-1"
          >
            {isGettingLocation ? (
              <>
                <div className="animate-spin h-3 w-3 border-2 border-blue-700 border-t-transparent rounded-full"></div>
                Getting location...
              </>
            ) : (
              <>
                <LocationIcon />
                Use My Location
              </>
            )}
          </button>
        </h3>
        <div className="bg-red-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              name="delivery.facilityName"
              placeholder="Dealership/Business Name"
              value={formData.delivery.facilityName}
              onChange={handleInputChange}
              className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
            />
            <input
              type="text"
              name="delivery.address"
              placeholder="Street Address"
              value={formData.delivery.address}
              onChange={handleInputChange}
              className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
            />
            <input
              type="text"
              name="delivery.city"
              placeholder="City"
              value={formData.delivery.city}
              onChange={handleInputChange}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                name="delivery.state"
                placeholder="State"
                value={formData.delivery.state}
                onChange={handleInputChange}
                maxLength={2}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:ring-2 focus:ring-red-500"
              />
              <input
                type="text"
                name="delivery.zip"
                placeholder="ZIP"
                value={formData.delivery.zip}
                onChange={handleInputChange}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
          <input
            type="text"
            name="delivery.phone"
            placeholder="Contact Phone"
            value={formData.delivery.phone}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Pricing */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">💰 Pricing</h3>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Suggested Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  name="suggestedPrice"
                  placeholder="Optional"
                  value={formData.suggestedPrice}
                  onChange={handleInputChange}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Minimum Acceptable</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  name="minAcceptablePrice"
                  placeholder="Hidden from carriers"
                  value={formData.minAcceptablePrice}
                  onChange={handleInputChange}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Tip: Leave suggested price empty to receive open bids. Minimum acceptable price is never shown to carriers.
          </p>
        </div>
      </div>

      {/* Expiration */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">⏰ When does this expire?</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'eod', label: 'End of Today' },
            { value: '6h', label: '6 Hours' },
            { value: '12h', label: '12 Hours' },
            { value: 'tomorrow', label: 'Tomorrow 5PM' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFormData(prev => ({ ...prev, expirationPreset: opt.value }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                formData.expirationPreset === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Post a LiveLoad</h2>
            <p className="text-orange-100 text-sm">
              Step {step} of 2: {step === 1 ? 'Upload Document' : 'Review & Post'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Content */}
        {step === 1 ? renderUploadStep() : renderReviewStep()}

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium"
            >
              ← Back
            </button>
          )}
          {step === 1 && <div />}
          
          {step === 2 && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon />
                  Posting...
                </>
              ) : (
                <>
                  Post LiveLoad
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
