// src/components/SafetyPage.js

import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { logAudit } from '../utils/auditLog';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// USDOT Violation Types (based on FMCSA categories)
const VIOLATION_TYPES = {
  'Driver Violations': [
    'Speeding 6-10 mph over limit',
    'Speeding 11-14 mph over limit', 
    'Speeding 15+ mph over limit',
    'Reckless driving',
    'Improper lane change',
    'Following too closely',
    'Hours of Service - Driving beyond limit',
    'Hours of Service - False log',
    'Hours of Service - No log book',
    'Hours of Service - Form and manner',
    'No CDL',
    'Expired CDL',
    'Wrong CDL class/endorsement',
    'No medical certificate',
    'Expired medical certificate',
    'Cell phone use while driving',
    'Texting while driving',
    'Seat belt violation',
    'DUI/DWI',
    'Possession of intoxicants',
    'Under influence of drugs'
  ],
  'Vehicle Maintenance': [
    'Brake adjustment',
    'Brake connections',
    'Brake drums or rotors',
    'Brake hose',
    'Brake tubing',
    'Low air warning device',
    'Tires - tread depth',
    'Tires - flat/exposed fabric',
    'Tires - other defect',
    'Wheel/rim cracked or broken',
    'Windshield wipers',
    'Windshield damage',
    'Lights - headlights',
    'Lights - tail lights',
    'Lights - turn signals',
    'Lights - brake lights',
    'Reflectors',
    'Coupling devices',
    'Cargo securement',
    'Frame cracked/broken',
    'Fuel system leak',
    'Exhaust leak',
    'Suspension',
    'Steering'
  ],
  'Hazmat': [
    'No placards when required',
    'Wrong placards',
    'No shipping papers',
    'Improper shipping name',
    'No emergency response info',
    'Leaking cargo',
    'Unsecured cargo',
    'Improper blocking/bracing'
  ],
  'Other': [
    'Overweight - gross',
    'Overweight - axle',
    'Overlength',
    'Overwidth',
    'Overheight',
    'No/expired registration',
    'No/expired insurance',
    'No/expired IFTA',
    'No operating authority',
    'General unsafe condition'
  ]
};

// Default bonus types
const DEFAULT_BONUS_TYPES = [
  { name: 'Level I Inspection Pass', description: 'Clean Level I inspection with no violations', defaultAmount: 200 },
  { name: 'Level II Inspection Pass', description: 'Clean Level II inspection with no violations', defaultAmount: 150 },
  { name: 'Level III Inspection Pass', description: 'Clean Level III inspection with no violations', defaultAmount: 100 },
  { name: 'Monthly Safety Bonus', description: 'No violations for entire month', defaultAmount: 250 },
  { name: 'Perfect Score Bonus', description: '100% safety score for the period', defaultAmount: 300 },
  { name: 'Quarterly Safety Award', description: 'Outstanding safety record for the quarter', defaultAmount: 500 }
];

