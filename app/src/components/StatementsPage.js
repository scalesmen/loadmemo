// src/components/StatementsPage.js

import React, { useState, useEffect } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { useTimezone } from '../contexts/TimezoneContext'; // Import the timezone context

// Add these helper functions after the imports (around line 9)
// ADDED: Multi-role helper functions
const normalizeUserRoles = (user) => {
  if (!user) return [];
  
  // Only check the 'role' field (can be array or string)
  if (Array.isArray(user.role) && user.role.length > 0) {
    return user.role;
  }
  
  // If role is a string (legacy), convert to array
  if (user.role && typeof user.role === 'string') {
    return [user.role];
  }
  
  return [];
};

const userHasAnyRole = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.some(role => roles.includes(role));
};

export default function StatementsPage({ companyFilter, loggedInUser }) {
  const { applicationTimeZone, isLoadingTimeZone } = useTimezone(); // Use timezone from context
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loads, setLoads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  
  // Calendar state - UPDATED for custom date selection
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedStartDate, setSelectedStartDate] = useState('');
  const [selectedEndDate, setSelectedEndDate] = useState('');
  const [selectionMode, setSelectionMode] = useState('week'); // 'week', 'custom'
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedTruck, setSelectedTruck] = useState('');
  const [pettyExpenses, setPettyExpenses] = useState([]);

  
  // Permission check
