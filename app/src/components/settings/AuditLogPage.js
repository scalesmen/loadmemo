import React, { useEffect, useState } from 'react';
import { db, auth } from '../../firebase'; // Adjust path if needed
import { applyOwnerImpersonation } from '../../utils/impersonation';
import { collection, onSnapshot, query, orderBy, limit, doc, Timestamp, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// Helper function to format log details for display
const formatLogDetails = (log, allDrivers = [], allTrucks = [], allDispatchers = []) => {
  if (!log.details || Object.keys(log.details).length === 0) {
    return <span className="italic text-gray-400">No specific details logged.</span>;
  }

  const details = log.details;
  let detailLines = [];

  // UPDATED: Show tenant info if available
  if (details.tenantId && log.tenantId !== details.tenantId) {
    detailLines.push(<div key="tenant" className="font-semibold text-blue-600">Tenant: {details.tenantId}</div>);
  }

  if (details.loadIdDisplay) {
    detailLines.push(<div key="loadId" className="font-semibold">Load: {details.loadIdDisplay}</div>);
  } else if (details.updatedUserEmail || details.invitedUserEmail || details.disabledUserEmail || details.toggledUserEmail || details.updatedUserName) {
    detailLines.push(<div key="userId" className="font-semibold">User: {details.updatedUserEmail || details.invitedUserEmail || details.disabledUserEmail || details.toggledUserEmail || details.updatedUserName}</div>);
  } else if (details.companyName || details.deletedCompanyName) {
    detailLines.push(<div key="companyId" className="font-semibold">Company: {details.companyName || details.deletedCompanyName}</div>);
  } else if (details.typeName || details.deletedTypeName) {
    detailLines.push(<div key="adjTypeId" className="font-semibold">Adjustment Type: {details.typeName || details.deletedTypeName}</div>);
  } else if (details.driverName) {
    detailLines.push(<div key="driverNameHeader" className="font-semibold">Driver: {details.driverName}</div>);
  } else if (details.unitNumber) {
    detailLines.push(<div key="truckNumHeader" className="font-semibold">Truck: {details.unitNumber}</div>);
  } else if (details.brokerName) {
    detailLines.push(<div key="brokerNameHeader" className="font-semibold">Broker: {details.brokerName}</div>);
  }

  // Helper to format date values
  const formatDateValue = (value) => {
    if (!value) return 'N/A';
    try {
      const date = new Date(value);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return value;
    }
  };

  switch (log.action) {
    // NEW: Handle actual pickup date changes
    case "ACTUAL_PICKUP_DATE_CHANGED":
      detailLines.push(
        <div key="actualPU" className="bg-orange-50 border border-orange-200 rounded p-2 mt-1">
          <div className="font-semibold text-orange-700 mb-1">⚠️ Manual Actual Pickup Date Change</div>
          <div className="text-xs space-y-1">
            <div>Previous: <span className="font-medium">{formatDateValue(details.oldValue)}</span></div>
            <div>New: <span className="font-medium text-blue-700">{formatDateValue(details.newValue)}</span></div>
            <div className="text-gray-500 mt-1">Confirmed by: {details.confirmedBy}</div>
          </div>
        </div>
      );
      break;

    // NEW: Handle actual delivery date changes
    case "ACTUAL_DELIVERY_DATE_CHANGED":
      detailLines.push(
        <div key="actualDEL" className="bg-orange-50 border border-orange-200 rounded p-2 mt-1">
          <div className="font-semibold text-orange-700 mb-1">⚠️ Manual Actual Delivery Date Change</div>
          <div className="text-xs space-y-1">
            <div>Previous: <span className="font-medium">{formatDateValue(details.oldValue)}</span></div>
            <div>New: <span className="font-medium text-blue-700">{formatDateValue(details.newValue)}</span></div>
            <div className="text-gray-500 mt-1">Confirmed by: {details.confirmedBy}</div>
          </div>
        </div>
      );
      break;

    case "LOAD_CREATED":
      if (details.broker) detailLines.push(<div key="broker">Broker: {details.broker}</div>);
      if (typeof details.amount !== 'undefined') detailLines.push(<div key="amount">Amount: ${details.amount.toLocaleString()}</div>);
      break;
    case "LOAD_UPDATED":
      if (details.changes && Object.keys(details.changes).length > 0) {
        detailLines.push(<div key="changesTitle" className="font-medium mt-1">Changes:</div>);
        for (const field in details.changes) {
          let oldValueDisplay = details.changes[field].oldValue;
          let newValueDisplay = details.changes[field].newValue;

          if (field === "driverId") {
            oldValueDisplay = allDrivers.find(d => d.id === oldValueDisplay)?.name || oldValueDisplay || "N/A";
            newValueDisplay = allDrivers.find(d => d.id === newValueDisplay)?.name || newValueDisplay || "N/A";
          } else if (field === "truckId") {
            oldValueDisplay = allTrucks.find(t => t.id === oldValueDisplay)?.unitNumber || oldValueDisplay || "N/A";
            newValueDisplay = allTrucks.find(t => t.id === newValueDisplay)?.unitNumber || newValueDisplay || "N/A";
          } else if (field === "dispatcherId") {
            oldValueDisplay = allDispatchers.find(d => d.id === oldValueDisplay)?.name || oldValueDisplay || "N/A";
            newValueDisplay = allDispatchers.find(d => d.id === newValueDisplay)?.name || newValueDisplay || "N/A";
          }

          oldValueDisplay = (oldValueDisplay === null || oldValueDisplay === undefined || oldValueDisplay === "") ? "[empty]" : String(oldValueDisplay);
          newValueDisplay = (newValueDisplay === null || newValueDisplay === undefined || newValueDisplay === "") ? "[empty]" : String(newValueDisplay);

          detailLines.push(<div key={field} className="ml-2">{`- ${field}: "${oldValueDisplay}" → "${newValueDisplay}"`}</div>);
        }
      } else {
        detailLines.push(<div key="noChanges" className="italic">Saved, but no specific field changes were logged in 'changes' object.</div>);
      }
      break;
    case "LOAD_STATUS_CHANGED":
      if(details.loadIdDisplay && details.loadIdDisplay !== log.targetId) detailLines.push(<div key="statusLoadId">Load ID: {details.loadIdDisplay}</div>);
      detailLines.push(<div key="statusChange">{`Status: "${details.oldStatus || 'N/A'}" → "${details.newStatus || 'N/A'}"`}</div>);
      break;
    case "LOAD_DRIVER_CHANGED":
      if(details.loadIdDisplay && details.loadIdDisplay !== log.targetId) detailLines.push(<div key="driverLoadId">Load ID: {details.loadIdDisplay}</div>);
      const oldDriverName = allDrivers.find(d => d.id === details.oldDriverId)?.name || details.oldDriverId || "N/A";
      const newDriverName = allDrivers.find(d => d.id === details.newDriverId)?.name || details.newDriverId || "N/A";
      detailLines.push(<div key="driverChange">{`Driver: "${oldDriverName}" → "${newDriverName}"`}</div>);
      break;
    case "LOAD_TRUCK_CHANGED":
      if(details.loadIdDisplay && details.loadIdDisplay !== log.targetId) detailLines.push(<div key="truckLoadId">Load ID: {details.loadIdDisplay}</div>);
      const oldTruckUnit = allTrucks.find(t => t.id === details.oldTruckId)?.unitNumber || details.oldTruckId || "N/A";
      const newTruckUnit = allTrucks.find(t => t.id === details.newTruckId)?.unitNumber || details.newTruckId || "N/A";
      detailLines.push(<div key="truckChange">{`Truck: "${oldTruckUnit}" → "${newTruckUnit}"`}</div>);
      break;
    case "LOAD_DELETED":
      detailLines.push(<div key="delLoadId">Deleted Load: {details.loadIdDisplay || log.targetId}</div>);
      if(details.deletedLoadData) {
         detailLines.push(<div key="delBroker">(Broker: {details.deletedLoadData.brokerName || 'N/A'}, Amount: ${ (details.deletedLoadData.amount || 0).toLocaleString()})</div>);
      }
      break;
    case "USER_UPDATED":
      if (details.changes && Object.keys(details.changes).length > 0) {
        detailLines.push(<div key="userChangesTitle" className="font-medium mt-1">User Changes:</div>);
        for (const field in details.changes) {
          detailLines.push(
            <div key={field} className="ml-2">{`- ${field}: "${details.changes[field].oldValue === undefined ? 'N/A' : details.changes[field].oldValue}" → "${details.changes[field].newValue}"`}</div>
          );
        }
      }
      break;
    case "USER_INVITED":
    case "USER_INVITE_INITIATED":
    case "USER_CREATED_BY_ADMIN": 
      if(details.invitedUserName || details.createdUserName) detailLines.push(<div key="invitedName">Invited: {details.invitedUserName || details.createdUserName} ({details.invitedUserEmail || details.createdUserEmail})</div>);
      if(details.roleAssigned) detailLines.push(<div key="invitedRole">Role: {details.roleAssigned}, Company: {details.companyAssigned}</div>);
      if(details.initialStatus) detailLines.push(<div key="invitedStatus">Initial Status: {details.initialStatus}</div>);
      break;
    case "USER_DISABLED":
      detailLines.push(<div key="userDisabled">Disabled User: {details.disabledUserEmail}</div>);
      break;
    case "USER_STATUS_TOGGLED":
    case "USER_ACTIVATED":
    case "USER_DEACTIVATED":
      detailLines.push(<div key="userStatusToggle">User: {details.toggledUserEmail}, New Status: {details.newStatus}</div>);
      break;
    case "COMPANY_CREATED":
      if (details.usdot) detailLines.push(<div key="companyUsdot">USDOT: {details.usdot}</div>);
      if (details.mcNumber) detailLines.push(<div key="companyMC">MC#: {details.mcNumber}</div>);
      if (details.taxId) detailLines.push(<div key="companyTaxId">Tax ID: {details.taxId}</div>);
      break;
    case "COMPANY_UPDATED":
      if (details.changes) {
        detailLines.push(<div key="companyChangesTitle">Company Changes:</div>);
        for (const field in details.changes) {
          detailLines.push(
            <div key={field} className="ml-2">{`- ${field}: "${details.changes[field].oldValue === undefined ? 'N/A' : details.changes[field].oldValue}" → "${details.changes[field].newValue}"`}</div>
          );
        }
      }
      break;
    case "COMPANY_DELETED":
      detailLines.push(<div key="companyDeleted">Deleted Name: {details.deletedCompanyName}</div>);
      break;
    case "COMPANY_STATUS_TOGGLED":
      detailLines.push(<div key="companyStatusToggle">New Status: {details.newStatus}</div>);
      break;
    case "ADJUSTMENT_TYPE_CREATED":
      detailLines.push(<div key="adjTypeDetails">Nature: {details.adjustmentNature}, Amount: ${details.amount}</div>);
      break;
    case "ADJUSTMENT_TYPE_UPDATED":
      if (details.changes) {
        detailLines.push(<div key="adjChangesTitle">Adj. Type Changes:</div>);
        for (const field in details.changes) {
          detailLines.push(
            <div key={field} className="ml-2">{`- ${field}: "${details.changes[field].oldValue === undefined ? 'N/A' : details.changes[field].oldValue}" → "${details.changes[field].newValue}"`}</div>
          );
        }
      } else if (details.adjustmentNature || typeof details.amount !== 'undefined') {
        detailLines.push(<div key="adjTypeNoChanges">Nature: {details.adjustmentNature}, Amount: ${details.amount}</div>);
      }
      break;
    case "ADJUSTMENT_TYPE_DELETED":
      detailLines.push(<div key="adjTypeDeleted">Deleted Type: {details.deletedTypeName}</div>);
      break;
    case "USER_COMPENSATION_UPDATED":
      detailLines.push(<div key="userCompType">Type: {details.newCompensation?.salaryType}, Value: ${details.newCompensation?.salaryValue}, Bonus: ${details.newCompensation?.bonus}, Rating: {details.newCompensation?.rating}</div>);
      break;
    case "APP_TIMEZONE_SAVED":
        detailLines.push(<div key="appTimezone">New Default Timezone: {details.defaultTimeZone}</div>);
        break;
    case "API_KEY_GENERATED":
        if(details.description) detailLines.push(<div key="apiKeyDesc">Description: {details.description}</div>);
        detailLines.push(<div key="apiKeyPrefix">Key Prefix: {details.keyPrefix}...</div>);
        break;
    case "API_KEY_REVOKED":
    case "API_KEY_DELETED":
        detailLines.push(<div key="apiKeyPrefixRevoked">Key Prefix: {details.keyPrefix}...</div>);
        break;
    default: {
      // Generic formatter for the many action types that don't have a bespoke
      // case above. `details.changes` shows up in two different shapes across
      // the codebase: a per-field {oldValue, newValue} diff (some load/user/
      // company actions), or a flat snapshot of the new record (driver/truck/
      // broker create-update actions). Render each shape appropriately instead
      // of dumping raw JSON.
      const noisyKeys = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'driverName', 'unitNumber', 'brokerName']);

      const resolveValue = (key, value) => {
        if (value === null || value === undefined || value === '') return '[empty]';
        if (key === 'driverId' || key === 'oldDriverId' || key === 'newDriverId') {
          return allDrivers.find(d => d.id === value)?.name || String(value);
        }
        if (key === 'truckId' || key === 'assignedTruckId' || key === 'oldTruckId' || key === 'newTruckId') {
          return allTrucks.find(t => t.id === value)?.unitNumber || String(value);
        }
        if (key === 'dispatcherId') {
          return allDispatchers.find(d => d.id === value)?.name || String(value);
        }
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') {
          if (typeof value.toDate === 'function') return formatDateValue(value.toDate());
          return JSON.stringify(value);
        }
        return String(value);
      };

      const changes = details.changes;
      if (changes && typeof changes === 'object' && Object.keys(changes).length > 0) {
        const isDiffShape = Object.values(changes).every(
          v => v && typeof v === 'object' && !Array.isArray(v) &&
               Object.keys(v).every(k => k === 'oldValue' || k === 'newValue')
        );

        detailLines.push(<div key="changesTitle" className="font-medium mt-1">{isDiffShape ? 'Changes:' : 'Saved data:'}</div>);
        for (const field in changes) {
          if (isDiffShape) {
            const oldVal = resolveValue(field, changes[field].oldValue);
            const newVal = resolveValue(field, changes[field].newValue);
            detailLines.push(<div key={field} className="ml-2">{`- ${field}: "${oldVal}" → "${newVal}"`}</div>);
          } else {
            if (noisyKeys.has(field)) continue;
            detailLines.push(<div key={field} className="ml-2">{`- ${field}: ${resolveValue(field, changes[field])}`}</div>);
          }
        }
      }

      // Any other top-level detail fields outside `changes`
      for (const key in details) {
        if (key === 'tenantId' || key === 'changes' || noisyKeys.has(key)) continue;
        detailLines.push(<div key={key} className="ml-2 text-gray-600">{`${key}: ${resolveValue(key, details[key])}`}</div>);
      }
      break;
    }
  }

  if (detailLines.length === 0 && log.action) {
     return <span className="italic text-gray-400">Details logged but not formatted for action: {log.action}.</span>;
  }
  if (detailLines.length === 0) {
    return <span className="italic text-gray-400">No specific details formatted.</span>;
  }

  return (
    <div className="text-xs">
      {detailLines}
    </div>
  );
};

function get24HoursAgoTimestamp() {
  const now = new Date();
  return Timestamp.fromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}
// Helper to get a human-readable target identifier
const getDisplayTargetId = (log) => {
  if (log.targetType === 'Load' || log.targetType === 'load') {
    return log.details?.loadIdDisplay || log.targetId;
  }
  if (log.targetType === 'User' || log.targetType === 'user') {
    return log.details?.updatedUserEmail || log.details?.invitedUserEmail || log.details?.disabledUserEmail || log.details?.toggledUserEmail || log.targetId;
  }
  if (log.targetType === 'Company' || log.targetType === 'company') {
    return log.details?.companyName || log.details?.deletedCompanyName || log.targetId;
  }
  if (log.targetType === 'AdjustmentType') {
    return log.details?.typeName || log.details?.deletedTypeName || log.targetId;
  }
  return log.targetId;
};

// Helper to get action badge color
const getActionBadgeColor = (action) => {
  if (action.includes('ACTUAL_PICKUP_DATE_CHANGED') || action.includes('ACTUAL_DELIVERY_DATE_CHANGED')) {
    return 'bg-orange-100 text-orange-800 border-orange-300';
  }
  if (action.includes('CREATED')) return 'bg-green-100 text-green-800 border-green-300';
  if (action.includes('DELETED')) return 'bg-red-100 text-red-800 border-red-300';
  if (action.includes('UPDATED') || action.includes('CHANGED')) return 'bg-blue-100 text-blue-800 border-blue-300';
  return 'bg-gray-100 text-gray-800 border-gray-300';
};

