// EnhancedUploadSystem.js - Complete file with proper imports and exports
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp, addDoc, collection } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db, storage } from '../firebase'; // Adjust path as needed

// Upload Queue Manager Hook
const useUploadQueue = (tenantId, driver) => {
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [uploadProgress, setUploadProgress] = useState({});
  const retryTimeouts = useRef(new Map());
  const activeUploads = useRef(new Set());

  // Helper function for audit logging
  const logAudit = async ({ userId, userEmail, action, targetType, targetId, details, tenantId }) => {
    try {
      await addDoc(collection(db, "auditLogs"), {
        userId, userEmail, action, targetType, targetId, details,
        tenantId,
        timestamp: serverTimestamp()
      });
    } catch (e) { 
      console.error("Audit log error:", e); 
    }
  };

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log("🌐 Network connection restored - resuming uploads");
      processQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log("📵 Network connection lost - uploads will resume when connection returns");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Create upload item with retry logic
  const createUploadItem = (loadId, type, file, metadata = {}) => {
    const uploadId = `${loadId}_${type}_${file.name}_${Date.now()}`;
    return {
      id: uploadId,
      loadId,
      type,
      file,
      metadata,
      status: 'pending', // pending, uploading, completed, failed, retrying
      progress: 0,
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
      lastAttempt: null,
      error: null
    };
  };

  // Add files to upload queue
  const addToQueue = useCallback((loadId, type, files, metadata = {}) => {
    const newItems = files.map(file => createUploadItem(loadId, type, file, metadata));
    
    setUploadQueue(prev => [...prev, ...newItems]);
    
    // Start processing if online
    if (isOnline) {
      setTimeout(processQueue, 100);
    }
    
    return newItems.map(item => item.id);
  }, [isOnline]);

  // Get location data with timeout
  const getGeoLocation = async (timeout = 10000) => {
    if (!navigator.geolocation) return null;
    
    try {
      const position = await Promise.race([
        new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { 
            timeout: timeout / 2, 
            enableHighAccuracy: true 
          });
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Geolocation timeout')), timeout)
        )
      ]);
      
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
    } catch (error) {
      console.warn("Geolocation error:", error.message);
      return null;
    }
  };

  // Upload single item with retry logic
  const uploadItem = async (item) => {
    if (activeUploads.current.has(item.id)) {
      return; // Already uploading
    }

    activeUploads.current.add(item.id);
    
    try {
      // Update status to uploading
      setUploadQueue(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, status: 'uploading', lastAttempt: new Date(), attempts: i.attempts + 1 }
          : i
      ));

      const progressKey = item.id;
      setUploadProgress(prev => ({ ...prev, [progressKey]: 0 }));

      // Generate unique filename and storage path
      const uniqueFileName = `${uuidv4()}-${item.file.name}`;
      const storagePath = `load_photos/${tenantId}/${item.loadId}/${item.type}/${uniqueFileName}`;
      const storageRefVal = ref(storage, storagePath);

      // Get location data FIRST (but don't block upload if it fails)
      let locationData = null;
      try {
        locationData = await getGeoLocation(3000); // Shorter timeout
      } catch (locationError) {
        console.warn("Location unavailable for upload, proceeding without it:", locationError.message);
      }

      // Create upload task with resume capability
      const uploadTask = uploadBytesResumable(storageRefVal, item.file, {
        cacheControl: 'public,max-age=3600'
      });

      // Promise wrapper for upload with progress tracking
      const uploadPromise = new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(prev => ({ ...prev, [progressKey]: progress }));
            
            // Update queue item progress
            setUploadQueue(prev => prev.map(i => 
              i.id === item.id ? { ...i, progress } : i
            ));
          },
          (error) => {
            console.error(`Upload error for ${item.file.name}:`, error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (urlError) {
              reject(urlError);
            }
          }
        );
      });

      // Wait for upload completion
      const downloadURL = await uploadPromise;

      // Prepare metadata
      const photoMetadata = {
        url: downloadURL,
        name: item.file.name,
        size: item.file.size,
        type: item.file.type,
        uploadedAt: Timestamp.now(),
        clientTimestamp: new Date().toISOString(),
        tenantId,
        uploadId: item.id,
        ...(locationData && { location: locationData }),
        ...item.metadata
      };

      // Update Firestore with retry logic
      await updateFirestoreWithRetry(item.loadId, item.type, photoMetadata);

      // Mark as completed
      setUploadQueue(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, status: 'completed', progress: 100, downloadURL }
          : i
      ));

      setUploadProgress(prev => ({ ...prev, [progressKey]: 'Completed' }));

      // Log audit
      await logAudit({
        userId: driver?.id || 'driver_portal_action',
        userEmail: driver?.email || 'N/A',
        action: `upload_${item.type}_photo`,
        targetType: "load",
        targetId: item.loadId,
        details: {
          photoName: item.file.name,
          photoUrl: downloadURL,
          location: locationData || "Not available",
          uploadId: item.id
        },
        tenantId
      });

    } catch (error) {
      console.error(`Upload failed for ${item.file.name}:`, error);
      
      // Determine if we should retry
      const shouldRetry = item.attempts < item.maxAttempts && (
        error.code === 'storage/retry-limit-exceeded' ||
        error.code === 'storage/network-error' ||
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        !navigator.onLine
      );

      if (shouldRetry) {
        // Schedule retry with exponential backoff
        const retryDelay = Math.min(1000 * Math.pow(2, item.attempts), 30000); // Max 30 seconds
        
        setUploadQueue(prev => prev.map(i => 
          i.id === item.id 
            ? { ...i, status: 'retrying', error: error.message }
            : i
        ));

        setUploadProgress(prev => ({ 
          ...prev, 
          [item.id]: `Retrying in ${Math.round(retryDelay/1000)}s (${item.attempts}/${item.maxAttempts})` 
        }));

        const timeoutId = setTimeout(() => {
          retryTimeouts.current.delete(item.id);
          if (navigator.onLine) {
            uploadItem(item);
          }
        }, retryDelay);

        retryTimeouts.current.set(item.id, timeoutId);
      } else {
        // Mark as permanently failed
        setUploadQueue(prev => prev.map(i => 
          i.id === item.id 
            ? { ...i, status: 'failed', error: error.message }
            : i
        ));

        setUploadProgress(prev => ({ 
          ...prev, 
          [item.id]: `Failed: ${error.message}` 
        }));
      }
    } finally {
      activeUploads.current.delete(item.id);
    }
  };

  // Update Firestore with retry logic
  const updateFirestoreWithRetry = async (loadId, type, photoMetadata, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const loadDocRef = doc(db, "loads", loadId);
        const updateField = type === 'pickup' ? 'pickupPhotosMetadata' : 'deliveryPhotosMetadata';
        
        const loadDocSnap = await getDoc(loadDocRef);
        if (!loadDocSnap.exists()) {
          throw new Error("Load document not found");
        }
        
        const existingLoadData = loadDocSnap.data();
        const existingPhotos = existingLoadData[updateField] || [];
        
        await updateDoc(loadDocRef, {
          [updateField]: [...existingPhotos, photoMetadata],
          updatedAt: serverTimestamp()
        });
        
        return; // Success
      } catch (error) {
        console.error(`Firestore update attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  };

  // Process upload queue
  const processQueue = useCallback(async () => {
    if (!isOnline || !tenantId) return;

    const pendingItems = uploadQueue.filter(item => 
      item.status === 'pending' || item.status === 'retrying'
    );

    // Limit concurrent uploads to prevent overwhelming the connection
    const maxConcurrent = 2;
    const currentlyUploading = Array.from(activeUploads.current).length;
    const canStart = maxConcurrent - currentlyUploading;

    const itemsToStart = pendingItems.slice(0, canStart);
    
    itemsToStart.forEach(item => {
      uploadItem(item);
    });
  }, [uploadQueue, isOnline, tenantId]);

  // Process queue when online status changes or queue updates
  useEffect(() => {
    if (isOnline && uploadQueue.some(item => item.status === 'pending' || item.status === 'retrying')) {
      processQueue();
    }
  }, [isOnline, uploadQueue.length, processQueue]);

  // Retry failed uploads
  const retryFailedUploads = useCallback(() => {
    setUploadQueue(prev => prev.map(item => 
      item.status === 'failed' 
        ? { ...item, status: 'pending', attempts: 0, error: null }
        : item
    ));
  }, []);

  // Remove completed uploads from queue (cleanup)
  const clearCompleted = useCallback(() => {
    setUploadQueue(prev => prev.filter(item => item.status !== 'completed'));
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      uploadQueue.forEach(item => {
        if (item.status === 'completed') {
          delete newProgress[item.id];
        }
      });
      return newProgress;
    });
  }, [uploadQueue]);

  // Get queue statistics
  const getQueueStats = useCallback(() => {
    const stats = uploadQueue.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    
    return {
      total: uploadQueue.length,
      pending: stats.pending || 0,
      uploading: stats.uploading || 0,
      completed: stats.completed || 0,
      failed: stats.failed || 0,
      retrying: stats.retrying || 0
    };
  }, [uploadQueue]);

  return {
    addToQueue,
    uploadQueue,
    uploadProgress,
    isOnline,
    retryFailedUploads,
    clearCompleted,
    getQueueStats,
    processQueue
  };
};

// Enhanced File Upload Component
const EnhancedFileUpload = ({ loadId, type, onUploadComplete, tenantId, driver }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const { 
    addToQueue, 
    uploadQueue, 
    uploadProgress, 
    isOnline, 
    retryFailedUploads, 
    clearCompleted, 
    getQueueStats 
  } = useUploadQueue(tenantId, driver);

  const stats = getQueueStats();

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
  };

  const handleUpload = () => {
    if (selectedFiles.length === 0) return;
    
    const uploadIds = addToQueue(loadId, type, selectedFiles);
    setSelectedFiles([]);
    
    // Clear the file input
    const fileInput = document.getElementById(`${type}-photos-${loadId}`);
    if (fileInput) fileInput.value = '';
    
    if (onUploadComplete) {
      onUploadComplete(uploadIds);
    }
  };

  // Filter queue items for this specific load and type
  const relevantItems = uploadQueue.filter(item => 
    item.loadId === loadId && item.type === type
  );

  return (
    <div className="space-y-3">
      {/* Network Status Indicator */}
      <div className={`flex items-center gap-2 text-sm ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
        {isOnline ? 'Online - uploads will proceed' : 'Offline - uploads queued for when connection returns'}
      </div>

      {/* File Selection */}
      <div>
        <label htmlFor={`${type}-photos-${loadId}`} className="block text-sm font-medium text-gray-700 mb-1">
          Upload {type.charAt(0).toUpperCase() + type.slice(1)} Photos (BOL, damage, etc.):
        </label>
        <input 
          type="file" 
          id={`${type}-photos-${loadId}`}
          multiple 
          accept="image/*,.pdf" 
          onChange={handleFileSelect} 
          className="input-file-styling"
        />
      </div>

      {/* Upload Button */}
      {selectedFiles.length > 0 && (
        <button 
          onClick={handleUpload} 
          className="btn-green"
          disabled={!tenantId}
        >
          {isOnline ? 'Upload' : 'Queue for Upload'} {selectedFiles.length} File(s)
        </button>
      )}

      {/* Queue Status */}
      {stats.total > 0 && (
        <div className="bg-gray-50 p-3 rounded-md border">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium">Upload Status</h4>
            <div className="flex gap-2">
              {stats.failed > 0 && (
                <button onClick={retryFailedUploads} className="text-xs text-red-600 hover:underline">
                  Retry Failed ({stats.failed})
                </button>
              )}
              {stats.completed > 0 && (
                <button onClick={clearCompleted} className="text-xs text-gray-600 hover:underline">
                  Clear Completed ({stats.completed})
                </button>
              )}
            </div>
          </div>
          
          <div className="text-xs text-gray-600 grid grid-cols-2 gap-2">
            <span>✓ Completed: {stats.completed}</span>
            <span>📤 Uploading: {stats.uploading}</span>
            <span>⏳ Pending: {stats.pending}</span>
            <span>🔄 Retrying: {stats.retrying}</span>
            {stats.failed > 0 && <span className="text-red-600">❌ Failed: {stats.failed}</span>}
          </div>
        </div>
      )}

      {/* Individual Upload Progress */}
      {relevantItems.length > 0 && (
        <div className="space-y-2">
          {relevantItems.map(item => (
            <div key={item.id} className="flex items-center justify-between text-xs bg-white p-2 rounded border">
              <span className="truncate flex-1 mr-2">{item.file.name}</span>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  item.status === 'completed' ? 'bg-green-100 text-green-700' :
                  item.status === 'uploading' ? 'bg-blue-100 text-blue-700' :
                  item.status === 'failed' ? 'bg-red-100 text-red-700' :
                  item.status === 'retrying' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {item.status === 'uploading' ? `${item.progress.toFixed(0)}%` : item.status}
                </span>
                {uploadProgress[item.id] && typeof uploadProgress[item.id] === 'string' && (
                  <span className="text-gray-500">{uploadProgress[item.id]}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Export the components
export { useUploadQueue, EnhancedFileUpload };