export default function SafetyPage({ companyFilter, loggedInUser }) {
  const [activeTab, setActiveTab] = useState('violations');
  const [violations, setViolations] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [canRecord, setCanRecord] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canManageRates, setCanManageRates] = useState(false);
  
  // Modal states
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [editingViolation, setEditingViolation] = useState(null);
  const [violationForm, setViolationForm] = useState({
    driverId: '',
    driverName: '',
    date: new Date().toISOString().split('T')[0],
    category: '',
    type: '',
    severity: 'Minor',
    fine: 0,
    description: '',
    location: '',
    officerName: '',
    officerBadge: '',
    citationNumber: ''
  });

  // Inspection states
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showFMCSAImport, setShowFMCSAImport] = useState(false);
  const [editingInspection, setEditingInspection] = useState(null);
  const [viewingInspection, setViewingInspection] = useState(null);
  const [usdotNumber, setUsdotNumber] = useState('');
  const [importingFMCSA, setImportingFMCSA] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({
    driverId: '',
    driverName: '',
    date: new Date().toISOString().split('T')[0],
    inspectionType: 'Roadside',
    level: '1',
    result: 'Pass',
    location: '',
    inspector: '',
    reportNumber: '',
    vehicleNumber: '',
    violationCount: 0,
    violations: [],
    notes: ''
  });

  // Penalty management states
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [editingPenalty, setEditingPenalty] = useState(null);
  const [penaltyForm, setPenaltyForm] = useState({
    violationType: '',
    category: '',
    amount: 0,
    description: ''
  });

  // Bonus management states
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [editingBonus, setEditingBonus] = useState(null);
  const [bonusForm, setBonusForm] = useState({
    name: '',
    description: '',
    amount: 0,
    criteria: ''
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setUserProfile(loggedInUser);
        
        // Check permissions
        const role = loggedInUser?.role;
        setCanRecord(['Super Admin', 'Admin', 'HR', 'Fleet'].includes(role));
        setCanDelete(['Super Admin', 'Admin'].includes(role));
        setCanManageRates(['Super Admin', 'Admin'].includes(role));
      }
    });

    return () => unsubscribe();
  }, [loggedInUser]);

  useEffect(() => {
    if (!loggedInUser || !loggedInUser.tenantId) {
      setViolations([]);
      setInspections([]);
      setDrivers([]);
      setPenalties([]);
      setBonuses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // Fetch drivers
    const driversQuery = query(
      collection(db, 'drivers'),
      where('tenantId', '==', loggedInUser.tenantId),
      orderBy('name', 'asc')
    );
    
    const driversUnsubscribe = onSnapshot(driversQuery, (snapshot) => {
      const driversData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDrivers(driversData);
    });

    // Fetch violations
    const violationsQuery = query(
      collection(db, 'violations'),
      where('tenantId', '==', loggedInUser.tenantId),
      orderBy('date', 'desc')
    );
    
    const violationsUnsubscribe = onSnapshot(violationsQuery, (snapshot) => {
      const violationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setViolations(violationsData);
    });

    // Fetch inspections
    const inspectionsQuery = query(
      collection(db, 'inspections'),
      where('tenantId', '==', loggedInUser.tenantId),
      orderBy('date', 'desc')
    );
    
    const inspectionsUnsubscribe = onSnapshot(inspectionsQuery, (snapshot) => {
      const inspectionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInspections(inspectionsData);
    });

    // Fetch penalties
    const penaltiesQuery = query(
      collection(db, 'penalties'),
      where('tenantId', '==', loggedInUser.tenantId),
      orderBy('category', 'asc')
    );
    
    const penaltiesUnsubscribe = onSnapshot(penaltiesQuery, (snapshot) => {
      const penaltiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPenalties(penaltiesData);
    });

    // Fetch bonuses
    const bonusesQuery = query(
      collection(db, 'bonuses'),
      where('tenantId', '==', loggedInUser.tenantId),
      orderBy('name', 'asc')
    );
    
    const bonusesUnsubscribe = onSnapshot(bonusesQuery, (snapshot) => {
      const bonusesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBonuses(bonusesData);
      setIsLoading(false);
    });
    
    return () => {
      driversUnsubscribe();
      violationsUnsubscribe();
      inspectionsUnsubscribe();
      penaltiesUnsubscribe();
      bonusesUnsubscribe();
    };
  }, [loggedInUser]);

  // Initialize default penalties and bonuses
  const initializeDefaults = async () => {
    if (!loggedInUser?.tenantId) return;

    try {
      // Initialize default penalties from violation types
      const defaultPenalties = [];
      Object.keys(VIOLATION_TYPES).forEach(category => {
        VIOLATION_TYPES[category].forEach(violationType => {
          defaultPenalties.push({
            violationType,
            category,
            amount: getDefaultPenaltyAmount(category, violationType),
            description: `Standard penalty for ${violationType}`,
            tenantId: loggedInUser.tenantId,
            createdAt: serverTimestamp(),
            createdBy: user.uid
          });
        });
      });

      // Check if penalties already exist
      const existingPenalties = await getDocs(query(
        collection(db, 'penalties'),
        where('tenantId', '==', loggedInUser.tenantId)
      ));

      if (existingPenalties.empty) {
        // Add default penalties
        for (const penalty of defaultPenalties) {
          await addDoc(collection(db, 'penalties'), penalty);
        }
      }

      // Initialize default bonuses
      const existingBonuses = await getDocs(query(
        collection(db, 'bonuses'),
        where('tenantId', '==', loggedInUser.tenantId)
      ));

      if (existingBonuses.empty) {
        for (const bonus of DEFAULT_BONUS_TYPES) {
          await addDoc(collection(db, 'bonuses'), {
            name: bonus.name,
            description: bonus.description,
            amount: bonus.defaultAmount,
            criteria: bonus.description,
            tenantId: loggedInUser.tenantId,
            createdAt: serverTimestamp(),
            createdBy: user.uid
          });
        }
      }

      alert('Default penalties and bonuses initialized successfully!');
    } catch (error) {
      console.error('Error initializing defaults:', error);
      alert('Failed to initialize default values');
    }
  };

  const getDefaultPenaltyAmount = (category, violationType) => {
    // Define default penalty amounts based on violation severity
    if (category === 'Driver Violations') {
      if (violationType.includes('DUI') || violationType.includes('Under influence')) return 1000;
      if (violationType.includes('Hours of Service')) return 500;
      if (violationType.includes('Speeding 15+')) return 300;
      if (violationType.includes('Speeding 11-14')) return 200;
      if (violationType.includes('Speeding 6-10')) return 150;
      return 100;
    }
    if (category === 'Vehicle Maintenance') {
      if (violationType.includes('Brake')) return 400;
      if (violationType.includes('Tires')) return 300;
      return 200;
    }
    if (category === 'Hazmat') return 750;
    return 150; // Default for 'Other' category
  };

  // Builds an audit-log {field: {oldValue, newValue}} diff between an existing
  // record and the fields being saved, skipping anything unchanged.
  const buildFieldChanges = (oldRecord, newData, fields) => {
    const changes = {};
    for (const field of fields) {
      const oldValue = oldRecord?.[field] ?? '';
      const newValue = newData?.[field] ?? '';
      if (oldValue !== newValue) changes[field] = { oldValue, newValue };
    }
    return changes;
  };

  // Penalty management functions
  const handleSavePenalty = async () => {
    if (!penaltyForm.violationType || !penaltyForm.category || !loggedInUser?.tenantId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const penaltyData = {
        ...penaltyForm,
        tenantId: loggedInUser.tenantId,
        amount: parseFloat(penaltyForm.amount) || 0,
        updatedAt: serverTimestamp()
      };

      if (editingPenalty) {
        await updateDoc(doc(db, 'penalties', editingPenalty), {
          ...penaltyData,
          updatedBy: user.uid
        });
        const oldPenalty = penalties.find(p => p.id === editingPenalty);
        const changes = buildFieldChanges(oldPenalty, penaltyData, ['violationType', 'category', 'amount', 'description']);
        if (Object.keys(changes).length > 0) {
          logAudit({
            userId: user.uid, userEmail: loggedInUser.email, action: 'PENALTY_UPDATED',
            targetType: 'penalty', targetId: editingPenalty,
            details: { violationType: penaltyData.violationType, changes }, tenantId: loggedInUser.tenantId
          });
        }
        alert('Penalty updated successfully!');
      } else {
        const newRef = await addDoc(collection(db, 'penalties'), {
          ...penaltyData,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
        logAudit({
          userId: user.uid, userEmail: loggedInUser.email, action: 'PENALTY_CREATED',
          targetType: 'penalty', targetId: newRef.id,
          details: { violationType: penaltyData.violationType, category: penaltyData.category, amount: penaltyData.amount },
          tenantId: loggedInUser.tenantId
        });
        alert('Penalty created successfully!');
      }

      resetPenaltyForm();
      setShowPenaltyModal(false);
      setEditingPenalty(null);
    } catch (error) {
      console.error('Error saving penalty:', error);
      alert('Failed to save penalty');
    }
  };

  const handleDeletePenalty = async (penaltyId) => {
    if (!canManageRates || !window.confirm('Are you sure you want to delete this penalty?')) return;

    try {
      const deletedPenalty = penalties.find(p => p.id === penaltyId);
      await deleteDoc(doc(db, 'penalties', penaltyId));
      logAudit({
        userId: user.uid, userEmail: loggedInUser.email, action: 'PENALTY_DELETED',
        targetType: 'penalty', targetId: penaltyId,
        details: { violationType: deletedPenalty?.violationType, amount: deletedPenalty?.amount },
        tenantId: loggedInUser.tenantId
      });
      alert('Penalty deleted successfully!');
    } catch (error) {
      console.error('Error deleting penalty:', error);
      alert('Failed to delete penalty');
    }
  };

  const handleEditPenalty = (penalty) => {
    setPenaltyForm({
      violationType: penalty.violationType,
      category: penalty.category,
      amount: penalty.amount,
      description: penalty.description || ''
    });
    setEditingPenalty(penalty.id);
    setShowPenaltyModal(true);
  };

  const resetPenaltyForm = () => {
    setPenaltyForm({
      violationType: '',
      category: '',
      amount: 0,
      description: ''
    });
  };

  // Bonus management functions
  const handleSaveBonus = async () => {
    if (!bonusForm.name || !loggedInUser?.tenantId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const bonusData = {
        ...bonusForm,
        tenantId: loggedInUser.tenantId,
        amount: parseFloat(bonusForm.amount) || 0,
        updatedAt: serverTimestamp()
      };

      if (editingBonus) {
        await updateDoc(doc(db, 'bonuses', editingBonus), {
          ...bonusData,
          updatedBy: user.uid
        });
        const oldBonus = bonuses.find(b => b.id === editingBonus);
        const changes = buildFieldChanges(oldBonus, bonusData, ['name', 'description', 'amount', 'criteria']);
        if (Object.keys(changes).length > 0) {
          logAudit({
            userId: user.uid, userEmail: loggedInUser.email, action: 'BONUS_UPDATED',
            targetType: 'bonus', targetId: editingBonus,
            details: { bonusName: bonusData.name, changes }, tenantId: loggedInUser.tenantId
          });
        }
        alert('Bonus updated successfully!');
      } else {
        const newRef = await addDoc(collection(db, 'bonuses'), {
          ...bonusData,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
        logAudit({
          userId: user.uid, userEmail: loggedInUser.email, action: 'BONUS_CREATED',
          targetType: 'bonus', targetId: newRef.id,
          details: { bonusName: bonusData.name, amount: bonusData.amount, criteria: bonusData.criteria },
          tenantId: loggedInUser.tenantId
        });
        alert('Bonus created successfully!');
      }

      resetBonusForm();
      setShowBonusModal(false);
      setEditingBonus(null);
    } catch (error) {
      console.error('Error saving bonus:', error);
      alert('Failed to save bonus');
    }
  };

  const handleDeleteBonus = async (bonusId) => {
    if (!canManageRates || !window.confirm('Are you sure you want to delete this bonus?')) return;

    try {
      const deletedBonus = bonuses.find(b => b.id === bonusId);
      await deleteDoc(doc(db, 'bonuses', bonusId));
      logAudit({
        userId: user.uid, userEmail: loggedInUser.email, action: 'BONUS_DELETED',
        targetType: 'bonus', targetId: bonusId,
        details: { bonusName: deletedBonus?.name, amount: deletedBonus?.amount },
        tenantId: loggedInUser.tenantId
      });
      alert('Bonus deleted successfully!');
    } catch (error) {
      console.error('Error deleting bonus:', error);
      alert('Failed to delete bonus');
    }
  };

  const handleEditBonus = (bonus) => {
    setBonusForm({
      name: bonus.name,
      description: bonus.description || '',
      amount: bonus.amount,
      criteria: bonus.criteria || ''
    });
    setEditingBonus(bonus.id);
    setShowBonusModal(true);
  };

  const resetBonusForm = () => {
    setBonusForm({
      name: '',
      description: '',
      amount: 0,
      criteria: ''
    });
  };

  // Original functions (keeping existing functionality)
  const handleSaveViolation = async () => {
    if (!violationForm.driverId || !violationForm.type || !loggedInUser?.tenantId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const violationData = {
        ...violationForm,
        tenantId: loggedInUser.tenantId,
        date: Timestamp.fromDate(new Date(violationForm.date)),
        fine: parseFloat(violationForm.fine) || 0,
        updatedAt: serverTimestamp()
      };

      if (editingViolation) {
        await updateDoc(doc(db, 'violations', editingViolation), {
          ...violationData,
          updatedBy: user.uid
        });
        const oldViolation = violations.find(v => v.id === editingViolation);
        const changes = buildFieldChanges(oldViolation, violationData, ['type', 'severity', 'fine', 'description', 'category', 'location']);
        if (Object.keys(changes).length > 0) {
          logAudit({
            userId: user.uid, userEmail: loggedInUser.email, action: 'VIOLATION_UPDATED',
            targetType: 'violation', targetId: editingViolation,
            details: { driverName: violationData.driverName, changes }, tenantId: loggedInUser.tenantId
          });
        }
        alert('Violation updated successfully!');
      } else {
        const newRef = await addDoc(collection(db, 'violations'), {
          ...violationData,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
        logAudit({
          userId: user.uid, userEmail: loggedInUser.email, action: 'VIOLATION_CREATED',
          targetType: 'violation', targetId: newRef.id,
          details: { driverName: violationData.driverName, type: violationData.type, severity: violationData.severity, fine: violationData.fine },
          tenantId: loggedInUser.tenantId
        });
        alert('Violation recorded successfully!');
      }

      resetViolationForm();
      setShowViolationModal(false);
      setEditingViolation(null);
      
    } catch (error) {
      console.error('Error saving violation:', error);
      alert('Failed to save violation');
    }
  };

  const handleDeleteViolation = async (violationId) => {
    if (!canDelete || !window.confirm('Are you sure you want to delete this violation?')) return;

    try {
      const deletedViolation = violations.find(v => v.id === violationId);
      await deleteDoc(doc(db, 'violations', violationId));
      logAudit({
        userId: user.uid, userEmail: loggedInUser.email, action: 'VIOLATION_DELETED',
        targetType: 'violation', targetId: violationId,
        details: { driverName: deletedViolation?.driverName, type: deletedViolation?.type },
        tenantId: loggedInUser.tenantId
      });
      alert('Violation deleted successfully!');
    } catch (error) {
      console.error('Error deleting violation:', error);
      alert('Failed to delete violation');
    }
  };

  const handleEditViolation = (violation) => {
    setViolationForm({
      driverId: violation.driverId,
      driverName: violation.driverName,
      date: violation.date.toDate().toISOString().split('T')[0],
      category: violation.category || '',
      type: violation.type,
      severity: violation.severity,
      fine: violation.fine,
      description: violation.description || '',
      location: violation.location || '',
      officerName: violation.officerName || '',
      officerBadge: violation.officerBadge || '',
      citationNumber: violation.citationNumber || ''
    });
    setEditingViolation(violation.id);
    setShowViolationModal(true);
  };

  const resetViolationForm = () => {
    setViolationForm({
      driverId: '',
      driverName: '',
      date: new Date().toISOString().split('T')[0],
      category: '',
      type: '',
      severity: 'Minor',
      fine: 0,
      description: '',
      location: '',
      officerName: '',
      officerBadge: '',
      citationNumber: ''
    });
  };

  const handleDriverSelect = (e) => {
    const driverId = e.target.value;
    const driver = drivers.find(d => d.id === driverId);
    setViolationForm(prev => ({
      ...prev,
      driverId: driverId,
      driverName: driver ? driver.name : ''
    }));
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'Critical': return 'bg-red-100 text-red-800';
      case 'Major': return 'bg-orange-100 text-orange-800';
      case 'Minor': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  // Manual SAFER lookup function
  const handleManualSAFERLookup = () => {
    if (!usdotNumber) {
      alert('Please enter a USDOT number');
      return;
    }
    
    const saferUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${usdotNumber}`;
    
    alert(`Opening SAFER in a new tab for USDOT #${usdotNumber}

What to look for:
1. Company safety rating
2. Total inspections in last 24 months
3. Out of Service rates
4. Any red flags or violations

After reviewing, return here to manually enter any violations found.`);
    
    window.open(saferUrl, '_blank');
    setShowFMCSAImport(false);
  };

  // Inspection functions
  const handleSaveInspection = async () => {
    if (!inspectionForm.driverId || !inspectionForm.date || !loggedInUser?.tenantId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const inspectionData = {
        ...inspectionForm,
        tenantId: loggedInUser.tenantId,
        date: Timestamp.fromDate(new Date(inspectionForm.date)),
        violationCount: parseInt(inspectionForm.violationCount) || 0,
        updatedAt: serverTimestamp()
      };

      if (editingInspection) {
        await updateDoc(doc(db, 'inspections', editingInspection), {
          ...inspectionData,
          updatedBy: user.uid
        });
        const oldInspection = inspections.find(i => i.id === editingInspection);
        const changes = buildFieldChanges(oldInspection, inspectionData, ['inspectionType', 'level', 'result', 'location', 'inspector', 'violationCount', 'notes']);
        if (Object.keys(changes).length > 0) {
          logAudit({
            userId: user.uid, userEmail: loggedInUser.email, action: 'INSPECTION_UPDATED',
            targetType: 'inspection', targetId: editingInspection,
            details: { driverName: inspectionData.driverName, changes }, tenantId: loggedInUser.tenantId
          });
        }
        alert('Inspection updated successfully!');
      } else {
        const newRef = await addDoc(collection(db, 'inspections'), {
          ...inspectionData,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
        logAudit({
          userId: user.uid, userEmail: loggedInUser.email, action: 'INSPECTION_CREATED',
          targetType: 'inspection', targetId: newRef.id,
          details: { driverName: inspectionData.driverName, inspectionType: inspectionData.inspectionType, result: inspectionData.result },
          tenantId: loggedInUser.tenantId
        });
        alert('Inspection recorded successfully!');
      }

      resetInspectionForm();
      setShowInspectionModal(false);
      setEditingInspection(null);
      
    } catch (error) {
      console.error('Error saving inspection:', error);
      alert('Failed to save inspection');
    }
  };

  const handleDeleteInspection = async (inspectionId) => {
    if (!canDelete || !window.confirm('Are you sure you want to delete this inspection?')) return;

    try {
      const deletedInspection = inspections.find(i => i.id === inspectionId);
      await deleteDoc(doc(db, 'inspections', inspectionId));
      logAudit({
        userId: user.uid, userEmail: loggedInUser.email, action: 'INSPECTION_DELETED',
        targetType: 'inspection', targetId: inspectionId,
        details: { driverName: deletedInspection?.driverName, inspectionType: deletedInspection?.inspectionType },
        tenantId: loggedInUser.tenantId
      });
      alert('Inspection deleted successfully!');
    } catch (error) {
      console.error('Error deleting inspection:', error);
      alert('Failed to delete inspection');
    }
  };

  const handleEditInspection = (inspection) => {
    setInspectionForm({
      driverId: inspection.driverId,
      driverName: inspection.driverName,
      date: inspection.date.toDate().toISOString().split('T')[0],
      inspectionType: inspection.inspectionType,
      level: inspection.level,
      result: inspection.result,
      location: inspection.location || '',
      inspector: inspection.inspector || '',
      reportNumber: inspection.reportNumber || '',
      vehicleNumber: inspection.vehicleNumber || '',
      violationCount: inspection.violationCount || 0,
      violations: inspection.violations || [],
      notes: inspection.notes || ''
    });
    setEditingInspection(inspection.id);
    setShowInspectionModal(true);
  };

  const handleViewInspection = (inspection) => {
    setViewingInspection(inspection);
  };

  const resetInspectionForm = () => {
    setInspectionForm({
      driverId: '',
      driverName: '',
      date: new Date().toISOString().split('T')[0],
      inspectionType: 'Roadside',
      level: '1',
      result: 'Pass',
      location: '',
      inspector: '',
      reportNumber: '',
      vehicleNumber: '',
      violationCount: 0,
      violations: [],
      notes: ''
    });
  };

  const handleInspectionDriverSelect = (e) => {
    const driverId = e.target.value;
    const driver = drivers.find(d => d.id === driverId);
    setInspectionForm(prev => ({
      ...prev,
      driverId: driverId,
      driverName: driver ? driver.name : ''
    }));
  };

  // FMCSA Import function (using FMCSA Mobile API - no auth required)
  const handleFMCSAImport = async () => {
    if (!usdotNumber) {
      alert('Please enter a USDOT number');
      return;
    }

    setImportingFMCSA(true);
    
    try {
      // FMCSA Mobile API with your WebKey
      const webKey = process.env.REACT_APP_FMCSA_WEBKEY || 'e7aa444301c53b26e6477577b7db9ed63af94ea7';
      const apiUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${usdotNumber}?webKey=${webKey}`;
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('USDOT number not found');
        }
        throw new Error('API request failed');
      }
      
      const data = await response.json();
      
      if (!data.content || !data.content.carrier) {
        throw new Error('Invalid response format');
      }
      
      const carrier = data.content.carrier;
      
      // Format the inspection summary
      const inspectionSummary = carrier.inspectionSummary || {};
      const basics = carrier.basics || {};
      
      const message = `
Company Information Retrieved:

━━━ COMPANY DETAILS ━━━
Company: ${carrier.legalName}
DBA: ${carrier.dbaName || 'N/A'}
USDOT: ${carrier.dotNumber}
MC Number: ${carrier.mcNumber || 'N/A'}
Address: ${carrier.phyStreet}, ${carrier.phyCity}, ${carrier.phyState} ${carrier.phyZipcode}
Safety Rating: ${carrier.safetyRating || 'Not Rated'}

━━━ INSPECTION SUMMARY (Last 24 Months) ━━━
Total Inspections: ${inspectionSummary.totalInspections || 0}
• Vehicle Inspections: ${inspectionSummary.vehicleInspections || 0}
• Driver Inspections: ${inspectionSummary.driverInspections || 0}

Out of Service Rates:
• Vehicle OOS: ${inspectionSummary.vehicleOosRate || 0}% (National Avg: ${inspectionSummary.nationalVehicleOosRate || 0}%)
• Driver OOS: ${inspectionSummary.driverOosRate || 0}% (National Avg: ${inspectionSummary.nationalDriverOosRate || 0}%)

━━━ CSA BASIC SCORES ━━━
${basics.unsafeDriving ? `• Unsafe Driving: ${basics.unsafeDriving.score || 'N/A'}` : '• Unsafe Driving: Not Available'}
${basics.hoursOfService ? `• Hours of Service: ${basics.hoursOfService.score || 'N/A'}` : '• Hours of Service: Not Available'}
${basics.vehicleMaintenance ? `• Vehicle Maintenance: ${basics.vehicleMaintenance.score || 'N/A'}` : '• Vehicle Maintenance: Not Available'}
${basics.driverFitness ? `• Driver Fitness: ${basics.driverFitness.score || 'N/A'}` : '• Driver Fitness: Not Available'}
${basics.controlledSubstances ? `• Controlled Substances: ${basics.controlledSubstances.score || 'N/A'}` : '• Controlled Substances: Not Available'}
${basics.hazardousMaterials ? `• Hazmat: ${basics.hazardousMaterials.score || 'N/A'}` : ''}

━━━ FLEET INFO ━━━
Power Units: ${carrier.totalPowerUnits || 0}
Drivers: ${carrier.totalDrivers || 0}

Note: This shows summary data only. Individual inspection records with specific violations must be:
1. Obtained from drivers (paper reports)
2. Entered manually
3. Retrieved via authenticated FMCSA Web Services`;
      
      alert(message);
      
      // Optionally save company info
      if (window.confirm('Would you like to save this carrier information to your database?')) {
        await saveCarrierInfo(carrier);
      }
      
      setShowFMCSAImport(false);
      setUsdotNumber('');
      
    } catch (error) {
      console.error('Error importing from FMCSA:', error);
      
      if (error.message === 'USDOT number not found') {
        alert(`USDOT #${usdotNumber} not found in FMCSA database. Please check the number and try again.`);
      } else {
        alert(`Failed to retrieve data from FMCSA. 

Error: ${error.message}

Please try:
1. Checking your internet connection
2. Verifying the USDOT number
3. Using the Manual Lookup option`);
      }
    } finally {
      setImportingFMCSA(false);
    }
  };

  // Helper function to save carrier info to Firestore
  const saveCarrierInfo = async (carrier) => {
    try {
      const carrierData = {
        name: carrier.legalName || '',
        dbaName: carrier.dbaName || '',
        usdotNumber: carrier.dotNumber || '',
        address: `${carrier.phyStreet || ''}, ${carrier.phyCity || ''}, ${carrier.phyState || ''} ${carrier.phyZipcode || ''}`.trim(),
        phone: carrier.phoneNumber || '',
        safetyRating: carrier.safetyRating || 'Not Rated',
        powerUnits: carrier.totalPowerUnits || 0,
        drivers: carrier.totalDrivers || 0,
        tenantId: loggedInUser.tenantId,
        fmcsaData: {
          inspectionSummary: carrier.inspectionSummary || {},
          basics: carrier.basics || {},
          lastUpdated: new Date().toISOString()
        },
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };

      // Only add mcNumber if it exists
      if (carrier.mcNumber) {
        carrierData.mcNumber = carrier.mcNumber;
      }

      // Check if we already have this carrier
      const carriersQuery = query(
        collection(db, 'companies'),
        where('usdotNumber', '==', carrier.dotNumber),
        where('tenantId', '==', loggedInUser.tenantId)
      );
      
      const snapshot = await getDocs(carriersQuery);
      
      if (snapshot.empty) {
        // Create new
        await addDoc(collection(db, 'companies'), {
          ...carrierData,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
        alert('Carrier information saved successfully!');
      } else {
        // Update existing
        const docId = snapshot.docs[0].id;
        await updateDoc(doc(db, 'companies', docId), carrierData);
        alert('Carrier information updated successfully!');
      }
    } catch (error) {
      console.error('Error saving carrier info:', error);
      alert('Failed to save carrier information');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Safety Management</h1>
          <p className="mt-2 text-sm text-gray-700">
            Track violations, inspections, and safety compliance
          </p>
        </div>
        <div className="mt-4 sm:mt-0 space-x-3">
          <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
            <svg className="mr-2 -ml-1 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Export Report
          </button>
          {activeTab === 'inspections' && canRecord && (
            <>
              <button 
                onClick={() => setShowFMCSAImport(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <svg className="mr-2 -ml-1 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import from FMCSA
              </button>
              <button 
                onClick={() => {
                  resetInspectionForm();
                  setEditingInspection(null);
                  setShowInspectionModal(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="mr-2 -ml-1 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Record Inspection
              </button>
            </>
          )}
          {activeTab === 'violations' && canRecord && (
            <button 
              onClick={() => {
                resetViolationForm();
                setEditingViolation(null);
                setShowViolationModal(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <svg className="mr-2 -ml-1 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Record Violation
            </button>
          )}
          {activeTab === 'bonuses' && canManageRates && penalties.length === 0 && bonuses.length === 0 && (
            <button 
              onClick={initializeDefaults}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
            >
              <svg className="mr-2 -ml-1 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Initialize Defaults
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('violations')}
            className={`${
              activeTab === 'violations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Violations
          </button>
          <button
            onClick={() => setActiveTab('inspections')}
            className={`${
              activeTab === 'inspections'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Inspections
          </button>
          <button
            onClick={() => setActiveTab('bonuses')}
            className={`${
              activeTab === 'bonuses'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Bonuses & Penalties
          </button>
        </nav>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          {activeTab === 'violations' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fine</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Citation #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {violations.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">
                        No violations recorded
                      </td>
                    </tr>
                  ) : (
                    violations.map((violation) => (
                      <tr key={violation.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {violation.driverName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(violation.date)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div>{violation.type}</div>
                          {violation.location && (
                            <div className="text-xs text-gray-400">{violation.location}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSeverityColor(violation.severity)}`}>
                            {violation.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${violation.fine || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {violation.citationNumber || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          {canRecord && (
                            <button 
                              onClick={() => handleEditViolation(violation)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button 
                              onClick={() => handleDeleteViolation(violation.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'inspections' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inspection Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Violations</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Report #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inspections.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-4 text-center text-sm text-gray-500">
                        No inspections recorded
                      </td>
                    </tr>
                  ) : (
                    inspections.map((inspection) => (
                      <tr key={inspection.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {inspection.driverName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(inspection.date)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {inspection.inspectionType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          Level {inspection.level}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            inspection.result === 'Pass' ? 'bg-green-100 text-green-800' : 
                            inspection.result === 'Pass w/ Violations' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {inspection.result}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {inspection.violationCount || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {inspection.reportNumber || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <button 
                            onClick={() => handleViewInspection(inspection)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                          {canRecord && (
                            <button 
                              onClick={() => handleEditInspection(inspection)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button 
                              onClick={() => handleDeleteInspection(inspection.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'bonuses' && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Bonuses Section */}
                <div className="bg-green-50 p-6 rounded-lg">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-medium text-green-900">Safety Bonuses</h3>
                    {canManageRates && (
                      <button 
                        onClick={() => {
                          resetBonusForm();
                          setEditingBonus(null);
                          setShowBonusModal(true);
                        }}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                      >
                        <svg className="mr-1 -ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Bonus
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {bonuses.length === 0 ? (
                      <p className="text-sm text-green-700">No bonuses configured</p>
                    ) : (
                      bonuses.map((bonus) => (
                        <div key={bonus.id} className="flex justify-between items-center p-3 bg-white rounded-md shadow-sm">
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <span className="text-sm font-medium text-green-900">{bonus.name}</span>
                              <span className="text-sm font-bold text-green-800">${bonus.amount}</span>
                            </div>
                            {bonus.description && (
                              <p className="text-xs text-green-600 mt-1">{bonus.description}</p>
                            )}
                          </div>
                          {canManageRates && (
                            <div className="ml-3 flex space-x-2">
                              <button 
                                onClick={() => handleEditBonus(bonus)}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDeleteBonus(bonus.id)}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Penalties Section */}
                <div className="bg-red-50 p-6 rounded-lg">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-medium text-red-900">Violation Penalties</h3>
                    {canManageRates && (
                      <button 
                        onClick={() => {
                          resetPenaltyForm();
                          setEditingPenalty(null);
                          setShowPenaltyModal(true);
                        }}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                      >
                        <svg className="mr-1 -ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Penalty
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {penalties.length === 0 ? (
                      <p className="text-sm text-red-700">No penalties configured</p>
                    ) : (
                      penalties.map((penalty) => (
                        <div key={penalty.id} className="flex justify-between items-center p-2 bg-white rounded-md shadow-sm">
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-medium text-red-900">{penalty.violationType}</span>
                              <span className="text-xs font-bold text-red-800">${penalty.amount}</span>
                            </div>
                            <span className="text-xs text-red-600">{penalty.category}</span>
                          </div>
                          {canManageRates && (
                            <div className="ml-2 flex space-x-1">
                              <button 
                                onClick={() => handleEditPenalty(penalty)}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDeletePenalty(penalty.id)}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Summary Statistics */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900">Total Configured Bonuses</h4>
                  <p className="text-2xl font-bold text-blue-800">{bonuses.length}</p>
                  <p className="text-xs text-blue-600">
                    Total value: ${bonuses.reduce((sum, bonus) => sum + bonus.amount, 0)}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-red-900">Total Configured Penalties</h4>
                  <p className="text-2xl font-bold text-red-800">{penalties.length}</p>
                  <p className="text-xs text-red-600">
                    Avg penalty: ${penalties.length > 0 ? Math.round(penalties.reduce((sum, penalty) => sum + penalty.amount, 0) / penalties.length) : 0}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-900">Recent Activity</h4>
                  <p className="text-2xl font-bold text-gray-800">{violations.length}</p>
                  <p className="text-xs text-gray-600">Total violations recorded</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Penalty Modal */}
      {showPenaltyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  {editingPenalty ? 'Edit Penalty' : 'Add New Penalty'}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Violation Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={penaltyForm.category}
                      onChange={(e) => setPenaltyForm(prev => ({ 
                        ...prev, 
                        category: e.target.value,
                        violationType: '' 
                      }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">Select category</option>
                      {Object.keys(VIOLATION_TYPES).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Violation Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={penaltyForm.violationType}
                      onChange={(e) => setPenaltyForm(prev => ({ ...prev, violationType: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      disabled={!penaltyForm.category}
                    >
                      <option value="">Select violation type</option>
                      {penaltyForm.category && VIOLATION_TYPES[penaltyForm.category].map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Penalty Amount ($) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={penaltyForm.amount}
                      onChange={(e) => setPenaltyForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={penaltyForm.description}
                      onChange={(e) => setPenaltyForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Additional details about this penalty..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleSavePenalty}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {editingPenalty ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowPenaltyModal(false);
                    setEditingPenalty(null);
                    resetPenaltyForm();
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bonus Modal */}
      {showBonusModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  {editingBonus ? 'Edit Bonus' : 'Add New Bonus'}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bonus Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={bonusForm.name}
                      onChange={(e) => setBonusForm(prev => ({ ...prev, name: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="e.g., Level I Inspection Pass"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bonus Amount ($) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={bonusForm.amount}
                      onChange={(e) => setBonusForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={bonusForm.description}
                      onChange={(e) => setBonusForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Brief description of this bonus..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Criteria
                    </label>
                    <textarea
                      value={bonusForm.criteria}
                      onChange={(e) => setBonusForm(prev => ({ ...prev, criteria: e.target.value }))}
                      rows={3}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="What conditions must be met to earn this bonus..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleSaveBonus}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {editingBonus ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowBonusModal(false);
                    setEditingBonus(null);
                    resetBonusForm();
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Violation Modal */}
      {showViolationModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  {editingViolation ? 'Edit Violation' : 'Record New Violation'}
                </h3>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Driver <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={violationForm.driverId}
                      onChange={handleDriverSelect}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">Select a driver</option>
                      {drivers.map(driver => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={violationForm.date}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, date: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Citation Number
                    </label>
                    <input
                      type="text"
                      value={violationForm.citationNumber}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, citationNumber: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Citation or ticket number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Violation Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={violationForm.category}
                      onChange={(e) => setViolationForm(prev => ({ 
                        ...prev, 
                        category: e.target.value,
                        type: '' // Reset type when category changes
                      }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">Select category</option>
                      {Object.keys(VIOLATION_TYPES).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Violation Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={violationForm.type}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, type: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      disabled={!violationForm.category}
                    >
                      <option value="">Select violation type</option>
                      {violationForm.category && VIOLATION_TYPES[violationForm.category].map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Severity <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={violationForm.severity}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, severity: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="Minor">Minor</option>
                      <option value="Major">Major</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fine Amount ($)
                    </label>
                    <input
                      type="number"
                      value={violationForm.fine}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, fine: parseFloat(e.target.value) || 0 }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={violationForm.location}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, location: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="City, State"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Officer Name
                    </label>
                    <input
                      type="text"
                      value={violationForm.officerName}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, officerName: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Officer Badge #
                    </label>
                    <input
                      type="text"
                      value={violationForm.officerBadge}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, officerBadge: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description / Notes
                    </label>
                    <textarea
                      value={violationForm.description}
                      onChange={(e) => setViolationForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Additional details about the violation..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleSaveViolation}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {editingViolation ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowViolationModal(false);
                    setEditingViolation(null);
                    resetViolationForm();
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Modal */}
      {showInspectionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  {editingInspection ? 'Edit Inspection' : 'Record New Inspection'}
                </h3>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Driver <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={inspectionForm.driverId}
                      onChange={handleInspectionDriverSelect}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">Select a driver</option>
                      {drivers.map(driver => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={inspectionForm.date}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, date: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Inspection Type
                    </label>
                    <select
                      value={inspectionForm.inspectionType}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, inspectionType: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="Roadside">Roadside</option>
                      <option value="Terminal">Terminal</option>
                      <option value="Destination">Destination</option>
                      <option value="Special Study">Special Study</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Inspection Level
                    </label>
                    <select
                      value={inspectionForm.level}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, level: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="1">Level I - Full Inspection</option>
                      <option value="2">Level II - Walk-Around</option>
                      <option value="3">Level III - Driver Only</option>
                      <option value="4">Level IV - Special Study</option>
                      <option value="5">Level V - Terminal</option>
                      <option value="6">Level VI - Radioactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Result
                    </label>
                    <select
                      value={inspectionForm.result}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, result: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="Pass">Pass</option>
                      <option value="Pass w/ Violations">Pass with Violations</option>
                      <option value="Out of Service">Out of Service</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Report Number
                    </label>
                    <input
                      type="text"
                      value={inspectionForm.reportNumber}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, reportNumber: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Inspection report number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={inspectionForm.location}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, location: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="City, State"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Inspector
                    </label>
                    <input
                      type="text"
                      value={inspectionForm.inspector}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, inspector: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Inspector name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehicle/Unit Number
                    </label>
                    <input
                      type="text"
                      value={inspectionForm.vehicleNumber}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, vehicleNumber: e.target.value }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Truck/Trailer number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Number of Violations
                    </label>
                    <input
                      type="number"
                      value={inspectionForm.violationCount}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, violationCount: parseInt(e.target.value) || 0 }))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      min="0"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={inspectionForm.notes}
                      onChange={(e) => setInspectionForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Additional notes about the inspection..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleSaveInspection}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {editingInspection ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowInspectionModal(false);
                    setEditingInspection(null);
                    resetInspectionForm();
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FMCSA Import Modal */}
      {showFMCSAImport && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Import Inspections from FMCSA
                </h3>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    USDOT Number
                  </label>
                  <input
                    type="text"
                    value={usdotNumber}
                    onChange={(e) => setUsdotNumber(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter USDOT number"
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        FMCSA Data Access Options
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p className="font-semibold">Option 1: Automatic Import (Recommended)</p>
                        <ul className="list-disc list-inside mt-1 ml-4">
                          <li>Register for free at <a href="https://mobile.fmcsa.dot.gov/developer" target="_blank" rel="noopener noreferrer" className="underline">FMCSA Mobile Developer Portal</a></li>
                          <li>Get your Web Key instantly</li>
                          <li>Add the key to your environment settings</li>
                        </ul>
                        
                        <p className="font-semibold mt-3">Option 2: Manual SAFER Lookup</p>
                        <ul className="list-disc list-inside mt-1 ml-4">
                          <li>Click "Manual Lookup" below</li>
                          <li>View company and inspection summary</li>
                          <li>Manually enter violations</li>
                        </ul>
                        
                        <p className="mt-3 text-xs">
                          Note: Public APIs provide summary data only. Individual inspection details require FMCSA Web Services authentication.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleFMCSAImport}
                  disabled={importingFMCSA || !usdotNumber}
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${
                    importingFMCSA || !usdotNumber ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                  } text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm`}
                >
                  {importingFMCSA ? 'Importing...' : 'Import'}
                </button>
                <button
                  onClick={handleManualSAFERLookup}
                  disabled={!usdotNumber}
                  className={`mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 ${
                    !usdotNumber ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'
                  } text-base font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm`}
                >
                  Manual Lookup
                </button>
                <button
                  onClick={() => {
                    setShowFMCSAImport(false);
                    setUsdotNumber('');
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Inspection Details Modal */}
      {viewingInspection && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Inspection Details
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Driver</p>
                    <p className="mt-1 text-sm text-gray-900">{viewingInspection.driverName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Date</p>
                    <p className="mt-1 text-sm text-gray-900">{formatDate(viewingInspection.date)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Type</p>
                    <p className="mt-1 text-sm text-gray-900">{viewingInspection.inspectionType}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Level</p>
                    <p className="mt-1 text-sm text-gray-900">Level {viewingInspection.level}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Result</p>
                    <p className="mt-1">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        viewingInspection.result === 'Pass' ? 'bg-green-100 text-green-800' : 
                        viewingInspection.result === 'Pass w/ Violations' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {viewingInspection.result}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Violations</p>
                    <p className="mt-1 text-sm text-gray-900">{viewingInspection.violationCount || 0}</p>
                  </div>
                  {viewingInspection.reportNumber && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Report Number</p>
                      <p className="mt-1 text-sm text-gray-900">{viewingInspection.reportNumber}</p>
                    </div>
                  )}
                  {viewingInspection.location && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Location</p>
                      <p className="mt-1 text-sm text-gray-900">{viewingInspection.location}</p>
                    </div>
                  )}
                  {viewingInspection.inspector && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Inspector</p>
                      <p className="mt-1 text-sm text-gray-900">{viewingInspection.inspector}</p>
                    </div>
                  )}
                  {viewingInspection.vehicleNumber && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Vehicle Number</p>
                      <p className="mt-1 text-sm text-gray-900">{viewingInspection.vehicleNumber}</p>
                    </div>
                  )}
                  {viewingInspection.notes && (
                    <div className="col-span-2">
                      <p className="text-sm font-medium text-gray-500">Notes</p>
                      <p className="mt-1 text-sm text-gray-900">{viewingInspection.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => setViewingInspection(null)}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}