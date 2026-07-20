import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import UserManagement from "./settings/UserManagement";
import CompanyManagement from "./settings/CompanyManagement";
import UserCompensation from "./settings/UserCompensation";
import BonusPenalty from "./settings/BonusPenalty";
import ApplicationSettings from "./settings/ApplicationSettings";
import AuditLogPage from "./settings/AuditLogPage";
import SubscriptionManagement from "./settings/SubscriptionManagement";
import PayRulesPage from "./settings/PayRulesPage"; // Added import

// Define tabs, including Payment Terms and Subscription
const tabs = [
  { id: "user", label: "User Management" },
  { id: "company", label: "Company Management" },
  { id: "comp", label: "User Compensation" },
  { id: "adjust", label: "Bonus or Penalty" },
  { id: "payment", label: "Payment Terms" }, // Added Payment Terms tab
  { id: "subscription", label: "Subscription" },
  { id: "app", label: "Application Settings" },
  { id: "audit", label: "Audit Log" }
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("user");
  const [searchParams] = useSearchParams();

  // This effect runs once when the component loads
  useEffect(() => {
    // Check the URL for a 'tab' parameter (e.g., ?tab=subscription or ?tab=payment)
    const tabFromUrl = searchParams.get('tab');

    // If the URL specifies a valid tab, make it active
    if (tabFromUrl && tabs.find(tab => tab.id === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  return (
    <div className="max-w-full mx-auto py-4 px-2 sm:px-6 lg:px-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Settings</h1>
      <div className="bg-white rounded-lg shadow-md">
        {/* Tab Buttons */}
        <div className="flex flex-wrap border-b border-gray-200 bg-gray-50 rounded-t-lg">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`px-3 sm:px-6 py-3 font-medium text-sm sm:text-base focus:outline-none whitespace-nowrap
                ${
                  activeTab === tab.id
                    ? "border-b-2 border-blue-500 text-blue-600 bg-white"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }
                ${tab.id === tabs[0].id ? 'rounded-tl-lg' : ''}
                ${tab.id === tabs[tabs.length - 1].id ? 'rounded-tr-lg sm:rounded-tr-none' : ''}
              `}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === "user" && <UserManagement />}
          {activeTab === "company" && <CompanyManagement />}
          {activeTab === "comp" && <UserCompensation />}
          {activeTab === "adjust" && <BonusPenalty />}
          {activeTab === "payment" && <PayRulesPage />} {/* Added Payment Terms content */}
          {activeTab === "subscription" && <SubscriptionManagement />}
          {activeTab === "app" && <ApplicationSettings />}
          {activeTab === "audit" && <AuditLogPage />}
        </div>
      </div>
    </div>
  );
}