// src/components/OnboardingGuide.js
// 
// USAGE: Import and place in your main App layout (e.g., inside authenticated routes)
//
//   import OnboardingGuide from './OnboardingGuide';
//   
//   // Inside your layout component that wraps authenticated pages:
//   return (
//     <>
//       <OnboardingGuide />
//       <Sidebar />
//       <MainContent />
//     </>
//   );
//
// HOW IT WORKS:
// - On first render, checks the logged-in user's Firestore doc for `onboardingCompleted: true`
// - If not completed, shows the guided walkthrough overlay
// - When user finishes or skips, sets `onboardingCompleted: true` on their user doc
// - Never shows again after that
//
// FIRESTORE FIELD ADDED:
//   users/{uid}.onboardingCompleted = true/false
//

import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ─────────────────────────────────────────────
// STEP DEFINITIONS - Your actual LoadMemo workflow
// ─────────────────────────────────────────────

const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    icon: '👋',
    title: 'Welcome to LoadMemo!',
    subtitle: "Let's get your fleet dispatching in minutes",
    description: "We'll walk you through 8 simple steps to get fully set up. Your account is already created — now let's configure your operation.",
    actionLabel: null,
    navigateTo: null,
    tips: [
      'This takes about 5-10 minutes',
      'You can come back to any step later',
      'Everything auto-saves as you go'
    ],
  },
  {
    id: 'company',
    icon: '🏢',
    title: 'Step 1: Create Company Profiles',
    subtitle: 'Add your MC authorities and choose your commodity type',
    description: "Go to Settings → Company Profiles and add each company (MC/DOT authority) you operate under. Select what you haul — dry van, auto hauling, reefer, flatbed, etc. This determines which fields appear throughout the app.",
    actionLabel: 'Go to Settings →',
    navigateTo: '/settings',
    tips: [
      'You can add multiple companies for multi-MC operations',
      'The commodity type you choose customizes the entire experience',
      'Upload your company logo — it appears on BOLs and invoices'
    ],
  },
  {
    id: 'truck',
    icon: '🚛',
    title: 'Step 2: Add Trucks & Link to Company',
    subtitle: 'Register your equipment and assign to the right MC',
    description: "Go to the Trucks page and click 'Add New Truck'. Enter the unit number, year/make, and select the truck type (Company Truck, Owner Operator, or Leased). Assign it to the company you just created. New trucks start as Inactive — activate when ready.",
    actionLabel: 'Go to Trucks →',
    navigateTo: '/trucks',
    tips: [
      'Trucks start as Inactive by default — activate from the Trucks page',
      'You can add trailer info (unit #, payment/week) right on the truck',
      "For Owner Operators, check 'Is owner driver too?' if they drive their own truck",
      'Track weekly payments for leased/rented trucks'
    ],
  },
  {
    id: 'driver',
    icon: '👤',
    title: 'Step 3: Add Drivers & Link to Truck + Company',
    subtitle: 'Set up driver profiles with payment terms',
    description: "Go to the Drivers page and click 'Add New Driver'. Enter their name, email, phone, and set their payment terms (% of gross or $/mile). Assign them to a truck and company. Each driver gets a unique Driver ID automatically.",
    actionLabel: 'Go to Drivers →',
    navigateTo: '/drivers',
    tips: [
      "Set payment as '% of gross' (e.g., 27%) or '$ per mile' (e.g., $0.60)",
      'Track deposits and weekly deductions right on the driver profile',
      'The Driver ID is auto-generated — find it by expanding the driver row',
      "Toggle 'Show on BOL' to control if driver info appears on Bills of Lading"
    ],
  },
  {
    id: 'connect_app',
    icon: '📱',
    title: 'Step 4: Connect the Driver App',
    subtitle: 'Get your driver on their phone in 60 seconds',
    description: "Tell your driver to download 'LoadMemo Driver' from the App Store or Google Play. Then go to the Drivers page, expand the driver's row, and copy their Driver ID. Send it to them — that's their login. No password needed.",
    actionLabel: 'Go to Drivers →',
    navigateTo: '/drivers',
    tips: [
      'Driver ID is all they need to log in — no email/password',
      'Find the Driver ID by clicking the expand arrow (▶) next to any driver',
      'Drivers can view loads, capture signatures, and submit documents from the app',
      'Works offline too — syncs when back online'
    ],
    highlight: true,
  },
  {
    id: 'upload_load',
    icon: '📄',
    title: 'Step 5: Upload Load PDFs',
    subtitle: 'Our AI reads Rate Confirmations automatically',
    description: "Go to Current Loads and click 'Upload PDF'. Drop in any Rate Confirmation from your broker. Our AI extracts pickup, delivery, rate, broker info, and more. Review the details, make any edits, and save.",
    actionLabel: 'Go to Current Loads →',
    navigateTo: '/loads',
    tips: [
      'Works with rate cons from any broker — TQL, CH Robinson, Coyote, etc.',
      'AI extracts: pickup/delivery addresses, dates, rates, broker info, load numbers',
      'You can also create loads manually with the "Add Load" button',
      'For auto haulers: vehicle VINs, makes, and models are extracted too'
    ],
  },
  {
    id: 'assign_driver',
    icon: '🎯',
    title: 'Step 6: Assign to Your Driver',
    subtitle: 'One click to dispatch — driver sees it instantly',
    description: "On the Current Loads page, use the driver dropdown on any load to assign it. The driver immediately sees the load details on their phone app, including pickup/delivery info and any attached documents.",
    actionLabel: 'Go to Current Loads →',
    navigateTo: '/loads',
    tips: [
      'Assign driver AND truck from the loads table — no need to open the load',
      'Change load status: Pending → Dispatched → Picked Up → Delivered',
      'Driver gets real-time updates on their phone',
      'Track all active loads on the Map View'
    ],
  },
  {
    id: 'accounting',
    icon: '💰',
    title: 'Step 7: Download Invoice & BOL',
    subtitle: 'Auto-generated documents from your load data',
    description: "Once a load is delivered, go to the Accounting page. Click on any load to generate a professional Invoice PDF or Bill of Lading (BOL). You can also email invoices directly to brokers with one click.",
    actionLabel: 'Go to Accounting →',
    navigateTo: '/accounting',
    tips: [
      'Invoices and BOLs auto-populate from your load data — no retyping',
      'Email invoices directly to brokers from the accounting page',
      'Track payment status: pending, invoiced, paid',
      'Add accounting notes to any load for your records'
    ],
  },
  {
    id: 'payroll',
    icon: '📊',
    title: 'Step 8: Create Driver Payment Statements',
    subtitle: 'Calculate driver pay automatically from delivered loads',
    description: "Generate weekly or per-load payment statements for each driver. The system calculates pay based on the payment terms you set (% of gross or $/mile), minus any deductions like deposits, fuel advances, or weekly truck payments.",
    actionLabel: 'Go to Accounting →',
    navigateTo: '/accounting',
    tips: [
      'Pay is auto-calculated based on driver payment terms you set in Step 3',
      'Deposit deductions are tracked and applied automatically each week',
      'Export statements as PDF for your records',
      'Track all historical payments per driver'
    ],
  },
  {
    id: 'done',
    icon: '🎉',
    title: "You're All Set!",
    subtitle: 'Your LoadMemo operation is ready to roll',
    description: null,
    actionLabel: null,
    navigateTo: null,
    tips: null,
  },
];

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export default function OnboardingGuide() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [userId, setUserId] = useState(null);
  const [isChecking, setIsChecking] = useState(true);

  // Check if user has completed onboarding
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Show onboarding if not completed
            if (!data.onboardingCompleted) {
              setShow(true);
            }
          }
        } catch (err) {
          console.error('Error checking onboarding status:', err);
        }
      }
      setIsChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Mark onboarding as completed in Firestore
  const completeOnboarding = async () => {
    if (userId) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          onboardingCompleted: true,
          onboardingCompletedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Error saving onboarding completion:', err);
      }
    }
    setShow(false);
  };

  const handleSkip = () => {
    if (window.confirm('Skip the setup guide? You can always find help in Settings.')) {
      completeOnboarding();
    }
  };

  const handleNext = () => {
    if (step < ONBOARDING_STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleGoToPage = (path) => {
    if (path) {
      window.open(path, '_blank');
    }
  };

  const handleFinish = () => {
    completeOnboarding();
  };

  if (isChecking || !show) return null;

  const current = ONBOARDING_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === ONBOARDING_STEPS.length - 1;
  const progress = ((step) / (ONBOARDING_STEPS.length - 1)) * 100;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden animate-fadeIn">

          {/* Top accent bar */}
          <div className="h-1.5 bg-gray-200">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500 ease-out rounded-r"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Header with step counter */}
          {!isFirst && !isLast && (
            <div className="flex items-center justify-between px-6 pt-5 pb-0">
              <div className="flex items-center gap-3">
                {ONBOARDING_STEPS.slice(1, -1).map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setStep(i + 1)}
                    className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-all duration-200 
                      ${i + 1 < step
                        ? 'bg-teal-500 text-white'
                        : i + 1 === step
                          ? 'bg-teal-500 text-white ring-4 ring-teal-100 scale-110'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    title={s.title}
                  >
                    {i + 1 < step ? '✓' : i + 1}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSkip}
                className="text-xs text-gray-400 hover:text-gray-600 font-medium transition"
              >
                Skip guide
              </button>
            </div>
          )}

          {/* Content */}
          <div className="px-6 pt-5 pb-6">

            {/* ─── WELCOME SCREEN ─── */}
            {isFirst && (
              <div className="text-center">
                <div className="text-6xl mb-4">{current.icon}</div>
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{current.title}</h2>
                <p className="text-lg text-gray-500 mb-2">{current.subtitle}</p>
                <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto">{current.description}</p>

                {/* Workflow preview */}
                <div className="text-left max-w-md mx-auto mb-8">
                  {ONBOARDING_STEPS.slice(1, -1).map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                        {s.icon}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-700">{s.title.replace(/^Step \d+: /, '')}</span>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  className="w-full max-w-md mx-auto py-3.5 px-6 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-bold text-base hover:from-teal-600 hover:to-cyan-700 transition shadow-lg shadow-teal-500/25"
                >
                  Let's Get Started →
                </button>
                <button
                  onClick={handleSkip}
                  className="block mx-auto mt-4 text-sm text-gray-400 hover:text-gray-600 transition"
                >
                  I already know what I'm doing — skip
                </button>
              </div>
            )}

            {/* ─── DONE SCREEN ─── */}
            {isLast && (
              <div className="text-center">
                <div className="text-6xl mb-4 animate-bounce">{current.icon}</div>
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{current.title}</h2>
                <p className="text-lg text-gray-500 mb-8">{current.subtitle}</p>

                {/* Quick reference checklist */}
                <div className="text-left max-w-md mx-auto mb-8 bg-gray-50 rounded-xl p-5">
                  <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Quick Reference Checklist</h4>
                  {[
                    { text: 'Company profiles created in Settings', nav: '/settings' },
                    { text: 'Trucks added and linked to companies', nav: '/trucks' },
                    { text: 'Drivers added with payment terms', nav: '/drivers' },
                    { text: 'Driver app downloaded & connected', nav: '/drivers' },
                    { text: 'First load uploaded via PDF', nav: '/loads' },
                    { text: 'Load assigned to driver', nav: '/loads' },
                    { text: 'Invoice & BOL generated', nav: '/accounting' },
                    { text: 'Driver payment statement created', nav: '/accounting' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 mb-2.5 group cursor-pointer" onClick={() => handleGoToPage(item.nav)}>
                      <div className="w-5 h-5 rounded border-2 border-gray-300 flex items-center justify-center flex-shrink-0 group-hover:border-teal-500 transition">
                        <span className="text-transparent group-hover:text-teal-500 text-xs transition">✓</span>
                      </div>
                      <span className="text-sm text-gray-600 group-hover:text-teal-600 transition">{item.text}</span>
                      <svg className="w-3.5 h-3.5 text-gray-300 ml-auto opacity-0 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleFinish}
                  className="w-full max-w-md mx-auto py-3.5 px-6 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-bold text-base hover:from-teal-600 hover:to-cyan-700 transition shadow-lg shadow-teal-500/25"
                >
                  🚀 Go to Dashboard
                </button>

                <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg max-w-md mx-auto">
                  <p className="text-xs text-blue-600 font-medium">
                    💬 Need help? Email support@loadmemo.com or use the chat icon anytime.
                  </p>
                </div>
              </div>
            )}

            {/* ─── MIDDLE STEPS ─── */}
            {!isFirst && !isLast && (
              <div>
                {/* Step header */}
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 border border-teal-100">
                    {current.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-extrabold text-gray-900 leading-tight">{current.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{current.subtitle}</p>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-gray-50 rounded-xl p-4 mb-5">
                  <p className="text-sm text-gray-700 leading-relaxed">{current.description}</p>
                </div>

                {/* Action button - go to page */}
                {current.actionLabel && (
                  <button
                    onClick={() => handleGoToPage(current.navigateTo)}
                    className="w-full py-3 px-5 mb-5 bg-teal-50 hover:bg-teal-100 border-2 border-teal-200 text-teal-700 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {current.actionLabel}
                    <span className="text-teal-400 text-xs font-normal">(opens new tab)</span>
                  </button>
                )}

                {/* Tips */}
                {current.tips && current.tips.length > 0 && (
                  <div className={`rounded-xl p-4 ${current.highlight ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-100'}`}>
                    <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${current.highlight ? 'text-amber-700' : 'text-blue-700'}`}>
                      {current.highlight ? '⚡ Important Tips' : '💡 Pro Tips'}
                    </h4>
                    <ul className="space-y-2">
                      {current.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.highlight ? 'bg-amber-400' : 'bg-blue-400'}`} />
                          <span className={`text-sm leading-relaxed ${current.highlight ? 'text-amber-800' : 'text-blue-800'}`}>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-600 transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>

                  <span className="text-xs text-gray-300 font-medium">
                    {step} of {ONBOARDING_STEPS.length - 2}
                  </span>

                  <button
                    onClick={handleNext}
                    className="flex items-center gap-1.5 py-2.5 px-5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-bold text-sm transition shadow-sm"
                  >
                    {step === ONBOARDING_STEPS.length - 2 ? 'Finish' : 'Next'}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </>
  );
}