export default function AuditLogPage({ tenantId: propTenantId }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [currentTenantId, setCurrentTenantId] = useState(propTenantId);
  const [showArchive, setShowArchive] = useState(false);
  const [allDrivers, setAllDrivers] = useState([]); 
  const [allTrucks, setAllTrucks] = useState([]);   
  const [allDispatchers, setAllDispatchers] = useState([]);
  const [permissionError, setPermissionError] = useState(null);
  const [error, setError] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState('current');
  const [actionFilter, setActionFilter] = useState('all');

  // UPDATED: Get current logged-in user profile and extract tenant
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = applyOwnerImpersonation({ uid: user.uid, email: user.email, ...docSnap.data() });
            setLoggedInUser(userData);
            
            // UPDATED: Set tenant ID from user data if not provided as prop
            if (!propTenantId && userData.tenantId) {
              setCurrentTenantId(userData.tenantId);
            } else if (!propTenantId && userData.assignedCompanyId) {
              setCurrentTenantId(userData.assignedCompanyId);
            } else if (!propTenantId && userData.assignedCompanyName) {
              setCurrentTenantId(`tenant_${userData.assignedCompanyName.toLowerCase().replace(/\s+/g, '_')}`);
            }
          } else {
            console.warn("AuditLogPage: User profile not found, cannot verify permissions.");
            setLoggedInUser({ uid: user.uid, email: user.email, role: null });
            setPermissionError("User profile not found. Cannot verify permissions.");
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
        setCurrentTenantId(null);
        setIsLoading(false); 
      }
    });
    return unsubscribe;
  }, [propTenantId]);

  // UPDATED: Fetch drivers, trucks, and dispatchers with tenant filtering
  useEffect(() => {
    if (!loggedInUser || !["Super Admin", "Admin"].includes(loggedInUser.role)) {
        setAllDrivers([]);
        setAllTrucks([]);
        setAllDispatchers([]);
        if (loggedInUser) {
            setPermissionError("You do not have permission to view the audit log.");
        }
        setIsLoading(false);
        return;
    }

    if (!currentTenantId) {
      console.warn("AuditLogPage: No tenant ID available, skipping reference data fetch");
      setAllDrivers([]);
      setAllTrucks([]);
      setAllDispatchers([]);
      return;
    }

    setPermissionError(null);

    // UPDATED: Create tenant-aware queries for reference data
    const driversQuery = loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant"
      ? query(collection(db, "drivers"), orderBy("name", "asc"))
      : query(collection(db, "drivers"), where("tenantId", "==", currentTenantId), orderBy("name", "asc"));

    const trucksQuery = loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant"
      ? query(collection(db, "trucks"), orderBy("unitNumber", "asc"))
      : query(collection(db, "trucks"), where("tenantId", "==", currentTenantId), orderBy("unitNumber", "asc"));

    const dispatchersQuery = loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant"
      ? query(collection(db, "users"), where("role", "==", "Dispatcher"))
      : query(collection(db, "users"), where("role", "==", "Dispatcher"), where("tenantId", "==", currentTenantId));

    const unsubDrivers = onSnapshot(driversQuery, (snapshot) => {
      setAllDrivers(snapshot.docs.map(d => ({ id: d.id, name: d.data().name, tenantId: d.data().tenantId })));
    }, err => { 
      console.error("Error fetching drivers for audit log:", err); 
      setError("Could not load driver names for details."); 
    });

    const unsubTrucks = onSnapshot(trucksQuery, (snapshot) => {
      setAllTrucks(snapshot.docs.map(t => ({ id: t.id, unitNumber: t.data().unitNumber, tenantId: t.data().tenantId })));
    }, err => { 
      console.error("Error fetching trucks for audit log:", err); 
      setError("Could not load truck numbers for details."); 
    });

    const unsubDispatchers = onSnapshot(dispatchersQuery, (snapshot) => {
      setAllDispatchers(snapshot.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().email,
        tenantId: d.data().tenantId
      })));
    }, err => { 
      console.error("Error fetching dispatchers for audit log:", err); 
      setError("Could not load dispatcher names for details."); 
    });

    return () => { unsubDrivers(); unsubTrucks(); unsubDispatchers(); };
  }, [loggedInUser, currentTenantId]);

  // UPDATED: Fetch audit logs with tenant filtering
  useEffect(() => {
    if (!loggedInUser || permissionError) {
        setLogs([]);
        if (!loggedInUser && !auth.currentUser) setIsLoading(false);
        else if (permissionError) setIsLoading(false);
        return;
    }

    if (!currentTenantId) {
      console.warn("AuditLogPage: No tenant ID available, skipping audit log fetch");
      setLogs([]);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);

    let q;
    const timestamp24HoursAgo = get24HoursAgoTimestamp();

    // UPDATED: Create tenant-aware audit log queries
    if (loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant") {
      // Super admin can see all logs or filter by specific tenant
      if (selectedTenant === 'all') {
        // Show all logs across all tenants
        if (!showArchive) {
          q = query(
            collection(db, "auditLogs"),
            where("timestamp", ">=", timestamp24HoursAgo),
            orderBy("timestamp", "desc")
          );
        } else {
          q = query(
            collection(db, "auditLogs"),
            orderBy("timestamp", "desc"),
            limit(400)
          );
        }
      } else if (selectedTenant === 'current') {
        // Show logs for super admin's current tenant
        if (!showArchive) {
          q = query(
            collection(db, "auditLogs"),
            where("tenantId", "==", currentTenantId),
            where("timestamp", ">=", timestamp24HoursAgo),
            orderBy("timestamp", "desc")
          );
        } else {
          q = query(
            collection(db, "auditLogs"),
            where("tenantId", "==", currentTenantId),
            orderBy("timestamp", "desc"),
            limit(400)
          );
        }
      } else {
        // Show logs for specific selected tenant
        if (!showArchive) {
          q = query(
            collection(db, "auditLogs"),
            where("tenantId", "==", selectedTenant),
            where("timestamp", ">=", timestamp24HoursAgo),
            orderBy("timestamp", "desc")
          );
        } else {
          q = query(
            collection(db, "auditLogs"),
            where("tenantId", "==", selectedTenant),
            orderBy("timestamp", "desc"),
            limit(400)
          );
        }
      }
    } else {
      // Regular admin/user - only see their tenant's logs
      if (!showArchive) {
        q = query(
          collection(db, "auditLogs"),
          where("tenantId", "==", currentTenantId),
          where("timestamp", ">=", timestamp24HoursAgo),
          orderBy("timestamp", "desc")
        );
      } else {
        q = query(
          collection(db, "auditLogs"),
          where("tenantId", "==", currentTenantId),
          orderBy("timestamp", "desc"),
          limit(400)
        );
      }
    }

    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(logsData);
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching audit logs: ", err);
      if (err.code === 'failed-precondition' && err.message.includes('index')) {
        setError(`Firestore query requires an index. Please create it. Query details: collection 'auditLogs', field 'timestamp' descending, and 'timestamp' >= filter with tenantId filter.`);
      } else {
        setError("Failed to fetch audit logs.");
      }
      setLogs([]);
      setIsLoading(false);
    });
    return unsubscribeLogs;
  }, [loggedInUser, showArchive, permissionError, currentTenantId, selectedTenant]);

  // Filter logs by action type
  const filteredLogs = actionFilter === 'all' 
    ? logs 
    : logs.filter(log => {
        if (actionFilter === 'date_changes') {
          return log.action === 'ACTUAL_PICKUP_DATE_CHANGED' || log.action === 'ACTUAL_DELIVERY_DATE_CHANGED';
        }
        return log.action.includes(actionFilter.toUpperCase());
      });

  if (isLoading) { 
    return <div className="p-6 text-center text-gray-500">Loading audit logs...</div>;
  }

  if (permissionError) {
    return (
      <div className="max-w-6xl mx-auto py-4 px-1 sm:px-6 lg:px-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Audit Log</h1>
        <div className="p-6 bg-white rounded-lg shadow">
          <p className="text-red-600 font-semibold">Access Denied.</p>
          <p className="text-sm text-gray-600">{permissionError}</p>
        </div>
      </div>
    );
  }

  if (!loggedInUser){ 
     return <div className="p-6 text-center text-gray-500">Please log in to view audit logs.</div>;
  }

  // UPDATED: Handle missing tenant
  if (!currentTenantId) {
    return (
      <div className="max-w-6xl mx-auto py-4 px-1 sm:px-6 lg:px-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Audit Log</h1>
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="text-red-600 mb-2">Tenant information is missing</div>
          <div className="text-sm text-gray-500">Cannot load audit logs without tenant context</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto py-4 px-1 sm:px-6 lg:px-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">Current Tenant: {currentTenantId}</p>
        </div>
        
        {/* UPDATED: Tenant selector for Super Admin */}
        {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
          <div className="flex flex-col items-end">
            <label className="text-sm font-medium text-gray-700 mb-1">View Logs For:</label>
            <select 
              value={selectedTenant} 
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="current">Current Tenant ({currentTenantId})</option>
              <option value="all">All Tenants</option>
            </select>
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
      
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          onClick={() => setShowArchive((s) => !s)}
          className={`px-4 py-2 rounded-md text-sm font-medium shadow transition
            ${showArchive ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}
          `}
        >
          {showArchive ? "Show Recent Logs (Last 24h)" : "Show Full Archive"}
        </button>
        
        {/* NEW: Action type filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Filter:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Actions</option>
            <option value="date_changes">📅 Date Changes Only</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
            <option value="status">Status Changes</option>
          </select>
        </div>
        
        <span className="text-xs text-gray-500">
          {showArchive
            ? `Showing up to 400 most recent logs${selectedTenant === 'all' ? ' across all tenants' : ` for ${selectedTenant === 'current' ? 'current tenant' : 'selected tenant'}`}.`
            : `Showing logs from the last 24 hours${selectedTenant === 'all' ? ' across all tenants' : ` for ${selectedTenant === 'current' ? 'current tenant' : 'selected tenant'}`}.`
          }
          {actionFilter !== 'all' && ` (Filtered: ${filteredLogs.length} of ${logs.length})`}
        </span>
      </div>

      <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
        <table className="min-w-full">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Timestamp</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">User</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Target Type</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden lg:table-cell">Target ID</th>
              {/* UPDATED: Show Tenant column for Super Admin viewing all tenants */}
              {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && selectedTenant === 'all' && (
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden xl:table-cell">Tenant</th>
              )}
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredLogs.length === 0 && !isLoading ? ( 
              <tr>
                <td colSpan={loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && selectedTenant === 'all' ? 7 : 6} className="text-center text-gray-500 py-10">
                  {actionFilter !== 'all' 
                    ? `No audit log entries found matching filter "${actionFilter}".`
                    : selectedTenant === 'all' 
                      ? "No audit log entries found across all tenants matching criteria."
                      : `No audit log entries found for ${selectedTenant === 'current' ? 'current tenant' : 'selected tenant'} matching criteria.`
                  }
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition duration-150 ease-in-out">
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.timestamp?.toDate().toLocaleString() || 'N/A'}
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700">{log.userEmail || log.userId}</td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getActionBadgeColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">{log.targetType}</td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs hidden lg:table-cell" title={getDisplayTargetId(log)}>{getDisplayTargetId(log)}</td>
                  {/* UPDATED: Show tenant info for Super Admin viewing all tenants */}
                  {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && selectedTenant === 'all' && (
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden xl:table-cell">
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        {log.tenantId || 'No Tenant'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                    {formatLogDetails(log, allDrivers, allTrucks, allDispatchers)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* UPDATED: Show tenant filtering info */}
      <div className="mt-4 text-xs text-gray-500 bg-gray-50 p-3 rounded-md">
        <div className="font-medium mb-1">Audit Log Information:</div>
        <div>• Logs are filtered by tenant for security and privacy</div>
        <div>• Current viewing scope: {
          selectedTenant === 'all' ? 'All tenants (Super Admin only)' :
          selectedTenant === 'current' ? `Current tenant (${currentTenantId})` :
          `Selected tenant (${selectedTenant})`
        }</div>
        <div>• Time range: {showArchive ? 'Up to 400 most recent entries' : 'Last 24 hours'}</div>
        <div>• <span className="text-orange-600 font-medium">Orange highlighted actions</span> indicate manual date changes that were confirmed by admin</div>
        {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
          <div>• Super Admin: Use the tenant selector above to view logs from specific tenants</div>
        )}
      </div>
    </div>
  );
}