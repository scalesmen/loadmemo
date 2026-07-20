// src/components/DealerRegistration.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

const DealerRegistration = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    // Business Info
    businessName: '',
    dealerLicenseNumber: '',
    ein: '',
    
    // Contact Info
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    contactName: '',
    
    // Address
    address: '',
    city: '',
    state: '',
    zip: '',
    
    // Agreement
    agreeToTerms: false,
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const validateStep1 = () => {
    if (!formData.businessName.trim()) {
      setError('Business name is required');
      return false;
    }
    if (!formData.dealerLicenseNumber.trim()) {
      setError('Dealer license number is required');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!formData.password || formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (!formData.phone.trim()) {
      setError('Phone number is required');
      return false;
    }
    if (!formData.contactName.trim()) {
      setError('Contact name is required');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.city.trim() || !formData.state.trim() || !formData.zip.trim()) {
      setError('City, State, and ZIP are required');
      return false;
    }
    if (!formData.agreeToTerms) {
      setError('You must agree to the terms and conditions');
      return false;
    }
    return true;
  };

  const nextStep = () => {
    setError('');
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const prevStep = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!validateStep3()) return;
    
    setIsLoading(true);
    
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email, 
        formData.password
      );
      
      const userId = userCredential.user.uid;

// Create user document FIRST (for role-based access)
await setDoc(doc(db, 'users', userId), {
  email: formData.email.toLowerCase().trim(),
  role: 'dealer',
  dealerId: userId,
  active: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

// THEN create dealer document
await setDoc(doc(db, 'dealers', userId), {
  businessName: formData.businessName.trim(),
  dealerLicenseNumber: formData.dealerLicenseNumber.trim(),
  ein: formData.ein.trim() || null,
  
  email: formData.email.toLowerCase().trim(),
  phone: formData.phone.trim(),
  contactName: formData.contactName.trim(),
  
  address: formData.address.trim(),
  city: formData.city.trim(),
  state: formData.state.toUpperCase().trim(),
  zip: formData.zip.trim(),
  
  // Default location for deliveries
  defaultLocation: {
    address: formData.address.trim(),
    city: formData.city.trim(),
    state: formData.state.toUpperCase().trim(),
    zip: formData.zip.trim(),
  },
  
  // Stats
  totalLoadsPosted: 0,
  totalLoadsCompleted: 0,
  averageRating: null,
  totalRatings: 0,
  
  // Status
  status: 'active',
  emailVerified: false,
  
  // Timestamps
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
      
      // Small delay to ensure Firestore writes complete before App.js reads them
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Success - redirect to dealer dashboard
      navigate('/dealer');
      
    } catch (error) {
      console.error('Registration error:', error);
      if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please login instead.');
      } else {
        setError(error.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 font-sans">
      {/* Navigation */}
      <nav className="bg-gray-900/90 backdrop-blur-md shadow-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
              <img src="/logo.png" alt="LoadMemo Logo" className="w-20 h-20 mr-3" /> 
              <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tighter">
                LoadMemo
              </h1>
            </div>
            <button 
              onClick={() => navigate('/')}
              className="text-gray-300 hover:text-white px-4 py-2 text-sm font-medium"
            >
              <i className="fas fa-arrow-left mr-2"></i>Back to Home
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center px-4 py-2 bg-orange-500/20 rounded-full text-sm font-bold border border-orange-500/50 text-orange-300 uppercase tracking-widest mb-4">
            <i className="fas fa-car mr-2"></i>
            Dealer Registration
          </div>
          <h1 className="text-4xl font-black text-white mb-4">
            Join LiveLoad Marketplace
          </h1>
          <p className="text-gray-400 text-lg">
            Post your auction purchases and get instant bids from verified carriers.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-10">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                step >= s 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {step > s ? <i className="fas fa-check"></i> : s}
              </div>
              {s < 3 && (
                <div className={`w-16 h-1 ${step > s ? 'bg-orange-500' : 'bg-gray-700'}`}></div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-gray-800 rounded-2xl p-8 border border-orange-500/30 shadow-2xl">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm font-medium mb-6">
              <i className="fas fa-exclamation-circle mr-2"></i>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Step 1: Business Information */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-white mb-6">
                  <i className="fas fa-building mr-2 text-orange-400"></i>
                  Business Information
                </h2>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Dealership Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                    placeholder="ABC Auto Sales"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Dealer License Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="dealerLicenseNumber"
                    value={formData.dealerLicenseNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                    placeholder="DL-123456"
                  />
                  <p className="text-gray-500 text-xs mt-1">Your state-issued dealer license number</p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    EIN / Tax ID <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    name="ein"
                    value={formData.ein}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                    placeholder="XX-XXXXXXX"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Contact Information */}
            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-white mb-6">
                  <i className="fas fa-user mr-2 text-orange-400"></i>
                  Contact Information
                </h2>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Contact Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="contactName"
                    value={formData.contactName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                    placeholder="John Smith"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                    placeholder="john@abcauto.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Phone <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Confirm Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Address & Agreement */}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-white mb-6">
                  <i className="fas fa-map-marker-alt mr-2 text-orange-400"></i>
                  Dealership Address
                </h2>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Street Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                    placeholder="123 Main Street"
                  />
                </div>
                
                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-3">
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      City <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                      placeholder="Detroit"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      State <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      maxLength={2}
                      className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500 uppercase"
                      placeholder="MI"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      ZIP <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="zip"
                      value={formData.zip}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-500"
                      placeholder="48201"
                    />
                  </div>
                </div>
                
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <label className="flex items-start cursor-pointer">
                    <input
                      type="checkbox"
                      name="agreeToTerms"
                      checked={formData.agreeToTerms}
                      onChange={handleInputChange}
                      className="h-5 w-5 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500 mt-0.5"
                    />
                    <span className="ml-3 text-sm text-gray-300">
                      I agree to the <a href="/terms" className="text-orange-400 hover:underline">Terms of Service</a> and <a href="/privacy" className="text-orange-400 hover:underline">Privacy Policy</a>. I confirm that I am a licensed dealer authorized to purchase and transport vehicles.
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className="px-6 py-3 border border-gray-600 text-gray-300 rounded-lg font-semibold hover:bg-gray-700 transition"
                >
                  <i className="fas fa-arrow-left mr-2"></i>Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="px-6 py-3 border border-gray-600 text-gray-300 rounded-lg font-semibold hover:bg-gray-700 transition"
                >
                  <i className="fas fa-times mr-2"></i>Cancel
                </button>
              )}
              
              {step < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="px-8 py-3 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-400 transition"
                >
                  Continue<i className="fas fa-arrow-right ml-2"></i>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg font-bold hover:from-orange-600 hover:to-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>Creating Account...</>
                  ) : (
                    <><i className="fas fa-check mr-2"></i>Complete Registration</>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Already have account */}
        <div className="text-center mt-8">
          <p className="text-gray-400">
            Already have a dealer account?{' '}
            <button 
              onClick={() => navigate('/')}
              className="text-orange-400 hover:text-orange-300 font-bold"
            >
              Login here
            </button>
          </p>
        </div>

        {/* Benefits */}
        <div className="mt-12 grid grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-bolt text-orange-400"></i>
            </div>
            <h4 className="text-white font-bold text-sm">Fast Setup</h4>
            <p className="text-gray-500 text-xs">Start posting in minutes</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-dollar-sign text-orange-400"></i>
            </div>
            <h4 className="text-white font-bold text-sm">No Broker Fees</h4>
            <p className="text-gray-500 text-xs">Only 5% platform fee</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-shield-alt text-orange-400"></i>
            </div>
            <h4 className="text-white font-bold text-sm">Verified Carriers</h4>
            <p className="text-gray-500 text-xs">Insurance-checked haulers</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealerRegistration;