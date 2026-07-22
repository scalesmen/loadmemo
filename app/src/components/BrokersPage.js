import React, { useState, useEffect, useRef, useCallback } from "react";
import { db, auth } from "../firebase";
import { applyOwnerImpersonation } from '../utils/impersonation';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  where,
  getDocs,
  limit,
  startAfter,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// ✅ CORRECT - ONLY checks 'role' (singular)
const normalizeUserRoles = (user) => {
  if (!user) return [];
  if (Array.isArray(user.role) && user.role.length > 0) return user.role;
  if (user.role && typeof user.role === 'string') return [user.role];
  return [];
};

const userHasAnyRole = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.some(role => roles.includes(role));
};

// Normalize broker name - must match backend logic exactly
const normalizeBrokerName = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
};

// Helper to fetch load stats for a broker (only DELIVERED)
async function getBrokerStats(brokerName, tenantId) {
  if (!brokerName || !tenantId) return { totalLoads: 0, totalAmount: 0, avgPerMile: 0 };
  const loadsRef = collection(db, "loads");
  const q = query(
    loadsRef,
    where("tenantId", "==", tenantId),
    where("brokerName", "==", brokerName),
    where("status", "==", "Delivered")
  );
  const snapshot = await getDocs(q);
  let totalLoads = 0,
    totalAmount = 0,
    totalMiles = 0;

  snapshot.forEach((doc) => {
    const d = doc.data();
    totalLoads++;
    totalAmount += Number(d.amount) || 0;
    totalMiles += Number(d.mileage) || 0;
  });
  return {
    totalLoads,
    totalAmount,
    avgPerMile: totalMiles > 0 ? totalAmount / totalMiles : 0,
  };
}

// ========== FETCH BROKER LOAD COUNTS IN BULK ==========
// Counts all loads (any status) per brokerName for sorting by popularity
async function fetchBrokerLoadCounts(tenantId) {
  if (!tenantId) return {};
  
  try {
    const loadsRef = collection(db, "loads");
    const q = query(
      loadsRef,
      where("tenantId", "==", tenantId)
    );
    const snapshot = await getDocs(q);
    
    const counts = {};
    snapshot.forEach((doc) => {
      const brokerName = doc.data().brokerName;
      if (brokerName) {
        counts[brokerName] = (counts[brokerName] || 0) + 1;
      }
    });
    
    return counts;
  } catch (err) {
    console.error("Error fetching broker load counts:", err);
    return {};
  }
}

export default function BrokersPage() {
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDocId, setEditDocId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });
  const [error, setError] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [expandedBrokerId, setExpandedBrokerId] = useState(null);
  const [brokerStats, setBrokerStats] = useState({});
  const [statsLoading, setStatsLoading] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  // ========== ALL BROKERS (full dataset from Firestore via onSnapshot) ==========
  const [allBrokers, setAllBrokers] = useState([]);
  const [allBrokersLoaded, setAllBrokersLoaded] = useState(false);

  // ========== LOAD COUNTS FOR SORTING ==========
  const [brokerLoadCounts, setBrokerLoadCounts] = useState({});
  const [loadCountsFetched, setLoadCountsFetched] = useState(false);

  // ========== DISPLAY CONTROLS (client-side pagination) ==========
  const INITIAL_DISPLAY = 30;
  const LOAD_MORE_INCREMENT = 30;
  const [displayLimit, setDisplayLimit] = useState(INITIAL_DISPLAY);

  // ========== MERGE STATE ==========
  const [selectedBrokerIds, setSelectedBrokerIds] = useState(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [primaryBrokerId, setPrimaryBrokerId] = useState(null);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);

  // ========== SORT STATE ==========
  const [sortBy, setSortBy] = useState("popularity"); // "popularity" | "name" | "recent"

  // Fetch user profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setLoggedInUser(applyOwnerImpersonation({ uid: user.uid, ...docSnap.data() }, user.email));
          } else {
            setLoggedInUser({ uid: user.uid, role: null, roles: [] });
            console.warn("BrokersPage: Logged in user profile not found in Firestore.");
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
      }
    });
    return unsubscribe;
  }, []);

  // ========== FETCH ALL BROKERS WITH LIVE LISTENER ==========
  useEffect(() => {
    if (!loggedInUser?.tenantId) {
      setAllBrokers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "brokers"),
      where("tenantId", "==", loggedInUser.tenantId),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const brokersList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllBrokers(brokersList);
        setAllBrokersLoaded(true);
        setLoading(false);
      },
      (err) => {
        console.error("BrokersPage: Error fetching brokers:", err);
        setError("Failed to fetch brokers: " + err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [loggedInUser?.tenantId]);

  // ========== FETCH LOAD COUNTS FOR POPULARITY SORT ==========
  useEffect(() => {
    if (!loggedInUser?.tenantId || loadCountsFetched) return;

    fetchBrokerLoadCounts(loggedInUser.tenantId).then((counts) => {
      setBrokerLoadCounts(counts);
      setLoadCountsFetched(true);
    });
  }, [loggedInUser?.tenantId, loadCountsFetched]);

  const refreshLoadCounts = useCallback(() => {
    if (!loggedInUser?.tenantId) return;
    fetchBrokerLoadCounts(loggedInUser.tenantId).then((counts) => {
      setBrokerLoadCounts(counts);
    });
  }, [loggedInUser?.tenantId]);

  // ========== SEARCH + SORT + FILTER PIPELINE ==========
  const getFilteredAndSortedBrokers = useCallback(() => {
    let list = [...allBrokers];

    // 1. Filter by search term (searches name, email, phone, address)
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.trim().toLowerCase();
      list = list.filter((broker) => {
        return (
          broker.name?.toLowerCase().includes(lowerTerm) ||
          broker.email?.toLowerCase().includes(lowerTerm) ||
          broker.phone?.toLowerCase().includes(lowerTerm) ||
          broker.address?.toLowerCase().includes(lowerTerm)
        );
      });
    }

    // 2. Sort
    if (sortBy === "popularity") {
      list.sort((a, b) => {
        const countA = brokerLoadCounts[a.name] || 0;
        const countB = brokerLoadCounts[b.name] || 0;
        if (countB !== countA) return countB - countA;
        return (a.name || '').localeCompare(b.name || '');
      });
    } else if (sortBy === "name") {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === "recent") {
      list.sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
        const dateB = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
        return dateB - dateA;
      });
    }

    return list;
  }, [allBrokers, searchTerm, sortBy, brokerLoadCounts]);

  const filteredBrokers = getFilteredAndSortedBrokers();
  const displayedBrokers = filteredBrokers.slice(0, displayLimit);
  const hasMore = displayLimit < filteredBrokers.length;

  // Reset display limit when search or sort changes
  useEffect(() => {
    setDisplayLimit(INITIAL_DISPLAY);
  }, [searchTerm, sortBy]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelectedBrokerIds(new Set());
  };

  const loadMore = () => {
    setDisplayLimit((prev) => prev + LOAD_MORE_INCREMENT);
  };

  const showAll = () => {
    setDisplayLimit(filteredBrokers.length);
  };

  // Role checks
  const isAdmin = userHasAnyRole(loggedInUser, ["Super Admin", "Admin", "Accountant", "Dispatcher"]);
  const canMerge = userHasAnyRole(loggedInUser, ["Super Admin", "Admin"]);

  const handleInputChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const openAddModal = () => {
    if (!isAdmin) {
      alert("You do not have permission to add brokers.");
      return;
    }
    setForm({ name: "", address: "", phone: "", email: "" });
    setIsEditing(false);
    setEditDocId(null);
    setShowModal(true);
  };

  const openEditModal = (broker) => {
    if (!isAdmin) {
      alert("You do not have permission to edit brokers.");
      return;
    }
    setForm({
      name: broker.name || "",
      address: broker.address || "",
      phone: broker.phone || "",
      email: broker.email || "",
    });
    setIsEditing(true);
    setEditDocId(broker.id);
    setShowModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      alert("You do not have permission to save broker data.");
      return;
    }
    if (!form.name) {
      setError("Broker Name is required.");
      return;
    }

    try {
      setError(null);
      if (isEditing && editDocId) {
        await updateDoc(doc(db, "brokers", editDocId), {
          ...form,
          nameLower: normalizeBrokerName(form.name),
          updatedAt: serverTimestamp(),
        });

        await addDoc(collection(db, "auditLogs"), {
          userId: loggedInUser.uid,
          userEmail: loggedInUser.email,
          action: "BROKER_UPDATED",
          targetType: "broker",
          targetId: editDocId,
          details: { brokerName: form.name, changes: form },
          tenantId: loggedInUser.tenantId,
          timestamp: serverTimestamp(),
        });

        alert("Broker updated successfully!");
      } else {
        const brokerData = {
          ...form,
          nameLower: normalizeBrokerName(form.name),
          tenantId: loggedInUser.tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const newBrokerRef = await addDoc(collection(db, "brokers"), brokerData);

        await addDoc(collection(db, "auditLogs"), {
          userId: loggedInUser.uid,
          userEmail: loggedInUser.email,
          action: "BROKER_CREATED",
          targetType: "broker",
          targetId: newBrokerRef.id,
          details: { brokerName: form.name, ...form },
          tenantId: loggedInUser.tenantId,
          timestamp: serverTimestamp(),
        });

        alert("Broker added successfully!");
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving broker:", err);
      setError("Failed to save broker: " + err.message);
    }
  };

  const handleDeleteBroker = async (id, brokerName) => {
    if (!isAdmin) {
      alert("You do not have permission to delete brokers.");
      return;
    }
    if (!window.confirm("Delete this broker?")) return;

    try {
      await deleteDoc(doc(db, "brokers", id));

      await addDoc(collection(db, "auditLogs"), {
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "BROKER_DELETED",
        targetType: "broker",
        targetId: id,
        details: { brokerName: brokerName },
        tenantId: loggedInUser.tenantId,
        timestamp: serverTimestamp(),
      });

      alert("Broker deleted successfully!");
    } catch (err) {
      console.error("Error deleting broker:", err);
      setError("Failed to delete broker: " + err.message);
    }
  };

  const handleExpandBroker = async (broker) => {
    if (expandedBrokerId === broker.id) {
      setExpandedBrokerId(null);
    } else {
      setExpandedBrokerId(broker.id);
      if (!brokerStats[broker.id]) {
        setStatsLoading((prev) => ({ ...prev, [broker.id]: true }));
        const stats = await getBrokerStats(broker.name, loggedInUser.tenantId);
        setBrokerStats((prev) => ({ ...prev, [broker.id]: stats }));
        setStatsLoading((prev) => ({ ...prev, [broker.id]: false }));
      }
    }
  };

  // ========== MERGE HANDLERS ==========
  const toggleBrokerSelection = (brokerId) => {
    setSelectedBrokerIds((prev) => {
      const next = new Set(prev);
      if (next.has(brokerId)) {
        next.delete(brokerId);
      } else {
        next.add(brokerId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedBrokerIds.size === displayedBrokers.length) {
      setSelectedBrokerIds(new Set());
    } else {
      setSelectedBrokerIds(new Set(displayedBrokers.map((b) => b.id)));
    }
  };

  const openMergeModal = () => {
    if (selectedBrokerIds.size < 2) {
      alert("Please select at least 2 brokers to merge.");
      return;
    }
    const firstSelected = Array.from(selectedBrokerIds)[0];
    setPrimaryBrokerId(firstSelected);
    setMergeResult(null);
    setShowMergeModal(true);
  };

  const cancelMerge = () => {
    setShowMergeModal(false);
    setPrimaryBrokerId(null);
    setMergeResult(null);
  };

  const handleBulkDelete = async () => {
    if (selectedBrokerIds.size === 0) return;

    const selBrokers = allBrokers.filter((b) => selectedBrokerIds.has(b.id));
    const selectedNames = selBrokers.map((b) => b.name).join(", ");

    if (
      !window.confirm(
        `Delete ${selectedBrokerIds.size} broker(s)?\n\n${selectedNames}\n\nThis will NOT reassign their loads. Use Merge instead if you want to preserve load history.`
      )
    )
      return;

    if (
      !window.confirm(
        `⚠️ FINAL CONFIRMATION: Permanently delete ${selectedBrokerIds.size} broker(s)?`
      )
    )
      return;

    try {
      setError(null);
      for (const brokerId of selectedBrokerIds) {
        const broker = allBrokers.find((b) => b.id === brokerId);
        await deleteDoc(doc(db, "brokers", brokerId));

        await addDoc(collection(db, "auditLogs"), {
          userId: loggedInUser.uid,
          userEmail: loggedInUser.email,
          action: "BROKER_DELETED",
          targetType: "broker",
          targetId: brokerId,
          details: { brokerName: broker?.name, bulkDelete: true },
          tenantId: loggedInUser.tenantId,
          timestamp: serverTimestamp(),
        });
      }

      alert(`${selectedBrokerIds.size} broker(s) deleted successfully!`);
      setSelectedBrokerIds(new Set());
    } catch (err) {
      console.error("Bulk delete error:", err);
      setError("Failed to delete brokers: " + err.message);
    }
  };

  const handleMerge = async () => {
    if (!primaryBrokerId) {
      alert("Please select which broker name to keep.");
      return;
    }

    const secondaryIds = Array.from(selectedBrokerIds).filter(
      (id) => id !== primaryBrokerId
    );
    const primaryBroker = allBrokers.find((b) => b.id === primaryBrokerId);
    const secondaryBrokers = secondaryIds.map((id) =>
      allBrokers.find((b) => b.id === id)
    );

    const confirmMsg = `Are you sure you want to merge ${secondaryBrokers
      .map((b) => `"${b?.name}"`)
      .join(", ")} into "${primaryBroker?.name}"?\n\nThis will:\n• Reassign all loads from merged brokers to "${primaryBroker?.name}"\n• Merge any missing contact info\n• Delete the duplicate broker profiles\n• Update factoring rules if any\n\nThis action cannot be undone.`;

    if (!window.confirm(confirmMsg)) return;

    setMerging(true);
    setError(null);

    try {
      const token = await auth.currentUser.getIdToken();

      const functionUrl =
        "https://us-central1-truckmemo2.cloudfunctions.net/mergeBrokers";

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          primaryBrokerId,
          secondaryBrokerIds: secondaryIds,
          tenantId: loggedInUser.tenantId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Merge failed");
      }

      setMergeResult(result);
      setSelectedBrokerIds(new Set());

      // Refresh load counts after merge
      refreshLoadCounts();

      console.log("✅ Merge successful:", result);
    } catch (err) {
      console.error("Merge error:", err);
      setError("Merge failed: " + err.message);
    } finally {
      setMerging(false);
    }
  };

  const formatCurrency = (num) =>
    num == null
      ? "--"
      : num.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        });

  // Get selected broker objects for the merge modal
  const selectedBrokers = allBrokers.filter((b) => selectedBrokerIds.has(b.id));

  if (!loggedInUser && loading)
    return (
      <div className="p-6 text-center text-gray-500">Authenticating...</div>
    );
  if (!loggedInUser && !loading)
    return (
      <div className="p-6 text-center text-gray-500">
        Please log in to view brokers.
      </div>
    );

  return (
    <div className="max-w-full mx-auto py-4 px-1 sm:px-6 lg:px-8">
      {/* ========== HEADER ========== */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Broker Management
          </h1>
          {allBrokersLoaded && (
            <p className="text-sm text-gray-500 mt-1">
              {allBrokers.length} broker{allBrokers.length !== 1 ? "s" : ""} total
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search all brokers..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="px-4 py-2 pl-9 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
            <svg
              className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedBrokerIds(new Set());
                }}
                className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 p-0.5"
                title="Clear search"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="popularity">Sort: Most Used</option>
            <option value="name">Sort: A → Z</option>
            <option value="recent">Sort: Newest First</option>
          </select>

          <div className="flex gap-2">
            {/* Bulk Delete Button */}
            {canMerge && selectedBrokerIds.size >= 1 && (
              <button
                onClick={handleBulkDelete}
                className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center justify-center shadow-sm whitespace-nowrap transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                Delete ({selectedBrokerIds.size})
              </button>
            )}
            {/* Merge Button */}
            {canMerge && selectedBrokerIds.size >= 2 && (
              <button
                onClick={openMergeModal}
                className="bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center justify-center shadow-sm whitespace-nowrap transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                Merge ({selectedBrokerIds.size})
              </button>
            )}
            {canMerge && selectedBrokerIds.size === 1 && (
              <span className="inline-flex items-center px-3 py-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md whitespace-nowrap">
                Select 1 more to merge
              </span>
            )}
            {isAdmin && (
              <button
                onClick={openAddModal}
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center justify-center shadow-sm whitespace-nowrap"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add New Broker
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search results indicator */}
      {searchTerm.trim() && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {filteredBrokers.length} result{filteredBrokers.length !== 1 ? "s" : ""} for "{searchTerm}" across all {allBrokers.length} brokers
          </span>
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedBrokerIds(new Set());
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
          Loading brokers...
        </div>
      ) : displayedBrokers.length === 0 ? (
        <div className="p-6 bg-white rounded-lg shadow text-center text-gray-500">
          {searchTerm
            ? `No brokers found matching "${searchTerm}".`
            : "No brokers found."}
          {isAdmin && !searchTerm && ' Click "Add New Broker" to get started.'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  {canMerge && (
                    <th className="px-2 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedBrokerIds.size === displayedBrokers.length && displayedBrokers.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Select all visible"
                      />
                    </th>
                  )}
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Broker Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Loads</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Address</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Phone</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                  {isAdmin && (
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedBrokers.map((broker) => {
                  const isSelected = selectedBrokerIds.has(broker.id);
                  const loadCount = brokerLoadCounts[broker.name] || 0;
                  return (
                    <React.Fragment key={broker.id}>
                      <tr className={`hover:bg-gray-50 transition ${isSelected ? "bg-orange-50" : ""}`}>
                        {canMerge && (
                          <td className="px-2 py-3 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleBrokerSelection(broker.id)}
                              className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-2 py-3 whitespace-nowrap">
                          <button
                            onClick={() => handleExpandBroker(broker)}
                            className="text-gray-400 hover:text-blue-600 p-1"
                            aria-label="Expand broker"
                          >
                            <svg
                              className={`w-5 h-5 transform transition-transform duration-200 ${
                                expandedBrokerId === broker.id ? "rotate-90" : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{broker.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {loadCount > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {loadCount}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">{broker.address || "N/A"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">{broker.phone || "N/A"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">{broker.email || "N/A"}</td>
                        {isAdmin && (
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-1">
                            <button
                              onClick={() => openEditModal(broker)}
                              className="text-indigo-600 hover:text-indigo-900 text-xs p-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteBroker(broker.id, broker.name)}
                              className="text-red-600 hover:text-red-900 text-xs p-1"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                      {expandedBrokerId === broker.id && (
                        <tr className="bg-gray-50 border-t border-gray-200">
                          <td colSpan={canMerge ? (isAdmin ? 8 : 7) : (isAdmin ? 7 : 6)} className="px-4 sm:px-6 py-4">
                            <div className="flex flex-col md:flex-row gap-8 text-sm text-gray-700">
                              <div>
                                <div className="font-semibold mb-2">Broker Profile</div>
                                <div>Address: {broker.address || <span className="italic text-gray-400">N/A</span>}</div>
                                <div>Phone: {broker.phone || <span className="italic text-gray-400">N/A</span>}</div>
                                <div>Email: {broker.email || <span className="italic text-gray-400">N/A</span>}</div>
                              </div>
                              <div>
                                <div className="font-semibold mb-2">Broker Stats (Delivered Loads)</div>
                                {statsLoading[broker.id] ? (
                                  <div className="text-gray-500">Loading stats...</div>
                                ) : (
                                  <ul className="space-y-1">
                                    <li>
                                      Total Delivered Loads:{" "}
                                      <span className="font-medium">{brokerStats[broker.id]?.totalLoads ?? "--"}</span>
                                    </li>
                                    <li>
                                      Total Amount:{" "}
                                      <span className="font-medium">{formatCurrency(brokerStats[broker.id]?.totalAmount)}</span>
                                    </li>
                                    <li>
                                      Avg Per Mile:{" "}
                                      <span className="font-medium">
                                        {brokerStats[broker.id]?.avgPerMile != null
                                          ? formatCurrency(brokerStats[broker.id]?.avgPerMile)
                                          : "--"}
                                      </span>
                                    </li>
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ========== LOAD MORE / SHOW ALL ========== */}
          {hasMore && (
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={loadMore}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-lg border border-gray-300 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Show More ({Math.min(LOAD_MORE_INCREMENT, filteredBrokers.length - displayLimit)} more)
              </button>
              {filteredBrokers.length - displayLimit > LOAD_MORE_INCREMENT && (
                <button
                  onClick={showAll}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-3 px-6 rounded-lg border border-blue-200 transition-colors flex items-center gap-2"
                >
                  Show All ({filteredBrokers.length})
                </button>
              )}
            </div>
          )}

          <div className="mt-4 text-center text-sm text-gray-500">
            Showing {displayedBrokers.length} of {filteredBrokers.length} broker{filteredBrokers.length !== 1 ? "s" : ""}
            {searchTerm && ` matching "${searchTerm}"`}
            {filteredBrokers.length !== allBrokers.length && !searchTerm && ` (${allBrokers.length} total)`}
            {selectedBrokerIds.size > 0 && ` • ${selectedBrokerIds.size} selected`}
          </div>

          {/* Sticky bottom action bar when brokers are selected */}
          {canMerge && selectedBrokerIds.size >= 1 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg px-6 py-3 z-40 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {selectedBrokerIds.size} broker{selectedBrokerIds.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedBrokerIds(new Set())}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
                >
                  Clear Selection
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm transition-colors"
                >
                  Delete ({selectedBrokerIds.size})
                </button>
                {selectedBrokerIds.size >= 2 && (
                  <button
                    onClick={openMergeModal}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm transition-colors"
                  >
                    Merge ({selectedBrokerIds.size})
                  </button>
                )}
                {selectedBrokerIds.size === 1 && (
                  <span className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
                    Select 1 more to merge
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================
          ADD/EDIT BROKER MODAL
      ============================================ */}
      {showModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md my-8">
            <h3 className="text-xl font-semibold mb-6 text-gray-800">
              {isEditing ? "Edit Broker" : "Add New Broker"}
            </h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Broker Name <span className="text-red-500">*</span>
                </label>
                <input type="text" name="name" value={form.name} onChange={handleInputChange} required className="input-class" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Broker Address</label>
                <input type="text" name="address" value={form.address} onChange={handleInputChange} className="input-class" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Broker Phone</label>
                <input type="text" name="phone" value={form.phone} onChange={handleInputChange} className="input-class" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Broker Email</label>
                <input type="email" name="email" value={form.email} onChange={handleInputChange} className="input-class" placeholder="broker@example.com" />
              </div>
              <div className="flex justify-end space-x-3 pt-6 mt-4 border-t border-gray-200">
                <button type="button" className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                  {isEditing ? "Save Changes" : "Add Broker"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================
          MERGE BROKERS MODAL
      ============================================ */}
      {showMergeModal && canMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg my-8">
            {mergeResult ? (
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Merge Complete!</h3>
                <div className="text-sm text-gray-600 space-y-2 mb-6">
                  <p>
                    <span className="font-medium">{mergeResult.mergedBrokers?.length || 0}</span> broker(s) merged into{" "}
                    <span className="font-semibold text-gray-900">"{mergeResult.primaryBroker?.name}"</span>
                  </p>
                  <p>
                    <span className="font-medium">{mergeResult.loadsReassigned || 0}</span> load(s) reassigned
                  </p>
                  {mergeResult.fieldsMerged?.length > 0 && (
                    <p>Contact fields merged: {mergeResult.fieldsMerged.join(", ")}</p>
                  )}
                </div>
                <button onClick={cancelMerge} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-md text-sm font-medium">
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-semibold mb-2 text-gray-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 text-orange-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  Merge Brokers
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Select which broker name to keep. All loads and data from the other brokers will be merged into it.
                </p>

                <div className="space-y-2 mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Keep this broker name:</label>
                  {selectedBrokers.map((broker) => (
                    <label
                      key={broker.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        primaryBrokerId === broker.id
                          ? "border-orange-500 bg-orange-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="primaryBroker"
                        value={broker.id}
                        checked={primaryBrokerId === broker.id}
                        onChange={() => setPrimaryBrokerId(broker.id)}
                        className="text-orange-500 focus:ring-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {broker.name}
                          {brokerLoadCounts[broker.name] > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              {brokerLoadCounts[broker.name]} loads
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {[broker.phone, broker.email, broker.address].filter(Boolean).join(" • ") || "No contact info"}
                        </div>
                      </div>
                      {primaryBrokerId === broker.id && (
                        <span className="flex-shrink-0 inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          KEEP
                        </span>
                      )}
                      {primaryBrokerId && primaryBrokerId !== broker.id && (
                        <span className="flex-shrink-0 inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                          MERGE
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-md mb-6">
                  <p className="text-sm text-yellow-800 flex items-start gap-2">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>
                      <strong>This cannot be undone.</strong> All loads, factoring rules, and stats from the merged brokers will be reassigned to the selected broker.
                    </span>
                  </p>
                </div>

                <div className="flex justify-end space-x-3">
                  <button type="button" onClick={cancelMerge} disabled={merging} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2.5 rounded-md text-sm font-medium disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={merging || !primaryBrokerId}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {merging ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Merging...
                      </>
                    ) : (
                      <>Merge Brokers</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .input-class {
          display: block;
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          line-height: 1.25rem;
          border: 1px solid #D1D5DB;
          border-radius: 0.375rem;
          box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);
        }
        .input-class:focus {
          outline: 2px solid transparent;
          outline-offset: 2px;
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.5);
        }
      `}</style>
    </div>
  );
}