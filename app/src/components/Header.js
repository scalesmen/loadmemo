import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase'; // Adjust path as needed
import { collection, onSnapshot, query, where, orderBy, limit, updateDoc, doc } from "firebase/firestore";
import { signOut } from "firebase/auth";

export default function Header({ loggedInUser, onCompanyFilterChange }) { // Pass loggedInUser and a callback
  // const [companies, setCompanies] = useState([]);
  // const [selectedCompany, setSelectedCompany] = useState("all"); // Default to "all"
  // const [searchTerm, setSearchTerm] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // For sidebar toggle

  // 🔔 Notification states
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const navigate = useNavigate();

  // Helper function to determine tenant ID
  const determineTenantId = (user) => {
    if (!user) return null;
    if (user.tenantId) return user.tenantId;
    if (user.assignedCompanyId) return user.assignedCompanyId;
    if (user.assignedCompanyName) return `tenant_${user.assignedCompanyName.toLowerCase().replace(/\s+/g, '_')}`;
    return null;
  };

  // 🔔 Fetch driver activity and admin notifications for the logged-in user
  useEffect(() => {
    if (!loggedInUser?.uid) return;

    const tenantId = determineTenantId(loggedInUser);
    if (!tenantId) return;

    // Query notifications for this user and tenant
    // Only get driver activity and admin notifications
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", loggedInUser.uid),
      where("tenantId", "==", tenantId),
      where("type", "in", ["driver_activity", "admin_update"]), // Only these types
      orderBy("createdAt", "desc"),
      limit(20) // Get last 20 notifications
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const notificationsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));

      setNotifications(notificationsList);
      
      // Count unread notifications
      const unreadNotifications = notificationsList.filter(notif => !notif.read);
      setUnreadCount(unreadNotifications.length);
      
      console.log("📱 Notifications loaded:", notificationsList.length, "Unread:", unreadNotifications.length);
    }, (error) => {
      console.error("Error fetching notifications:", error);
    });

    return () => unsubscribe();
  }, [loggedInUser]);

  // 🔔 Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        read: true,
        readAt: new Date()
      });
      console.log("✅ Notification marked as read:", notificationId);
    } catch (error) {
      console.error("❌ Error marking notification as read:", error);
    }
  };

  // 🔔 Mark all notifications as read
  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(notif => !notif.read);
    
    try {
      const promises = unreadNotifications.map(notif => 
        updateDoc(doc(db, "notifications", notif.id), {
          read: true,
          readAt: new Date()
        })
      );
      
      await Promise.all(promises);
      console.log("✅ All notifications marked as read");
    } catch (error) {
      console.error("❌ Error marking all notifications as read:", error);
    }
  };

  // 🔔 Handle notification click - only mark as read, no navigation
  const handleNotificationClick = async (notification) => {
    // Mark as read if not already read
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Don't navigate anywhere - just mark as read
    console.log("Notification clicked:", notification.message);
  };

  // 🔔 Toggle notifications panel
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // 🔔 Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showNotifications && !event.target.closest('.notifications-panel')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  // 🔔 Format notification time
  const formatNotificationTime = (date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  // 🔔 Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'driver_activity':
        return '🚛';
      case 'admin_update':
        return '👤';
      default:
        return '📢';
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login'); // Redirect to login after sign out
    } catch (error) {
      console.error("Error signing out: ", error);
      alert("Failed to sign out.");
    }
  };

  // This function would likely live in App.js to control the actual sidebar
  const toggleMobileSidebar = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
    // In a real app, this would call a function passed from App.js
    // to toggle the sidebar's visibility state in App.js
    console.log("Toggle mobile sidebar (visual only in Header.js)");
     const sidebar = document.getElementById('app-sidebar'); // Assuming sidebar has this ID
    if (sidebar) {
        sidebar.classList.toggle('-translate-x-full');
    }
  };

  return (
    <header className="bg-white shadow-md p-3 sm:p-4 flex justify-between items-center sticky top-0 z-40">
      {/* Mobile Menu Button (only shown on md and below, triggers sidebar in App.js) */}
      <button
        className="md:hidden text-gray-500 focus:outline-none focus:text-gray-700"
        onClick={toggleMobileSidebar} // This should ideally call a function from App.js
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Search Bar (hidden on small screens, shown on md and up) */}
      {/* <div className="relative flex-1 max-w-xs hidden md:block ml-4">
        <form onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Search (Loads, Drivers...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border rounded-md py-1.5 px-3 pl-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
          <button type="submit" className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
        </form>
      </div> */}

      {/* Company Filter (Centered, might need adjustment for small screens) */}
      {/* <div className="flex-1 flex justify-center px-2 sm:px-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="globalCompanyFilter" className="text-sm font-medium text-gray-600 hidden lg:inline">
            Company:
          </label>
          <select
            id="globalCompanyFilter"
            name="companyFilter"
            value={selectedCompany}
            onChange={handleCompanyChange}
            className="border rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8 bg-white shadow-sm"
          >
            <option value="all">All Companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      </div> */}

      {/* Spacer to push user info to the right since search and company filter are commented out */}
      <div className="flex-1"></div>

      {/* User Info & Actions (Flex shrink 0 to prevent shrinking) */}
      <div className="flex items-center space-x-3 sm:space-x-4 flex-shrink-0">
        {/* 🔔 Notifications Button */}
        <div className="relative notifications-panel">
          <button 
            onClick={toggleNotifications}
            className="text-gray-500 hover:text-gray-700 relative p-1 focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.017 5.454 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* 🔔 Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border py-2 z-50 max-h-96 overflow-y-auto">
              <div className="flex justify-between items-center px-4 py-2 border-b">
                <h3 className="font-semibold text-gray-800">Notifications</h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 17h5l-5 5h5v-5z" />
                  </svg>
                  <p>No notifications yet</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                        !notification.read ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <span className="text-lg flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatNotificationTime(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative group">
          <button className="flex items-center focus:outline-none">
            <img
              src={loggedInUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(loggedInUser?.email || 'User')}&background=random&size=32`}
              alt="User Avatar"
              className="w-8 h-8 rounded-full"
            />
            <span className="ml-2 text-sm hidden md:inline">{loggedInUser?.displayName || loggedInUser?.email}</span>
          </button>
          {/* Dropdown for logout - improve with proper dropdown component later */}
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 hidden group-hover:block">
            <div className="px-4 py-2 text-xs text-gray-500">
              {loggedInUser?.email}
            </div>
            <Link to="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Settings</Link>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}