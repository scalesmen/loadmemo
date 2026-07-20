// src/components/FeaturesPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';

const FeatureCard = ({ icon, title, description, details, iconBgClass, iconColorClass }) => (
    <div className="bg-gray-900 p-8 rounded-xl border border-gray-800 shadow-lg hover:border-teal-500 hover:shadow-teal-500/20 transition duration-300 transform hover:-translate-y-1">
        <div className={`w-16 h-16 ${iconBgClass} rounded-lg flex items-center justify-center mb-6`}>
            <i className={`${icon} ${iconColorClass} text-3xl`}></i>
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-gray-400 mb-4 text-sm">{description}</p>
        <ul className="text-gray-300 text-sm space-y-2">
            {details.map((detail, index) => (
                <li key={index} className="flex items-start">
                    <i className="fas fa-check-circle text-teal-400 mr-2 mt-1 flex-shrink-0"></i>
                    <span>{detail}</span>
                </li>
            ))}
        </ul>
    </div>
);

const FeaturesPage = () => {
    const navigate = useNavigate();

    const coreFeatures = [
        {
            icon: "fas fa-truck-loading",
            title: "Load Management",
            description: "Track active loads in real-time with detailed pickup and delivery information. Monitor load status from booking to completion.",
            details: ["Real-time load tracking", "Digital documentation (eBOL)", "GPS location stamps", "Payment collection details"],
            iconBgClass: "bg-blue-500/20",
            iconColorClass: "text-blue-400",
        },
        {
            icon: "fas fa-mobile-alt",
            title: "Driver Mobile App",
            description: "Complete mobile solution for drivers with an intuitive interface and offline capabilities for seamless operation.",
            details: ["Upload delivery photos (PODs)", "Capture receiver e-signatures", "Download BOL PDFs", "Weekly earnings tracking"],
            iconBgClass: "bg-green-500/20",
            iconColorClass: "text-green-400",
        },
        {
            icon: "fas fa-desktop",
            title: "Dispatcher Web Portal",
            description: "Comprehensive web application for dispatchers to manage fleet operations and assign loads efficiently from anywhere.",
            details: ["Fleet management dashboard", "Drag-and-drop load assignment", "Driver performance analytics", "Real-time communication"],
            iconBgClass: "bg-purple-500/20",
            iconColorClass: "text-purple-400",
        }
    ];

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white">
            {/* Navigation */}
            <nav className="bg-gray-900/90 backdrop-blur-md shadow-lg border-b border-gray-800 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        <div className="flex items-center">
                            <button onClick={() => navigate('/')} className="flex items-center">
                                <img src="/logo.png" alt="LoadMemo Logo" className="w-20 h-20 mr-3 animate-pulse" />
                                <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tighter">
                                    LoadMemo
                                </h1>
                            </button>
                        </div>
                        <div className="hidden md:flex items-center space-x-6">
                            <button 
                                onClick={() => navigate('/features')}
                                className="px-3 py-2 text-base font-semibold transition duration-150 text-teal-400 border-b-2 border-teal-400"
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
            <div className="relative bg-gray-950 pt-20 pb-24 border-b border-gray-800">
                <div className="absolute inset-0 opacity-5" style={{
                    backgroundImage: 'radial-gradient(#1f2937 1px, transparent 0)',
                    backgroundSize: '40px 40px',
                }}></div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                    <h1 className="text-5xl lg:text-6xl font-black mb-6 leading-tight">
                        One Platform,{" "}
                        <span className="bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
                            Every Feature.
                        </span>
                    </h1>
                    <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                        Everything you need to manage your trucking operations efficiently. From automated dispatch to smart invoicing, LoadMemo provides a comprehensive toolkit for modern fleets.
                    </p>
                </div>
            </div>

            {/* Features Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                
                {/* Core Features */}
                <section className="mb-20">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-extrabold text-white mb-4">Operational Cornerstones</h2>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">The essential tools that power your daily workflow.</p>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-8">
                        {coreFeatures.map(feature => <FeatureCard key={feature.title} {...feature} />)}
                    </div>
                </section>

                {/* ============================================ */}
                {/* LIVELOAD FEATURE SECTION - NEW */}
                {/* ============================================ */}
                <section id="liveload" className="mb-20 scroll-mt-24">
                    <div className="bg-gradient-to-br from-orange-900/40 to-red-900/40 rounded-3xl p-12 border border-orange-500/30">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            {/* Left - Content */}
                            <div>
                                <div className="inline-flex items-center px-4 py-2 bg-orange-500/20 rounded-full text-sm font-bold border border-orange-500/50 text-orange-300 uppercase tracking-widest mb-6">
                                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                                    LiveLoad Marketplace
                                </div>
                                
                                <h2 className="text-4xl font-black text-white mb-6">
                                    Same-Day Vehicle Transport
                                    <span className="block text-orange-400">for Dealers</span>
                                </h2>
                                
                                <p className="text-gray-300 text-lg mb-8">
                                    LiveLoad connects car dealers directly with verified carriers for urgent vehicle transport. No brokers, no waiting - just fast, transparent pricing.
                                </p>
                                
                                <div className="space-y-6 mb-8">
                                    <h3 className="text-xl font-bold text-white">How It Works:</h3>
                                    
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white">
                                            1
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold">Upload Your Gate Pass</h4>
                                            <p className="text-gray-400 text-sm">Upload your Manheim, Adesa, OpenLane, or any auction gate pass. Our AI automatically extracts vehicle details, VIN, and pickup location.</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white">
                                            2
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold">Receive Instant Bids</h4>
                                            <p className="text-gray-400 text-sm">Verified carriers in your area see your load and submit competitive bids. View carrier ratings, insurance status, and estimated pickup times.</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white">
                                            3
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold">Accept & Track</h4>
                                            <p className="text-gray-400 text-sm">Accept the best bid, track pickup and delivery in real-time, and pay securely upon delivery. Rate your carrier to help the community.</p>
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
                                        onClick={() => navigate('/register')}
                                        className="px-8 py-4 border-2 border-orange-500/50 text-orange-300 rounded-xl font-semibold text-lg hover:bg-orange-500/10 transition duration-300"
                                    >
                                        <i className="fas fa-truck mr-3"></i>Join as Carrier
                                    </button>
                                </div>
                            </div>
                            
                            {/* Right - Features List */}
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-white mb-6">Key Features:</h3>
                                
                                {[
                                    { icon: 'fas fa-robot', title: 'AI Document Parsing', desc: 'Automatic extraction from Manheim, Adesa, OpenLane, SmartAuction, BacklotCars, Copart, and IAAI documents.' },
                                    { icon: 'fas fa-clock', title: 'Time-Sensitive Loads', desc: 'LiveLoads expire at end of day, creating urgency for fast pickup and competitive pricing.' },
                                    { icon: 'fas fa-shield-alt', title: 'Insurance Verification', desc: 'Every carrier must verify insurance before bidding. Your vehicles are protected.' },
                                    { icon: 'fas fa-map-marker-alt', title: 'Proximity Matching', desc: 'Carriers see loads within their radius, ensuring faster pickup and better rates.' },
                                    { icon: 'fas fa-credit-card', title: 'Secure Payments', desc: 'Payment authorized upfront, captured on delivery. 5% platform fee, no hidden costs.' },
                                    { icon: 'fas fa-star', title: 'Mutual Ratings', desc: 'Both dealers and carriers rate each other, building a trusted community.' },
                                ].map((feature, idx) => (
                                    <div key={idx} className="flex items-start gap-4 bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                                        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <i className={`${feature.icon} text-orange-400`}></i>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-sm">{feature.title}</h4>
                                            <p className="text-gray-400 text-xs">{feature.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Supported Auctions */}
                        <div className="mt-12 pt-8 border-t border-orange-500/20">
                            <p className="text-center text-gray-400 mb-6">Supported Auction Documents:</p>
                            <div className="flex flex-wrap justify-center gap-4">
                                {['Manheim', 'Adesa', 'OpenLane', 'SmartAuction', 'BacklotCars', 'Copart', 'IAAI'].map(auction => (
                                    <span key={auction} className="px-4 py-2 bg-gray-800 rounded-full text-sm text-gray-300 border border-gray-700">
                                        {auction}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
                {/* ============================================ */}

                {/* Advanced Features */}
                <section className="mb-20">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-extrabold text-white mb-4">Advanced Capabilities</h2>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">Powerful tools designed to scale your business and boost profitability.</p>
                    </div>
                    
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { icon: 'fas fa-shield-alt', title: 'Safety & Compliance', description: 'Maintain DOT compliance with driver qualification files, HOS tracking, and automated vehicle inspection reports (DVIR).', color: 'blue'},
                            { icon: 'fas fa-exchange-alt', title: 'Multi-Load Types', description: 'Manage auto hauling, dry van, reefer, and other specialized freight with unique fields for each commodity type.', color: 'green'},
                            { icon: 'fas fa-file-invoice-dollar', title: 'Smart Invoicing', description: 'Generate intelligent invoices and driver statements with detailed earnings, fuel deductions, and expense tracking.', color: 'purple'},
                            { icon: 'fas fa-plug', title: 'API & Webhooks', description: 'Integrate LoadMemo with your existing systems using our robust API and receive real-time updates via webhooks.', color: 'orange'}
                        ].map(item => (
                            <div key={item.title} className="bg-gray-900 p-6 rounded-xl border border-gray-800 hover:border-teal-500 transition duration-300">
                                <i className={`${item.icon} text-${item.color}-400 text-3xl mb-4`}></i>
                                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                                <p className="text-gray-400 text-sm">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </section>
                
                {/* Integration Features */}
                <section className="mb-20">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-extrabold text-white mb-4">Seamless Integrations</h2>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">Connect with the accounting, fuel, and factoring tools you already use.</p>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { icon: 'fas fa-book', title: 'QuickBooks', description: 'Sync invoices, expenses, and payments automatically with QuickBooks Online for simplified accounting.', color: 'green' },
                            { icon: 'fas fa-gas-pump', title: 'Fuel Cards', description: 'Connect EFS, Fleet One, and other major fuel cards to automatically import transactions and track IFTA.', color: 'orange' },
                            { icon: 'fas fa-credit-card', title: 'Factoring Services', description: 'Submit invoices directly to RTS, OTR, and other factoring partners with a single click to improve cash flow.', color: 'blue' }
                        ].map(item => (
                            <div key={item.title} className="text-center p-6 bg-gray-900 rounded-xl border border-gray-800">
                                <div className={`w-20 h-20 bg-${item.color}-900/40 rounded-full flex items-center justify-center mx-auto mb-6 border border-${item.color}-500/50`}>
                                    <i className={`${item.icon} text-${item.color}-400 text-3xl`}></i>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                                <p className="text-gray-400 text-sm">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA Section */}
                <section className="text-center bg-gradient-to-r from-teal-600 to-cyan-700 rounded-2xl p-12 text-white shadow-3xl shadow-teal-500/30">
                    <h2 className="text-4xl font-black mb-4">Ready to Transform Your Operations?</h2>
                    <p className="text-xl text-white/90 mb-10 max-w-3xl mx-auto">
                        Stop juggling spreadsheets and outdated software. Consolidate your fleet operations into one powerful, intelligent platform.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-6 justify-center">
                        <button 
                            onClick={() => navigate('/contact')}
                            className="px-10 py-4 bg-white text-teal-700 rounded-xl font-bold text-lg hover:bg-gray-100 transition transform hover:-translate-y-1 shadow-2xl shadow-black/40"
                        >
                            <i className="fas fa-calendar-alt mr-3"></i>Request a Demo
                        </button>
                        <button 
                            onClick={() => navigate('/solutions')}
                            className="px-10 py-4 border-2 border-white text-white rounded-xl font-bold text-lg hover:bg-white/10 transition duration-300"
                        >
                            <i className="fas fa-truck-moving mr-3"></i>View Fleet Solutions
                        </button>
                    </div>
                </section>
            </div>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="text-gray-400 mb-6 text-sm">
                        LoadMemo: The modern TMS for serious fleet owners.
                    </p>
                    <div className="flex justify-center space-x-8 mb-6">
                        <button onClick={() => navigate('/')} className="text-gray-300 hover:text-teal-400 transition text-sm font-medium">Home</button>
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

export default FeaturesPage;