// src/components/HomePage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const HomePage = () => {
  const navigate = useNavigate();
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginMode, setLoginMode] = useState('carrier'); // 'carrier' or 'dealer'
  const [pendingApproval, setPendingApproval] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setPendingApproval(false);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      
      // Check if user is pending approval
      const userRef = doc(db, 'users', userCredential.user.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists() && userSnap.data().active === false) {
        // User exists but not approved yet - sign them out and show message
        await signOut(auth);
        setPendingApproval(true);
        setPendingEmail(loginForm.email);
      }
      // If active, App.js will handle the redirect
      
    } catch (error) {
      setError('Invalid email or password. Please try again.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setLoginForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // --- Pending Approval Screen ---
  if (pendingApproval) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#1f2937 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
        <div className="relative max-w-lg w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl text-center">
          <div className="mx-auto h-20 w-20 bg-yellow-500/20 rounded-full flex items-center justify-center mb-6 border border-yellow-500/30">
            <i className="fas fa-clock text-yellow-400 text-4xl"></i>
          </div>
          
          <h2 className="text-3xl font-extrabold text-white mb-2">Account Pending Approval</h2>
          <p className="text-lg text-gray-400 mb-6">
            Welcome back, <span className="text-teal-400 font-semibold">{pendingEmail}</span>!
          </p>
          
          <div className="p-6 bg-yellow-900/30 border border-yellow-600/50 rounded-xl text-left mb-6">
            <p className="text-base font-semibold text-yellow-400 mb-3 flex items-center">
              <i className="fas fa-hourglass-half mr-3"></i>
              Activation Pending
            </p>
            <p className="text-sm text-gray-300 mb-4">
              Your account has been created and is awaiting admin approval. 
              This typically takes <strong className="text-white">1-2 business days</strong>.
            </p>
            <p className="text-sm text-gray-300">
              You'll receive an email notification once your account is activated.
            </p>
          </div>
          
          <div className="p-6 bg-teal-900/30 border border-teal-600/50 rounded-xl text-left mb-6">
            <p className="text-base font-semibold text-teal-400 mb-3 flex items-center">
              <i className="fas fa-headset mr-3"></i>
              Need Help?
            </p>
            <p className="text-sm text-gray-300 mb-4">
              If you have questions or need faster activation, contact us:
            </p>
            <div className="space-y-3">
              <a 
                href="mailto:admin@loadmemo.com" 
                className="flex items-center text-teal-400 hover:text-teal-300 transition"
              >
                <i className="fas fa-envelope mr-3 w-5"></i>
                <span>admin@loadmemo.com</span>
              </a>
              <a 
                href="tel:+12015265176" 
                className="flex items-center text-teal-400 hover:text-teal-300 transition"
              >
                <i className="fas fa-phone mr-3 w-5"></i>
                <span>(201) 526-5176</span>
              </a>
            </div>
          </div>
          
          <button 
            onClick={() => setPendingApproval(false)} 
            className="w-full py-3 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-600 transition transform hover:-translate-y-0.5"
          >
            <i className="fas fa-arrow-left mr-2"></i>Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 font-sans">
      
      {/* Navigation */}
      <nav className="bg-gray-900/90 backdrop-blur-md shadow-lg border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center">
              <img src="/logo.png" alt="LoadMemo Logo" className="w-20 h-20 mr-3 animate-pulse" /> 
              <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tighter">
                LoadMemo
              </h1>
            </div>
            <div className="hidden md:flex items-center space-x-6">
              <button 
                onClick={() => navigate('/features')}
                className="text-gray-300 hover:text-teal-400 px-3 py-2 text-base font-semibold transition duration-150"
              >
                Features
              </button>
              <button 
                onClick={() => navigate('/solutions')}
                className="text-gray-300 hover:text-teal-400 px-3 py-2 text-base font-semibold transition duration-150"
              >
                Solutions
              </button>
              <button 
                onClick={() => navigate('/contact')}
                className="px-6 py-2 bg-teal-500 text-gray-900 rounded-lg text-base font-bold shadow-lg hover:bg-teal-400 transition duration-200 transform hover:scale-105"
              >
                <i className="fas fa-headset mr-2"></i>Contact Sales
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden pt-0 pb-24">
        
        {/* Background Graphics */}
        <div className="absolute inset-0 z-0 opacity-10">
            <div className="absolute inset-0 bg-[length:40px_40px] opacity-10" style={{
                backgroundImage: 'linear-gradient(to right, #1f2937 1px, transparent 1px), linear-gradient(to bottom, #1f2937 1px, transparent 1px)',
            }}></div>
            <div className="absolute top-1/2 left-0 w-full h-1 bg-teal-500/20 transform -rotate-12 blur-sm"></div>
            <div className="absolute bottom-1/4 right-0 w-full h-1 bg-cyan-500/20 transform rotate-6 blur-sm"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 z-10">
          <div className="grid lg:grid-cols-3 gap-16 items-center">
            
            {/* Left Column - Hero Content */}
            <div className="text-white lg:col-span-2">
              <div className="mb-6">
                <span className="inline-block px-4 py-2 bg-teal-500/20 rounded-full text-sm font-bold backdrop-blur-sm border border-teal-500/50 text-teal-300 uppercase tracking-widest">
                  Enterprise TMS Scaled for You
                </span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-black mb-8 leading-tight">
                Unified Management for
                <span className="block mt-2 bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">
                  Multi-MC Fleets.
                </span>
              </h1>
              
              <p className="text-xl mb-12 text-gray-400 leading-relaxed max-w-2xl">
                LoadMemo is the command center for complex operations. <strong>Manage all your companies, drivers, and loads</strong> from a single, AI-powered platform designed for maximum efficiency and compliance.
              </p>
              
              {/* Highlight Features */}
              <div className="grid md:grid-cols-3 gap-6 mb-12">
                <FeatureCardSimple icon="fas fa-robot" title="AI Load Agent" subtitle="Finds optimal loads effortlessly." color="text-red-400" />
                <FeatureCardSimple icon="fas fa-layer-group" title="Multi-Company BOLs" subtitle="Seamless documentation for all entities." color="text-yellow-400" />
                <FeatureCardSimple icon="fas fa-id-card" title="Unified Driver View" subtitle="All driver data in one secure window." color="text-green-400" />
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => navigate('/register')}
                  className="px-10 py-4 bg-teal-500 text-gray-900 rounded-xl font-bold text-lg hover:bg-teal-400 transition transform hover:-translate-y-1 shadow-2xl shadow-teal-500/30"
                >
                  <i className="fas fa-truck-moving mr-3"></i>Start Free Trial
                </button>
                <button 
                  onClick={() => navigate('/features')}
                  className="px-10 py-4 border-2 border-gray-600 text-white rounded-xl font-semibold text-lg hover:bg-gray-800 transition duration-300"
                >
                  <i className="fas fa-microchip mr-3"></i>Explore Automation
                </button>
              </div>
            </div>

            {/* Right Column - Login Form */}
            <div className="lg:col-span-1 lg:flex lg:justify-end">
              <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-sm border border-teal-500/30">
                
                {/* Login Mode Toggle */}
                <div className="flex mb-6 bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setLoginMode('carrier')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition ${
                      loginMode === 'carrier' 
                        ? 'bg-teal-500 text-gray-900' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <i className="fas fa-truck mr-2"></i>Carrier
                  </button>
                  <button
                    onClick={() => setLoginMode('dealer')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition ${
                      loginMode === 'dealer' 
                        ? 'bg-orange-500 text-gray-900' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <i className="fas fa-car mr-2"></i>Dealer
                  </button>
                </div>

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {loginMode === 'carrier' ? 'Carrier Login' : 'Dealer Login'}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {loginMode === 'carrier' 
                      ? 'Sign in to manage your fleet' 
                      : 'Sign in to post vehicles'}
                  </p>
                </div>
                
                <form id="loginForm" onSubmit={handleLogin} className="space-y-5">
                  {error && (
                    <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm font-medium">
                      {error}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Email</label>
                    <div className="relative">
                      <input 
                        type="email" 
                        name="email"
                        value={loginForm.email}
                        onChange={handleInputChange}
                        required 
                        className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition pl-12 placeholder-gray-500"
                        placeholder="user@company.com"
                      />
                      <i className="fas fa-envelope absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Password</label>
                    <div className="relative">
                      <input 
                        type="password" 
                        name="password"
                        value={loginForm.password}
                        onChange={handleInputChange}
                        required 
                        className="w-full px-4 py-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition pl-12 placeholder-gray-500"
                        placeholder="••••••••"
                      />
                      <i className="fas fa-lock absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="flex items-center">
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-teal-500 focus:ring-teal-500" />
                      <span className="ml-2 text-sm text-gray-400">Remember me</span>
                    </label>
                    <button type="button" className="text-sm font-medium text-teal-400 hover:text-teal-300 transition duration-150">
                      Forgot password?
                    </button>
                  </div>
                  
                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className={`w-full py-3 px-4 rounded-lg font-bold text-lg transform hover:-translate-y-0.5 transition duration-300 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${
                      loginMode === 'carrier'
                        ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-gray-900 hover:from-teal-600 hover:to-cyan-700 shadow-teal-500/40'
                        : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-orange-500/40'
                    }`}
                  >
                    {isLoading ? (
                      <><i className="fas fa-spinner fa-spin mr-3"></i>Signing In...</>
                    ) : (
                      <><i className="fas fa-sign-in-alt mr-3"></i>Login</>
                    )}
                  </button>
                </form>
                
                <div className="mt-6 text-center border-t pt-4 border-gray-700">
                  <p className="text-gray-400 text-sm">
                    {loginMode === 'carrier' ? (
                      <>Need Access? 
                        <button 
                          onClick={() => navigate('/register')}
                          className="text-teal-400 hover:text-teal-300 font-bold ml-1 transition duration-150"
                        >
                          Register as Carrier
                        </button>
                      </>
                    ) : (
                      <>New Dealer? 
                        <button 
                          onClick={() => navigate('/dealer-register')}
                          className="text-orange-400 hover:text-orange-300 font-bold ml-1 transition duration-150"
                        >
                          Register Your Dealership
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* LIVELOAD SECTION - NEW */}
      {/* ============================================ */}
      <section className="py-20 bg-gradient-to-br from-orange-900/30 to-red-900/30 border-t border-b border-orange-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            
            {/* Left - Content */}
            <div>
              <div className="mb-6">
                <span className="inline-flex items-center px-4 py-2 bg-orange-500/20 rounded-full text-sm font-bold border border-orange-500/50 text-orange-300 uppercase tracking-widest">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                  LiveLoad Marketplace
                </span>
              </div>
              
              <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
                Dealers: Get Your Cars
                <span className="block text-orange-400">Transported Today.</span>
              </h2>
              
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                Just bought a car at auction? <strong>Upload your gate pass</strong> and get instant bids from verified carriers in your area. Same-day pickup, transparent pricing, no broker fees.
              </p>
              
              <div className="space-y-4 mb-10">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-file-pdf text-orange-400"></i>
                  </div>
                  <div>
                    <h4 className="text-white font-bold">AI-Powered PDF Parsing</h4>
                    <p className="text-gray-400 text-sm">Upload Manheim, Adesa, or any gate pass - we extract vehicle details automatically.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-shield-alt text-orange-400"></i>
                  </div>
                  <div>
                    <h4 className="text-white font-bold">Verified Carriers Only</h4>
                    <p className="text-gray-400 text-sm">Every carrier is insurance-verified before they can bid on your loads.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-clock text-orange-400"></i>
                  </div>
                  <div>
                    <h4 className="text-white font-bold">Time-Sensitive Loads</h4>
                    <p className="text-gray-400 text-sm">LiveLoads expire end-of-day - get your car moved fast with urgent pricing.</p>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => navigate('/dealer-register')}
                  className="px-8 py-4 bg-orange-500 text-white rounded-xl font-bold text-lg hover:bg-orange-400 transition transform hover:-translate-y-1 shadow-2xl shadow-orange-500/30"
                >
                  <i className="fas fa-car mr-3"></i>Register as Dealer
                </button>
                <button 
                  onClick={() => navigate('/features#liveload')}
                  className="px-8 py-4 border-2 border-orange-500/50 text-orange-300 rounded-xl font-semibold text-lg hover:bg-orange-500/10 transition duration-300"
                >
                  <i className="fas fa-info-circle mr-3"></i>How It Works
                </button>
              </div>
            </div>
            
            {/* Right - Visual */}
            <div className="relative">
              <div className="bg-gray-800 rounded-2xl p-6 border border-orange-500/30 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white font-bold">LiveLoad Example</span>
                  <span className="flex items-center text-red-400 text-sm">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                    Expires in 4h 23m
                  </span>
                </div>
                
                <div className="bg-gray-900 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-16 h-12 bg-gray-700 rounded-lg flex items-center justify-center">
                      <i className="fas fa-car text-gray-500 text-xl"></i>
                    </div>
                    <div>
                      <h4 className="text-white font-bold">2024 BMW X5</h4>
                      <p className="text-gray-400 text-sm">VIN: ***********7823</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-400 mb-3">
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                      Manheim Detroit, MI
                    </div>
                    <i className="fas fa-arrow-right mx-3 text-gray-600"></i>
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                      Columbus, OH
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-green-400">$450</span>
                    <span className="text-gray-400 text-sm">~185 miles</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <div className="flex-1 bg-blue-500/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">3</div>
                    <div className="text-xs text-gray-400">Bids</div>
                  </div>
                  <div className="flex-1 bg-green-500/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">$380</div>
                    <div className="text-xs text-gray-400">Lowest Bid</div>
                  </div>
                  <div className="flex-1 bg-purple-500/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-400">4.8★</div>
                    <div className="text-xs text-gray-400">Top Carrier</div>
                  </div>
                </div>
              </div>
              
              {/* Decorative Elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-red-500/10 rounded-full blur-2xl"></div>
            </div>
          </div>
        </div>
      </section>
      {/* ============================================ */}
      
      {/* Core Features Section */}
      <section className="py-20 bg-white border-t-8 border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Features Engineered for Complex Fleets</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">Don't just manage. <strong>Consolidate, automate, and scale</strong> with tools built for multi-entity operations.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8"> 
            <FeatureCardDetailed 
              icon="fas fa-scroll" 
              title="Multi-Company BOLs" 
              description="Instantly generate and track Bills of Lading and Invoices, automatically tagged by the correct USDOT/MC entity."
              color="border-blue-500"
              navigate={navigate}
            />

            <FeatureCardDetailed 
              icon="fas fa-users-cog" 
              title="One-Click Driver Mgmt" 
              description="Assign, communicate, and handle payroll for all drivers across all companies from a single, intuitive window."
              color="border-green-500"
              navigate={navigate}
            />

            <FeatureCardDetailed 
              icon="fas fa-upload" 
              title="Batch Order Import" 
              description="Mass-upload orders from spreadsheets and dispatch them to the optimal truck/company with a single action."
              color="border-purple-500"
              navigate={navigate}
            />

            <FeatureCardDetailed 
              icon="fas fa-tachometer-alt" 
              title="Integrated IFTA & Payroll" 
              description="Automate IFTA calculations and sync driver pay directly with Quickbooks, minimizing manual error."
              color="border-orange-500"
              navigate={navigate}
            />
          </div>

          <div className="text-center mt-16">
            <button 
              onClick={() => navigate('/solutions')}
              className="px-10 py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-full font-bold text-lg hover:from-teal-600 hover:to-cyan-700 transition transform hover:scale-105 shadow-xl shadow-teal-500/40"
            >
              <i className="fas fa-arrow-right mr-3"></i>See Full Solution Details
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400 mb-6 text-sm">
            LoadMemo: The modern TMS for serious fleet owners.
          </p>
          <div className="flex justify-center space-x-8 mb-6">
            <button onClick={() => navigate('/features')} className="text-gray-300 hover:text-teal-400 transition text-sm font-medium">Features</button>
            <button onClick={() => navigate('/solutions')} className="text-gray-300 hover:text-teal-400 transition text-sm font-medium">Solutions</button>
            <button onClick={() => navigate('/contact')} className="text-gray-300 hover:text-teal-400 transition text-sm font-medium">Contact</button>
            <button onClick={() => navigate('/privacy')} className="text-gray-300 hover:text-teal-400 transition text-sm font-medium">Privacy Policy</button>
          </div>
          <p className="text-gray-500 text-xs border-t border-gray-700 pt-6">&copy; 2024 LoadMemo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

// Helper Components
const FeatureCardSimple = ({ icon, title, subtitle, color }) => (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 flex flex-col items-start hover:bg-gray-700 transition duration-300">
        <i className={`${icon} ${color} text-2xl mb-2`}></i>
        <h4 className="text-base font-bold text-white">{title}</h4>
        <p className="text-xs text-gray-400">{subtitle}</p>
    </div>
);

const FeatureCardDetailed = ({ icon, title, description, color, navigate }) => (
    <div 
        className={`text-left p-6 bg-white rounded-2xl shadow-xl ${color} border-t-4 hover:shadow-2xl transition duration-300 cursor-pointer group`} 
        onClick={() => navigate('/features')}
    >
        <div className="w-12 h-12 bg-gray-100 group-hover:bg-teal-500 rounded-lg flex items-center justify-center mb-4 transition duration-300">
            <i className={`${icon} text-teal-500 group-hover:text-white text-xl transition duration-300`}></i>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm">{description}</p>
    </div>
);

export default HomePage;