// ✅ FIXED - Use multi-role checking
const canGenerate = userHasAnyRole(loggedInUser, ['Super Admin', 'Admin', 'Accountant']);
  // FIXED: Timezone-aware date functions
  function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function getSunday(date) {
    const monday = getMonday(date);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  }

  function formatDate(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // FIXED: Parse date consistently 
  function parseDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.split('-');
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    return date;
  }

  function getDaysInMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  }

  function isDateInRange(date) {
    if (!date || !selectedStartDate || !selectedEndDate) return false;
    const dateStr = formatDate(date);
    return dateStr >= selectedStartDate && dateStr <= selectedEndDate;
  }

  function isDateSelected(date) {
    if (!date) return false;
    const dateStr = formatDate(date);
    return dateStr === selectedStartDate || dateStr === selectedEndDate;
  }

  function handleDateClick(date) {
    if (!date) return;
    const dateStr = formatDate(date);
    
    if (selectionMode === 'week') {
      // FIXED: Use timezone-aware week calculation
      const monday = getMonday(date);
      const sunday = getSunday(date);
      setSelectedStartDate(formatDate(monday));
      setSelectedEndDate(formatDate(sunday));
    } else if (selectionMode === 'custom') {
      // Custom range selection
      if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
        // Start new selection
        setSelectedStartDate(dateStr);
        setSelectedEndDate('');
      } else {
        // Complete the range
        if (dateStr >= selectedStartDate) {
          setSelectedEndDate(dateStr);
        } else {
          setSelectedEndDate(selectedStartDate);
          setSelectedStartDate(dateStr);
        }
      }
    }
  }

  function clearSelection() {
    setSelectedStartDate('');
    setSelectedEndDate('');
  }

  function setCurrentWeek() {
    const today = new Date();
    const monday = getMonday(today);
    const sunday = getSunday(today);
    setSelectedStartDate(formatDate(monday));
    setSelectedEndDate(formatDate(sunday));
  }

  function setPreviousWeek() {
    const today = new Date();
    today.setDate(today.getDate() - 7);
    const monday = getMonday(today);
    const sunday = getSunday(today);
    setSelectedStartDate(formatDate(monday));
    setSelectedEndDate(formatDate(sunday));
  }

  function navigateMonth(direction) {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() + direction);
      return newMonth;
    });
  }

  // FIXED: Simplified date range function
  function getWeekRange(startDateStr, endDateStr) {
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    
    return { start, end };
  }

  // FIXED: Format dates directly from strings to avoid timezone shift
  function formatWeekRange(startDateStr, endDateStr, timezone = applicationTimeZone) {
    // Parse the date strings directly without creating Date objects
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    
    // Format as M/D/YYYY directly from the numbers to avoid any timezone conversion
    const startStr = `${startMonth}/${startDay}/${startYear}`;
    const endStr = `${endMonth}/${endDay}/${endYear}`;
    
    let timezoneDisplay = '';
    if (timezone && timezone !== 'UTC') {
      if (timezone === 'America/New_York') {
        timezoneDisplay = '\n7 days\nEastern Time (ET)';
      } else if (timezone === 'America/Chicago') {
        timezoneDisplay = '\n7 days\nCentral Time (CT)';
      } else if (timezone === 'America/Denver') {
        timezoneDisplay = '\n7 days\nMountain Time (MT)';
      } else if (timezone === 'America/Los_Angeles') {
        timezoneDisplay = '\n7 days\nPacific Time (PT)';
      } else {
        timezoneDisplay = `\n7 days\n${timezone.split('/')[1]?.replace('_', ' ') || timezone} Time`;
      }
    }
    
    return `${startStr} - ${endStr}${timezoneDisplay}`;
  }

  const addPettyExpense = () => {
    setPettyExpenses(prev => [...prev, { description: '', amount: 0 }]);
  };

  const removePettyExpense = (index) => {
    setPettyExpenses(prev => prev.filter((_, i) => i !== index));
  };

  const updatePettyExpense = (index, field, value) => {
    setPettyExpenses(prev => prev.map((expense, i) => 
      i === index ? { ...expense, [field]: value } : expense
    ));
  };

  const clearPettyExpenses = () => {
    setPettyExpenses([]);
  };

  // PDF Generation Functions 
  const generateDriverStatementPDF = (statementData) => {
    if (!statementData || !document) {
      console.error('Missing data for PDF generation');
      return;
    }
    const { company, driver, truck, period, loads, totals, deductions, bonuses, calculations } = statementData;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
          .company-info { margin-bottom: 20px; }
          .driver-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .period-info { background: #f5f5f5; padding: 10px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .totals { background: #e8f4f8; }
          .calculations { background: #f0f8f0; }
          .final-amount { font-size: 18px; font-weight: bold; background: #d4edda; }
          .text-right { text-align: right; }
          .negative { color: red; }
          .positive { color: green; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>DRIVER STATEMENT</h1>
          <h2>${company?.name || 'Company Name'}</h2>
          <p>${company?.address || ''} | ${company?.phone || ''} | ${company?.email || ''}</p>
        </div>
        
        <div class="driver-info">
          <div>
            <h3>Driver Information</h3>
            <p><strong>Name:</strong> ${driver.name}</p>
            <p><strong>Truck Unit:</strong> ${truck.unitNumber || truck.truckNumber || 'N/A'}</p>
            <p><strong>Payment Type:</strong> ${driver.paymentType === 'percentage' ? `${driver.paymentRate}% of gross` : `$${driver.paymentRate}/mile`}</p>
          </div>
          <div>
            <h3>Statement Period</h3>
            <p><strong>Period:</strong> ${period}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
        
        <div class="period-info">
          <h3>Period Summary</h3>
          <p><strong>Total Loads:</strong> ${totals.loadCount} | <strong>Total Miles:</strong> ${totals.totalMiles.toLocaleString()} | <strong>Total Gross Revenue:</strong> $${totals.totalGross.toFixed(2)}</p>
        </div>

        <h3>Load Details</h3>
        <table>
          <thead>
            <tr>
              <th>Load ID</th>
              <th>Pickup → Delivery</th>
              <th>Pickup Date</th>
              <th>Delivery Date</th>
              <th>Miles</th>
              <th>Rate</th>
              <th>Driver Pay</th>
            </tr>
          </thead>
          <tbody>
            ${loads.map(load => `
              <tr>
                <td>${load.loadId}</td>
                <td>${extractCityState(load.pickupLocation)} → ${extractCityState(load.deliveryLocation)}</td>
                <td>${load.actualPickup ? new Date(load.actualPickup).toLocaleDateString() : 'N/A'}</td>
                <td>${load.actualDelivery ? new Date(load.actualDelivery).toLocaleDateString() : 'N/A'}</td>
                <td>${load.mileage || 0}</td>
                <td class="text-right">$${(load.rate || 0).toFixed(2)}</td>
                <td class="text-right">$${load.compensation.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td colspan="4"><strong>TOTALS</strong></td>
              <td><strong>${totals.totalMiles.toLocaleString()}</strong></td>
              <td class="text-right"><strong>$${totals.totalGross.toFixed(2)}</strong></td>
              <td class="text-right"><strong>$${calculations.grossEarnings.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>

        ${bonuses.length > 0 ? `
        <h3>Bonuses</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${bonuses.map(bonus => `
              <tr>
                <td>${bonus.date ? new Date(bonus.date).toLocaleDateString() : 'N/A'}</td>
                <td>${bonus.description}</td>
                <td class="text-right positive">+$${bonus.amount.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td colspan="2"><strong>Total Bonuses or reimbursements</strong></td>
              <td class="text-right"><strong>+$${calculations.totalBonuses.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
        ` : ''}

        ${deductions.length > 0 ? `
        <h3>Deductions</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${deductions.map(deduction => `
              <tr>
                <td>${deduction.date ? new Date(deduction.date).toLocaleDateString() : 'N/A'}</td>
                <td>${deduction.description}${deduction.citationNumber ? ` (Citation: ${deduction.citationNumber})` : ''}</td>
                <td class="text-right negative">-$${deduction.amount.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td colspan="2"><strong>Total Deductions</strong></td>
              <td class="text-right"><strong>-$${calculations.totalDeductions.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
        ` : ''}

        <table class="calculations">
          <tr>
            <td><strong>Gross Earnings</strong></td>
            <td class="text-right"><strong>$${calculations.grossEarnings.toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td><strong>Total Bonuses or reimbursements</strong></td>
            <td class="text-right positive"><strong>+$${calculations.totalBonuses.toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td><strong>Total Deductions</strong></td>
            <td class="text-right negative"><strong>-$${calculations.totalDeductions.toFixed(2)}</strong></td>
          </tr>
          <tr class="final-amount">
            <td><strong>NET PAY TO DRIVER</strong></td>
            <td class="text-right"><strong>$${calculations.netPay.toFixed(2)}</strong></td>
          </tr>
        </table>

        <div style="margin-top: 40px; font-size: 12px; color: #666;">
          <p>Generated on ${new Date().toLocaleString()} by ${statementData.generatedBy}</p>
          <p>This statement covers the period from ${period}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const generateOwnerStatementPDF = (statementData) => {
    const { owner, truck, driver, period, loads, totalRevenue, totalDriverCompensation, ownerRevenue, weeklyDeductions, deductionDetails } = statementData;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
          .owner-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .period-info { background: #f5f5f5; padding: 10px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .totals { background: #e8f4f8; }
          .calculations { background: #f0f8f0; }
          .final-amount { font-size: 18px; font-weight: bold; background: #d4edda; }
          .text-right { text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>OWNER STATEMENT</h1>
          <h2>${owner?.name || 'Owner/Company Name'}</h2>
          <p>${owner?.address || ''} | ${owner?.phone || ''} | ${owner?.email || ''}</p>
        </div>
        
        <div class="owner-info">
          <div>
            <h3>Truck Information</h3>
            <p><strong>Unit Number:</strong> ${truck.unitNumber || truck.truckNumber || 'N/A'}</p>
            <p><strong>Make/Model:</strong> ${truck.make} ${truck.model}</p>
            <p><strong>Assigned Driver:</strong> ${driver.name}</p>
          </div>
          <div>
            <h3>Statement Period</h3>
            <p><strong>Period:</strong> ${period}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <h3>Load Revenue Details</h3>
        <table>
          <thead>
            <tr>
              <th>Load ID</th>
              <th>Pickup → Delivery</th>
              <th>Delivery Date</th>
              <th>Miles</th>
              <th>Gross Revenue</th>
              <th>Driver Pay</th>
            </tr>
          </thead>
          <tbody>
            ${loads.map(load => `
              <tr>
                <td>${load.loadId}</td>
                <td>${extractCityState(load.pickupLocation)} → ${extractCityState(load.deliveryLocation)}</td>
                <td>${load.actualDelivery ? new Date(load.actualDelivery).toLocaleDateString() : 'N/A'}</td>
                <td>${load.mileage || 0}</td>
                <td class="text-right">$${(load.rate || 0).toFixed(2)}</td>
                <td class="text-right">$${load.driverCompensation.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td colspan="4"><strong>TOTALS</strong></td>
              <td class="text-right"><strong>$${totalRevenue.toFixed(2)}</strong></td>
              <td class="text-right"><strong>$${totalDriverCompensation.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>

        ${statementData.deductionDetails && statementData.deductionDetails.length > 0 ? `
        <h3>Owner Operator Deductions</h3>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${statementData.deductionDetails.map(deduction => `
              <tr>
                <td>${deduction.name}</td>
                <td>${deduction.type.charAt(0).toUpperCase() + deduction.type.slice(1)}</td>
                <td class="text-right negative">-$${deduction.amount.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td colspan="2"><strong>Total Deductions</strong></td>
              <td class="text-right"><strong>-$${statementData.weeklyDeductions.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
        ` : ''}

        <table class="calculations">
          <tr>
            <td><strong>Total Gross Revenue</strong></td>
            <td class="text-right"><strong>$${totalRevenue.toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td><strong>Less: Driver Compensation</strong></td>
            <td class="text-right"><strong>-$${totalDriverCompensation.toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td><strong>Less: Owner Operator Deductions</strong></td>
            <td class="text-right negative"><strong>-$${statementData.weeklyDeductions.toFixed(2)}</strong></td>
          </tr>
          <tr class="final-amount">
            <td><strong>NET REVENUE TO OWNER</strong></td>
            <td class="text-right"><strong>$${ownerRevenue.toFixed(2)}</strong></td>
          </tr>
        </table>

        <div style="margin-top: 40px; font-size: 12px; color: #666;">
          <p>Generated on ${new Date().toLocaleString()} by ${statementData.generatedBy}</p>
          <p>This statement covers the period from ${period}</p>
          <p><em>Note: This statement shows gross revenue and driver compensation only. Additional expenses, fuel costs, maintenance, and other operating costs are not reflected.</em></p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // Load data
  useEffect(() => {
    if (!loggedInUser || !loggedInUser.tenantId) {
      setDrivers([]);
      setTrucks([]);
      setCompanies([]);
      setLoads([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Load drivers with real-time updates
    const driversQuery = query(
      collection(db, 'drivers'),
      where('tenantId', '==', loggedInUser.tenantId)
    );
    const unsubscribeDrivers = onSnapshot(driversQuery, (snapshot) => {
      const driversData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Drivers loaded:', driversData.length);
      setDrivers(driversData);
    }, (error) => {
      console.error('Error fetching drivers:', error);
      setDrivers([]);
    });

    // Load trucks with real-time updates
    const trucksQuery = query(
      collection(db, 'trucks'),
      where('tenantId', '==', loggedInUser.tenantId)
    );
    const unsubscribeTrucks = onSnapshot(trucksQuery, (snapshot) => {
      const trucksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Trucks loaded:', trucksData.length);
      setTrucks(trucksData);
    }, (error) => {
      console.error('Error fetching trucks:', error);
      setTrucks([]);
    });

    // Load companies
    const companiesQuery = query(
      collection(db, 'companies'),
      where('tenantId', '==', loggedInUser.tenantId)
    );
    const unsubscribeCompanies = onSnapshot(companiesQuery, (snapshot) => {
      const companiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Companies loaded:', companiesData.length);
      setCompanies(companiesData);
    }, (error) => {
      console.error('Error fetching companies:', error);
      setCompanies([]);
    });

    // Load loads
    const loadsQuery = query(
      collection(db, 'loads'),
      where('tenantId', '==', loggedInUser.tenantId)
    );
    const unsubscribeLoads = onSnapshot(loadsQuery, (snapshot) => {
      const loadsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Loads loaded:', loadsData.length);
      setLoads(loadsData);
    }, (error) => {
      console.error('Error fetching loads:', error);
      setLoads([]);
    });

    setIsLoading(false);

    return () => {
      unsubscribeDrivers();
      unsubscribeTrucks();
      unsubscribeCompanies();
      unsubscribeLoads();
    };
  }, [loggedInUser]);

  // Auto-select truck when driver is selected
  useEffect(() => {
    if (selectedDriver) {
      const driver = drivers.find(d => d.id === selectedDriver);
      if (driver && driver.assignedTruckId) {
        setSelectedTruck(driver.assignedTruckId);
      } else {
        setSelectedTruck('');
      }
    }
  }, [selectedDriver, drivers]);

  // Helper function to extract city and state from full address
  const extractCityState = (fullAddress) => {
    if (!fullAddress) return 'N/A';
    
    // Split by comma and get the last two parts (typically city, state zip)
    const parts = fullAddress.split(',').map(part => part.trim());
    
    if (parts.length >= 2) {
      const cityState = parts[parts.length - 2]; // City
      const stateZip = parts[parts.length - 1]; // State + ZIP
      
      // Extract just state (first 2 characters after any leading spaces)
      const state = stateZip.split(' ')[0];
      
      return `${cityState}, ${state}`;
    }
    
    // Fallback: return the last part if can't parse properly
    return parts[parts.length - 1] || fullAddress;
  };

  const generateDriverStatement = async () => {
    if (!selectedDriver || !selectedTruck || !selectedStartDate || !selectedEndDate) {
      alert('Please select a driver, truck, and date range');
      return;
    }

    setIsGenerating(true);
    try {
      const driver = drivers.find(d => d.id === selectedDriver);
      const truck = trucks.find(t => t.id === selectedTruck);
      const driverCompany = companies.find(c => c.id === driver.assignedCompanyId);
      
      const timezone = applicationTimeZone;
      console.log('Generating driver statement with timezone:', timezone);
      
      const periodLoads = loads.filter(load => {
        const actualDelivery = load.actualDEL?.toDate(); // Changed from actualDelivery to actualDEL
        if (!actualDelivery) return false;
        
        // Format the delivery date as YYYY-MM-DD for simple comparison
        const deliveryDateStr = actualDelivery.getFullYear() + '-' + 
          String(actualDelivery.getMonth() + 1).padStart(2, '0') + '-' + 
          String(actualDelivery.getDate()).padStart(2, '0');
        
        return deliveryDateStr >= selectedStartDate && 
               deliveryDateStr <= selectedEndDate && 
               load.driverId === selectedDriver &&
               ['Delivered', 'Cancelled'].includes(load.status); // Changed to match accounting page
      });

      // Calculate totals and generate statement
      let totalGross = 0;
      let totalMiles = 0;
      let totalCompensation = 0;
      const compensationDetails = [];

      periodLoads.forEach(load => {
        totalGross += load.amount || 0;  // ← Change from load.rate
        totalMiles += load.mileage || 0;
        
        let compensation = 0;
        
        if (driver.paymentType === 'percentage' && driver.paymentRate) {
          compensation = (load.amount * parseFloat(driver.paymentRate)) / 100;  // ← Change from load.rate
        } else if (driver.paymentType === 'per_mile' && driver.paymentRate) {
          compensation = load.mileage * parseFloat(driver.paymentRate);
        }
        totalCompensation += compensation;

        compensationDetails.push({
          loadId: load.load_id,  // ← Fixed
          pickupLocation: load.pickupLocation,
          deliveryLocation: load.deliveryLocation,
          actualPickup: load.actualPU?.toDate(),  // ← Fixed
          actualDelivery: load.actualDEL?.toDate(),  // ← Fixed
          mileage: load.mileage,
          rate: load.amount,  // ← Fixed
          compensation: compensation
        });
      });

      // Load violations, bonuses, etc.
      const violationsQuery = query(
        collection(db, 'violations'),
        where('tenantId', '==', loggedInUser.tenantId),
        where('driverId', '==', selectedDriver)
      );
      const violationsSnapshot = await getDocs(violationsQuery);
      const violationRecords = violationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const inspectionsQuery = query(
        collection(db, 'inspections'),
        where('tenantId', '==', loggedInUser.tenantId),
        where('driverId', '==', selectedDriver)
      );
      const inspectionsSnapshot = await getDocs(inspectionsQuery);
      const inspectionRecords = inspectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const bonusesQuery = query(
        collection(db, 'bonuses'),
        where('tenantId', '==', loggedInUser.tenantId)
      );
      const bonusesSnapshot = await getDocs(bonusesQuery);
      const bonusConfigs = bonusesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const penaltiesQuery = query(
        collection(db, 'penalties'),
        where('tenantId', '==', loggedInUser.tenantId)
      );
      const penaltiesSnapshot = await getDocs(penaltiesQuery);
      const penaltyConfigs = penaltiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // FIXED: Simplified violation filtering using date strings
      const periodViolations = violationRecords.filter(record => {
        if (record.date) {
          const violationDate = record.date.toDate();
          const violationDateStr = violationDate.getFullYear() + '-' + 
            String(violationDate.getMonth() + 1).padStart(2, '0') + '-' + 
            String(violationDate.getDate()).padStart(2, '0');
          
          return violationDateStr >= selectedStartDate && 
                 violationDateStr <= selectedEndDate;
        }
        return false;
      });

      // FIXED: Simplified inspection filtering using date strings
      const periodInspections = inspectionRecords.filter(record => {
        if (record.date) {
          const inspectionDate = record.date.toDate();
          const inspectionDateStr = inspectionDate.getFullYear() + '-' + 
            String(inspectionDate.getMonth() + 1).padStart(2, '0') + '-' + 
            String(inspectionDate.getDate()).padStart(2, '0');
          
          return inspectionDateStr >= selectedStartDate && 
                 inspectionDateStr <= selectedEndDate;
        }
        return false;
      });

      const deductions = [];
      let totalDeductions = 0;

      periodViolations.forEach(violation => {
        const penaltyConfig = penaltyConfigs.find(p => 
          p.violationType === violation.type && p.category === violation.category
        );
        
        const amount = penaltyConfig ? penaltyConfig.amount : (violation.fine || 0);
        totalDeductions += amount;
        deductions.push({
          type: 'violation',
          description: `${violation.type} - ${violation.category}${violation.location ? ` (${violation.location})` : ''}`,
          amount: amount,
          date: violation.date?.toDate(),
          citationNumber: violation.citationNumber || null
        });
      });

      const depositTotal = driver.depositAmount || 0;
      const depositPaid = driver.depositPaid || 0;
      const depositRemaining = depositTotal - depositPaid;
      
      if (depositRemaining > 0 && driver.depositWeeklyIncrement) {
        const weeklyDepositDeduction = Math.min(driver.depositWeeklyIncrement, depositRemaining);
        totalDeductions += weeklyDepositDeduction;
        deductions.push({
          type: 'deposit',
          description: `Deposit Deduction (Remaining: $${depositRemaining.toFixed(2)})`,
          amount: weeklyDepositDeduction,
          date: new Date()
        });
      }

      const bonuses = [];
      let totalBonuses = 0;

      periodInspections.forEach(inspection => {
        let applicableBonus = null;
        
        if (inspection.result === 'Pass' && (inspection.violationCount || 0) === 0) {
          const inspectionLevel = inspection.level || '1';
          if (inspectionLevel === '1') {
            applicableBonus = bonusConfigs.find(b => b.name.includes('Level I Inspection Pass'));
          } else if (inspectionLevel === '2') {
            applicableBonus = bonusConfigs.find(b => b.name.includes('Level II Inspection Pass'));
          } else if (inspectionLevel === '3') {
            applicableBonus = bonusConfigs.find(b => b.name.includes('Level III Inspection Pass'));
          }
        }

        if (applicableBonus) {
          totalBonuses += applicableBonus.amount;
          bonuses.push({
            type: 'inspection_bonus',
            description: `${applicableBonus.name} - Level ${inspection.level} on ${inspection.date?.toDate().toLocaleDateString()}`,
            amount: applicableBonus.amount,
            date: inspection.date?.toDate()
          });
        }
      });

      if (periodViolations.length === 0 && periodLoads.length > 0) {
        const monthlyBonus = bonusConfigs.find(b => b.name.includes('Monthly Safety Bonus'));
        if (monthlyBonus) {
          totalBonuses += monthlyBonus.amount;
          bonuses.push({
            type: 'monthly_bonus',
            description: `${monthlyBonus.name} - Clean record for period`,
            amount: monthlyBonus.amount,
            date: new Date()
          });
        }
      }

      // Add petty expenses as reimbursements
      pettyExpenses.forEach(expense => {
        if (expense.description && expense.amount > 0) {
          totalBonuses += expense.amount;
          bonuses.push({
            type: 'reimbursement',
            description: `Reimbursement: ${expense.description}`,
            amount: expense.amount,
            date: new Date()
          });
        }
      });

      const grossEarnings = totalCompensation;
      const adjustments = totalBonuses - totalDeductions;
      const netPay = grossEarnings + adjustments;

      const statementData = {
        company: driverCompany,
        driver: driver,
        truck: truck,
        truckNumber: truck.unitNumber || truck.truckNumber || 'N/A',
        period: formatWeekRange(selectedStartDate, selectedEndDate, timezone),
        loads: compensationDetails,
        totals: {
          loadCount: periodLoads.length,
          totalGross: totalGross,
          totalMiles: totalMiles,
          grossEarnings: grossEarnings
        },
        deductions: deductions,
        bonuses: bonuses,
        calculations: {
          grossEarnings: grossEarnings,
          totalBonuses: totalBonuses,
          totalDeductions: totalDeductions,
          netPay: netPay
        },
        compensationDetails: {
          type: driver.paymentType,
          rate: driver.paymentType === 'percentage' ? 
                `${driver.paymentRate}%` : 
                `$${driver.paymentRate}/mile`
        },
        generatedAt: new Date(),
        generatedBy: loggedInUser.displayName || loggedInUser.email,
        timezone: timezone
      };

      console.log('Driver Statement Data:', statementData);
      
      generateDriverStatementPDF(statementData);
      clearPettyExpenses();
      
    } catch (error) {
      console.error('Error generating driver statement:', error);
      alert('Error generating statement. Please try again.');
    }
    setIsGenerating(false);
  };

  const generateOwnerStatement = async () => {
    if (!selectedDriver || !selectedTruck || !selectedStartDate || !selectedEndDate) {
      alert('Please select a driver, truck, and date range');
      return;
    }

    setIsGenerating(true);
    try {
      const driver = drivers.find(d => d.id === selectedDriver);
      const truck = trucks.find(t => t.id === selectedTruck);
      
      // NEW: Check if truck is Owner Operator
      if (truck.type !== 'Owner Operator') {
        alert(`Truck with driver ${driver.name} is not marked as Owner Operator. Please change settings to generate owner operator statement.`);
        setIsGenerating(false);
        return;
      }
      
      const truckOwner = {
        name: truck.ownedBy || 'Owner/Company Name Not Available',
        address: '',
        phone: '',
        email: ''
      };    
      
      const timezone = applicationTimeZone;
      console.log('Generating owner statement with timezone:', timezone);
      
      // Load owner operator fee settings
      const feeSettingsDoc = await getDoc(doc(db, 'ownerOperatorFees', loggedInUser.tenantId));
      const standardFees = feeSettingsDoc.exists() ? feeSettingsDoc.data().standardFees : {};
      
      // Load custom fees
      const customFeesQuery = query(
        collection(db, 'customOwnerOperatorFees'),
        where('tenantId', '==', loggedInUser.tenantId),
        where('active', '==', true)
      );
      const customFeesSnapshot = await getDocs(customFeesQuery);
      const customFees = customFeesSnapshot.docs.map(doc => doc.data());
      
      // Filter loads for the period
      const periodLoads = loads.filter(load => {
        const actualDelivery = load.actualDEL?.toDate();
        if (!actualDelivery) return false;
        
        const deliveryDateStr = actualDelivery.getFullYear() + '-' + 
          String(actualDelivery.getMonth() + 1).padStart(2, '0') + '-' + 
          String(actualDelivery.getDate()).padStart(2, '0');
        
        return deliveryDateStr >= selectedStartDate && 
               deliveryDateStr <= selectedEndDate && 
               load.truckId === selectedTruck &&
               ['Delivered', 'Cancelled'].includes(load.status);
      });

      let totalRevenue = 0;
      let totalDriverCompensation = 0;
      const loadDetails = [];

      periodLoads.forEach(load => {
        totalRevenue += load.amount || 0;
        
        let driverComp = 0;
        
        // NEW: Only calculate driver compensation if owner is NOT the driver
        if (!truck.isOwnerDriver) {
          if (driver.paymentType === 'percentage' && driver.paymentRate) {
            driverComp = (load.amount * parseFloat(driver.paymentRate)) / 100;
          } else if (driver.paymentType === 'per_mile' && driver.paymentRate) {
            driverComp = load.mileage * parseFloat(driver.paymentRate);
          }
        }
        
        totalDriverCompensation += driverComp;
        
        loadDetails.push({
          loadId: load.load_id,
          pickupLocation: load.pickupLocation,
          deliveryLocation: load.deliveryLocation,
          actualPickup: load.actualPU?.toDate(),
          actualDelivery: load.actualDEL?.toDate(),
          mileage: load.mileage,
          rate: load.amount,
          driverCompensation: driverComp
        });
      });

      // Calculate weekly deductions
      let weeklyDeductions = 0;
      const deductionDetails = [];

      // Standard fees from PayRulesPage
      if (standardFees.weeklyInsurance) {
        weeklyDeductions += standardFees.weeklyInsurance;
        deductionDetails.push({
          name: 'Weekly Insurance',
          amount: standardFees.weeklyInsurance,
          type: 'standard'
        });
      }

      if (standardFees.weeklyPhysicalDamage) {
        weeklyDeductions += standardFees.weeklyPhysicalDamage;
        deductionDetails.push({
          name: 'Physical Damage Insurance',
          amount: standardFees.weeklyPhysicalDamage,
          type: 'standard'
        });
      }

      if (standardFees.eldServiceFee) {
        weeklyDeductions += standardFees.eldServiceFee;
        deductionDetails.push({
          name: 'ELD Service Fee',
          amount: standardFees.eldServiceFee,
          type: 'standard'
        });
      }

      if (standardFees.statePermitsFee) {
        weeklyDeductions += standardFees.statePermitsFee;
        deductionDetails.push({
          name: 'State Permits Fee',
          amount: standardFees.statePermitsFee,
          type: 'standard'
        });
      }

      if (standardFees.administrativeFee) {
        weeklyDeductions += standardFees.administrativeFee;
        deductionDetails.push({
          name: 'Administrative Fee',
          amount: standardFees.administrativeFee,
          type: 'standard'
        });
      }

      // Dispatch fee (percentage of revenue)
      if (standardFees.dispatchFeePercent) {
        const dispatchFee = (totalRevenue * standardFees.dispatchFeePercent) / 100;
        weeklyDeductions += dispatchFee;
        deductionDetails.push({
          name: `Dispatch Fee (${standardFees.dispatchFeePercent}%)`,
          amount: dispatchFee,
          type: 'percentage'
        });
      }

      // Truck payment (from TrucksPage)
      if (truck.paymentPerWeek) {
        const truckPayment = parseFloat(truck.paymentPerWeek);
        weeklyDeductions += truckPayment;
        deductionDetails.push({
          name: 'Truck Payment',
          amount: truckPayment,
          type: 'truck'
        });
      }

      // Trailer payment (from TrucksPage)
      if (truck.trailerPaymentPerWeek) {
        const trailerPayment = parseFloat(truck.trailerPaymentPerWeek);
        weeklyDeductions += trailerPayment;
        deductionDetails.push({
          name: 'Trailer Payment',
          amount: trailerPayment,
          type: 'truck'
        });
      }

      // Custom weekly fees
      customFees.forEach(fee => {
        if (fee.frequency === 'weekly') {
          const amount = fee.feeType === 'percentage' ? 
            (totalRevenue * fee.amount / 100) : 
            fee.amount;
          weeklyDeductions += amount;
          deductionDetails.push({
            name: fee.name,
            amount: amount,
            type: 'custom'
          });
        }
      });

      // Calculate final owner revenue
      const netOwnerRevenue = totalRevenue - totalDriverCompensation - weeklyDeductions;

      const statementData = {
        owner: truckOwner,
        truck: truck,
        driver: driver,
        period: formatWeekRange(selectedStartDate, selectedEndDate, timezone),
        loads: loadDetails,
        totalRevenue: totalRevenue,
        totalDriverCompensation: totalDriverCompensation,
        weeklyDeductions: weeklyDeductions,
        deductionDetails: deductionDetails,
        ownerRevenue: netOwnerRevenue,
        loadCount: periodLoads.length,
        generatedAt: new Date(),
        generatedBy: loggedInUser.displayName || loggedInUser.email,
        timezone: timezone,
        isOwnerDriver: truck.isOwnerDriver || false
      };

      console.log('Owner Statement Data:', statementData);
      
      generateOwnerStatementPDF(statementData);
      
    } catch (error) {
      console.error('Error generating owner statement:', error);
      alert('Error generating statement. Please try again.');
    }
    setIsGenerating(false);
  };

  if (isLoading || isLoadingTimeZone) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <div className="ml-4">
          <p>Loading statements data...</p>
          <p className="text-sm text-gray-500">
            User: {loggedInUser?.email} | Tenant: {loggedInUser?.tenantId}
          </p>
        </div>
      </div>
    );
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Statements</h1>
          <p className="mt-2 text-sm text-gray-700">
            Generate and view driver and owner statements
          </p>
          <div className="mt-2 text-xs text-gray-500">
            User: {loggedInUser?.email} | Tenant: {loggedInUser?.tenantId} | Role: {loggedInUser?.role}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Data loaded - Drivers: {drivers.length} | Trucks: {trucks.length} | Companies: {companies.length} | Loads: {loads.length}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Timezone: {applicationTimeZone} {isLoadingTimeZone && '(loading...)'}
          </div>
        </div>
      </div>

      {/* Date Selection Controls */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Date Selection</h2>
        </div>
        <div className="p-6">
          {/* Selection Mode */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Selection Mode</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="week"
                  checked={selectionMode === 'week'}
                  onChange={(e) => setSelectionMode(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">Week Selection</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="custom"
                  checked={selectionMode === 'custom'}
                  onChange={(e) => setSelectionMode(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">Custom Date Range</span>
              </label>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-4 flex gap-2 flex-wrap">
            <button
              onClick={setCurrentWeek}
              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm"
            >
              Current Week
            </button>
            <button
              onClick={setPreviousWeek}
              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm"
            >
              Previous Week
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm"
            >
              Clear Selection
            </button>
          </div>

          {/* Date Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={selectedStartDate}
                onChange={(e) => setSelectedStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={selectedEndDate}
                onChange={(e) => setSelectedEndDate(e.target.value)}
                min={selectedStartDate}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Selected Period Display */}
          {selectedStartDate && selectedEndDate && (
            <div className="p-3 bg-blue-50 rounded-md">
              <p className="text-sm font-medium text-blue-900">
                Selected Period: {formatWeekRange(selectedStartDate, selectedEndDate, applicationTimeZone)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Calendar View */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">Calendar View</h2>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-700">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </span>
              <button
                onClick={() => navigateMonth(1)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-700 py-2">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {getDaysInMonth(currentMonth).map((date, index) => (
              <div
                key={index}
                onClick={() => handleDateClick(date)}
                className={`
                  min-h-[80px] p-2 border rounded cursor-pointer transition-colors
                  ${!date ? 'bg-gray-50 cursor-default' : 'hover:bg-gray-100'}
                  ${isDateSelected(date) ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}
                  ${isDateInRange(date) ? 'bg-blue-100' : ''}
                  ${date && formatDate(date) === formatDate(new Date()) ? 'ring-2 ring-blue-400' : ''}
                `}
              >
                {date && (
                  <div className="text-sm font-medium">
                    {date.getDate()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Driver and Truck Selection */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Statement Generation</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Driver Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Driver
              </label>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">
                  {drivers.length === 0 ? 'No drivers found...' : 'Choose driver...'}
                </option>
                {drivers.map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name || `${driver.firstName} ${driver.lastName}` || 'Unnamed Driver'}
                  </option>
                ))}
              </select>
            </div>

            {/* Truck Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Truck
              </label>
              <select
                value={selectedTruck}
                onChange={(e) => setSelectedTruck(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">
                  {trucks.length === 0 ? 'No trucks found...' : 'Choose truck...'}
                </option>
                {trucks.map(truck => (
                  <option key={truck.id} value={truck.id}>
                    {truck.unitNumber || truck.truckNumber || 'Unknown Unit'} - {truck.make} {truck.model}
                  </option>
                ))}
              </select>
            </div>

            {/* Generate Buttons */}
            <div className="flex flex-col space-y-2">
              <button
                onClick={generateDriverStatement}
                disabled={!canGenerate || !selectedDriver || !selectedTruck || !selectedStartDate || !selectedEndDate || isGenerating}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  canGenerate && selectedDriver && selectedTruck && selectedStartDate && selectedEndDate && !isGenerating
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isGenerating ? 'Generating...' : 'Generate Driver Statement'}
              </button>
              <button
                onClick={generateOwnerStatement}
                disabled={!canGenerate || !selectedDriver || !selectedTruck || !selectedStartDate || !selectedEndDate || isGenerating}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  canGenerate && selectedDriver && selectedTruck && selectedStartDate && selectedEndDate && !isGenerating
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isGenerating ? 'Generating...' : 'Generate Owner Statement'}
              </button>
            </div>

            {/* Petty Expenses & Reimbursements */}
            <div className="lg:col-span-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-md font-medium text-gray-700 mb-3">
                  Petty Expenses & Reimbursements (Optional)
                </h4>
                <div className="space-y-3">
                  {pettyExpenses.map((expense, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Description (e.g., Scale Ticket)"
                        value={expense.description}
                        onChange={(e) => updatePettyExpense(index, 'description', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Amount"
                        value={expense.amount}
                        onChange={(e) => updatePettyExpense(index, 'amount', parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        step="0.01"
                        min="0"
                      />
                      <button
                        onClick={() => removePettyExpense(index)}
                        className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addPettyExpense}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Expense
                  </button>
                  {pettyExpenses.length > 0 && (
                    <div className="text-sm text-gray-600 mt-2 font-medium">
                      Total Reimbursements: ${pettyExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Period Info */}
            <div className="flex flex-col justify-center">
              {selectedStartDate && selectedEndDate && (
                <>
                  <p className="text-sm text-gray-600">
                    <strong>Selected Period:</strong>
                  </p>
                  <p className="text-sm text-gray-900">
                    {new Date(selectedStartDate).toLocaleDateString()} - {new Date(selectedEndDate).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.ceil((new Date(selectedEndDate) - new Date(selectedStartDate)) / (1000 * 60 * 60 * 24)) + 1} days
                  </p>
                  <p className="text-xs text-gray-400">
                    {applicationTimeZone === 'America/New_York' ? 'Eastern Time (ET)' :
                     applicationTimeZone === 'America/Chicago' ? 'Central Time (CT)' :
                     applicationTimeZone === 'America/Denver' ? 'Mountain Time (MT)' :
                     applicationTimeZone === 'America/Los_Angeles' ? 'Pacific Time (PT)' :
                     `${applicationTimeZone.split('/')[1]?.replace('_', ' ') || applicationTimeZone} Time`
                    }
                  </p>
                </>
              )}
            </div>
          </div>

          {!canGenerate && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                Only Super Admin, Admin, or Accountant roles can generate statements.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}