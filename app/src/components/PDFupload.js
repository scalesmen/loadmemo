// src/components/PDFupload.js
import React, { useRef, useState } from "react";
import { getStorage, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { getAuth } from "firebase/auth";

/**
 * PDFupload component - optimized version
 * 
 * CHANGES:
 * - Removed internal auth state management (no more useEffect)
 * - Accepts loggedInUser as prop from parent
 * - No conditional rendering based on auth (parent handles this)
 * - Cleaner, faster, no flashing buttons
 */
export default function PDFupload({
  onProcessingComplete,
  onUploadStart,
  onUploadError,
  loggedInUser, // NEW: Receive user from parent
  disabled = false // NEW: Allow parent to disable
}) {
  const fileInput = useRef();
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Import PDF");

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    console.log("PDFupload: File selected:", file);
    if (!file) {
      console.log("PDFupload: No file selected.");
      return;
    }

    // Check if user is authenticated and has tenantId
    if (!loggedInUser) {
      setStatusMessage("Authentication Error");
      const authErrorMsg = "User not authenticated. Please log in to upload.";
      console.error("PDFupload: User not authenticated.", authErrorMsg);
      if (onProcessingComplete) onProcessingComplete({ data: null, error: authErrorMsg });
      return;
    }

    if (!loggedInUser.tenantId) {
      setStatusMessage("Tenant Error");
      const tenantErrorMsg = "User account not properly configured. Missing tenant information.";
      console.error("PDFupload: User missing tenantId.", tenantErrorMsg);
      if (onProcessingComplete) onProcessingComplete({ data: null, error: tenantErrorMsg });
      return;
    }

    setIsLoading(true);
    if (onUploadStart) onUploadStart();
    setStatusMessage("Uploading...");
    console.log("PDFupload: Upload starting for tenantId:", loggedInUser.tenantId);

    try {
      const storage = getStorage();
      console.log("PDFupload: Storage instance obtained.");

      // Include tenantId in the file path for better organization
      const uniqueFileName = `${new Date().getTime()}-${file.name}`;
      const filePathInStorage = `pdf-forms-for-processing/${loggedInUser.tenantId}/${uniqueFileName}`;
      console.log("PDFupload: File path in Storage with tenantId:", filePathInStorage);

      const sRef = storageRef(storage, filePathInStorage);
      console.log("PDFupload: Storage reference created:", sRef);

      const uploadTask = uploadBytesResumable(sRef, file);
      console.log("PDFupload: Upload task created.");

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('PDFupload: Upload progress: ' + progress + '% done');
          setStatusMessage(`Uploading: ${progress.toFixed(0)}%`);
        },
        (error) => {
          console.error("PDFupload: Firebase Storage Upload Error:", error);
          console.error("PDFupload: Storage Error Code:", error.code);
          console.error("PDFupload: Storage Error Message:", error.message);
          
          setStatusMessage("Upload Failed!");
          setIsLoading(false);
          if (onUploadError) {
            onUploadError("Storage Upload Failed: " + error.message + ` (Code: ${error.code})`);
          } else if (onProcessingComplete) {
            onProcessingComplete({ data: null, error: "Storage Upload Failed: " + error.message + ` (Code: ${error.code})` });
          }
        },
        // This is the success callback for the uploadTask
        async () => {
          console.log("PDFupload: Upload to Firebase Storage completed successfully.");
          setStatusMessage("Processing with AI...");

          try {
            const auth = getAuth();
            const currentUser = auth.currentUser;

            if (!currentUser) {
              setIsLoading(false);
              setStatusMessage("Authentication Error");
              const authErrorMsg = "User not authenticated. Please log in to upload.";
              console.error("PDFupload: User not authenticated for Cloud Function call.", authErrorMsg);
              if (onProcessingComplete) onProcessingComplete({ data: null, error: authErrorMsg });
              return;
            }

            // Get the ID token
            const idToken = await currentUser.getIdToken(/* forceRefresh */ true);
            console.log("PDFupload: ID Token obtained for Cloud Function call.");

            // Updated Cloud Function call with tenantId AND commodityType
            console.log("PDFupload: Calling Cloud Function with tenantId:", loggedInUser.tenantId, "and commodityType:", loggedInUser.commodityType);
            const res = await fetch("https://us-central1-truckmemo2.cloudfunctions.net/parsePdfToLoad", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
              },
              body: JSON.stringify({
                filePathInStorage: filePathInStorage,
                originalFileName: file.name,
                tenantId: loggedInUser.tenantId,
                userId: loggedInUser.uid,
                userEmail: loggedInUser.email,
                commodityType: loggedInUser.commodityType || 'auto'
              })
            });

            setIsLoading(false); 

            if (!res.ok) {
              let errorData;
              try {
                errorData = await res.json();
              } catch (e) {
                errorData = { error: `Cloud function request failed with status: ${res.status}, ${await res.text()}` };
              }
              setStatusMessage("AI Error");
              console.error("PDFupload: Cloud function error response:", errorData);
              if (onProcessingComplete) onProcessingComplete({ data: null, error: errorData.error || "AI processing failed." });
              return;
            }

            const loadData = await res.json();
            console.log("PDFupload: Data received from cloud function:", loadData);
            
            // Validate that returned data has correct tenantId (security check)
            if (loadData && loadData.tenantId && loadData.tenantId !== loggedInUser.tenantId) {
              console.error("PDFupload: TenantId mismatch in returned data. Expected:", loggedInUser.tenantId, "Got:", loadData.tenantId);
              setStatusMessage("Security Error");
              if (onProcessingComplete) onProcessingComplete({ 
                data: null, 
                error: "Security validation failed. Data tenant mismatch." 
              });
              return;
            }

            setStatusMessage("Import PDF"); 
            if (onProcessingComplete) onProcessingComplete({ data: loadData, error: null });

          } catch (cloudFuncError) {
            setIsLoading(false);
            setStatusMessage("Network Error with CF");
            console.error("PDFupload: Error calling parsePdfToLoad Cloud Function:", cloudFuncError);
            if (onProcessingComplete) onProcessingComplete({ data: null, error: "Network or AI Processing Error: " + cloudFuncError.message });
          }
        }
      );
    } catch (uploadInitError) {
      setIsLoading(false);
      setStatusMessage("Upload Init Error");
      console.error("PDFupload: Error initiating PDF upload process:", uploadInitError);
      if (onUploadError) {
        onUploadError("PDF upload setup error: " + uploadInitError.message);
      } else if (onProcessingComplete) {
        onProcessingComplete({ data: null, error: "PDF upload setup error: " + uploadInitError.message });
      }
    }
  };

  // Simple render - no conditional logic based on auth
  // Parent component decides whether to show this button
  return (
    <div>
      <button
        type="button"
        className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm disabled:bg-indigo-300 transition-colors"
        onClick={() => fileInput.current.click()}
        disabled={isLoading || disabled}
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            {statusMessage}
          </>
        ) : (
          <>
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
            </svg>
            {statusMessage}
          </>
        )}
      </button>
      <input
        type="file"
        ref={fileInput}
        className="hidden"
        accept="application/pdf"
        onChange={handleFileChange}
        disabled={isLoading || disabled}
      />
    </div>
  );
}