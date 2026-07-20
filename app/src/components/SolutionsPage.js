import React from 'react';
import { useNavigate } from 'react-router-dom';

const SolutionCard = ({ icon, title, description, features, colorClass, navigate }) => (
    <div className={`p-6 rounded-xl border-t-4 ${colorClass} bg-gray-900 shadow-xl hover:shadow-teal-500/20 transition duration-300 transform hover:-translate-y-1`}>
        <div className="w-12 h-12 bg-teal-500/20 rounded-lg flex items-center justify-center mb-4">
            <i className={`${icon} ${colorClass.replace('border-', 'text-')} text-2xl`}></i>
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-gray-400 mb-4 text-sm">{description}</p>
        <ul className="text-gray-300 text-sm space-y-2">
            {features.map((feature, index) => (
                <li key={index} className="flex items-start">
                    <i className="fas fa-check-circle text-teal-400 mr-2 mt-1 flex-shrink-0"></i>
                    <span>{feature}</span>
                </li>
            ))}
        </ul>
        <button 
            onClick={() => navigate('/contact')}
            className="mt-6 w-full py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition"
        >
            Learn More
        </button>
    </div>
);

const SolutionsPage = () => {
    const navigate = useNavigate();

    const pricingPlans = [
        { 
            size: "Small Fleet", 
            range: "1-10 trucks", 
            price: "$39", 
            features: ["Complete load management", "Driver mobile app", "Basic integrations", "Email support"], 
            primaryColor: "border-cyan-500",
            buttonColor: "bg-cyan-600 hover:bg-cyan-500"
        },
        { 
            size: "Medium Fleet", 
            range: "11-30 trucks", 
            price: "$29", 
            features: ["Everything in Small Fleet", "Advanced analytics", "API access & webhooks", "Priority support"], 
            primaryColor: "border-teal-500",
            buttonColor: "bg-teal-500 hover:bg-teal-400",
            isPopular: true
        },
        { 
            size: "Enterprise", 
            range: "30+ trucks", 
            price: "Custom", 
            features: ["Everything in Medium Fleet", "Multi-Company/MC compliance", "Dedicated account manager", "24/7 phone support"], 
            primaryColor: "border-purple-500",
            buttonColor: "bg-purple-600 hover:bg-purple-500"
        }
    ];

    const industrySolutions = [
        {
            icon: "fas fa-car-side",
            title: "Auto Hauling",
            description: "Specialized features for vehicle transport including damage reporting, VIN tracking, and condition documentation.",
            features: ["Multi-vehicle load tracking", "Damage documentation", "VIN verification", "Condition photos"],
            colorClass: "border-blue-400"
        },
        {
            icon: "fas fa-snowflake",
            title: "Reefer Transport",
            description: "Temperature monitoring and compliance tools for refrigerated cargo with automated alerts and reporting.",
            features: ["Temperature logging", "Compliance alerts", "Cold chain documentation", "Maintenance tracking"],
            colorClass: "border-green-400"
        },
        {
            icon: "fas fa-boxes",
            title: "Dry Van & FTL",
            description: "Streamlined operations for general freight with focus on efficiency, cost optimization, and multi-stop routing.",
            features: ["Load optimization (AI-assisted)", "Route planning & geofencing", "Delivery tracking & PODs", "Cost analysis & profitability"],
            colorClass: "border-red-400"
        }
    ];

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white">
            
            {/* Navigation - Dark, Sticky, with Original Logo */}
            <nav className="bg-gray-900/90 backdrop-blur-md shadow-lg border-b border-gray-800 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        <div className="flex items-center">
                            {/* === RESTORED ORIGINAL LOGO DESIGN === */}
                            <button onClick={() => navigate('/')} className="flex items-center">
                                <img src="/logo.png" alt="LoadMemo Logo" className="w-20 h-20 mr-3 animate-pulse" /> 
                                <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tighter">
                                    LoadMemo
                                </h1>
                            </button>
                            {/* ===================================== */}
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
                                className="px-3 py-2 text-base font-semibold transition duration-150 text-teal-400 border-b-2 border-teal-400"
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

            {/* ====== UPDATED HERO SECTION ====== */}
            <div className="relative bg-gray-950 pt-20 pb-24 border-b border-gray-800">
                <div className="absolute inset-0 opacity-5" style={{
                    backgroundImage: 'radial-gradient(#1f2937 1px, transparent 0)',
                    backgroundSize: '40px 40px',
                }}></div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                    <h1 className="text-5xl lg:text-6xl font-black mb-6 leading-tight">
                        Your Fleet. Your Size.&nbsp;
                        <span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">
                            Your Solution.
                        </span>
                    </h1>
                    
                </div>
            </div>
            {/* ====== END UPDATED HERO SECTION ====== */}

            {/* Pricing Overview - Dark Cards */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                
                <section className="mb-20">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-extrabold text-white mb-4">Transparent & Flexible Pricing</h2>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                            Simple, truck-based pricing that incentivizes your growth.
                        </p>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-8">
                        {pricingPlans.map((plan, index) => (
                            <div 
                                key={index}
                                className={`bg-gray-800 p-8 rounded-2xl shadow-2xl transition duration-300 ${plan.primaryColor.replace('border-', 'border-t-4')} hover:shadow-teal-500/30 relative ${plan.isPopular ? 'transform scale-[1.03] border-4' : 'border border-gray-700'}`}
                            >
                                {plan.isPopular && (
                                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                                        <span className="bg-teal-500 text-gray-900 px-4 py-1.5 rounded-full text-sm font-bold shadow-lg uppercase tracking-wider">Recommended</span>
                                    </div>
                                )}
                                <div className="text-center">
                                    <h3 className="text-3xl font-bold text-white mb-2">{plan.size}</h3>
                                    <p className="text-gray-400 mb-6">{plan.range}</p>
                                    <div className="mb-8">
                                        {plan.price === "Custom" ? (
                                            <span className="text-5xl font-extrabold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                                                {plan.price}
                                            </span>
                                        ) : (
                                            <>
                                                <span className="text-5xl font-extrabold text-teal-400">{plan.price}</span>
                                                <span className="text-gray-400 text-lg">/truck/month</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="space-y-4 mb-10 text-left">
                                        {plan.features.map((feature, fIndex) => (
                                            <div key={fIndex} className="flex items-center">
                                                <i className="fas fa-check text-green-500 mr-3 text-lg flex-shrink-0"></i>
                                                <span className="text-gray-300 font-medium">{feature}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => navigate('/contact')}
                                        className={`w-full py-3 ${plan.buttonColor} text-gray-900 rounded-lg font-bold text-lg transition transform hover:-translate-y-0.5 shadow-xl disabled:opacity-50`}
                                    >
                                        {plan.price === "Custom" ? "Contact Sales" : "Choose Plan"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Industry-Specific Solutions - Dark Cards */}
                <section className="mb-20">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-extrabold text-white mb-4">Industry-Specific Solutions</h2>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                            LoadMemo's platform is engineered to handle the unique compliance and operational demands of specialized freight.
                        </p>
                    </div>
                    
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {industrySolutions.map((solution, index) => (
                            <SolutionCard key={index} {...solution} navigate={navigate} />
                        ))}
                    </div>
                </section>

                {/* Implementation Process */}
                <section className="mb-20">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-extrabold text-white mb-4">Simple, Supported Implementation</h2>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                            Get your entire fleet onboarded and operational in under 7 days with dedicated support.
                        </p>
                    </div>
                    
                    <div className="grid md:grid-cols-4 gap-8">
                        {[
                            { step: 1, title: "Discovery Call", description: "Schedule a demo and we'll map LoadMemo features directly to your operational needs.", color: "text-blue-400", bg: "bg-blue-900/40" },
                            { step: 2, title: "Data Migration", description: "Our team handles the heavy lifting, migrating driver and vehicle data securely from your old system.", color: "text-green-400", bg: "bg-green-900/40" },
                            { step: 3, title: "Custom Training", description: "Comprehensive, role-based training for dispatchers, drivers, and back-office staff.", color: "text-purple-400", bg: "bg-purple-900/40" },
                            { step: 4, title: "Go Live & Support", description: "Launch with confidence, knowing you have 24/7 dedicated support for the first 90 days.", color: "text-orange-400", bg: "bg-orange-900/40" }
                        ].map(item => (
                            <div key={item.step} className="text-center p-6 rounded-xl border border-gray-700 bg-gray-900 shadow-lg hover:border-teal-500 transition duration-300">
                                <div className={`w-16 h-16 ${item.bg} rounded-full flex items-center justify-center mx-auto mb-4 border border-teal-500/50`}>
                                    <span className={`text-3xl font-bold ${item.color}`}>{item.step}</span>
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                                <p className="text-gray-400 text-sm">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA Section - Vibrant Gradient */}
                <section className="text-center bg-gradient-to-r from-teal-600 to-cyan-700 rounded-2xl p-12 text-white shadow-3xl shadow-teal-500/30">
                    <h2 className="text-4xl font-black mb-4">Ready to See LoadMemo in Action?</h2>
                    <p className="text-xl text-white/90 mb-10 max-w-3xl mx-auto">
                        Stop managing multiple systems. Consolidate your fleet operations into one powerful, intelligent platform.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-6 justify-center">
                        <button 
                            onClick={() => navigate('/contact')}
                            className="px-10 py-4 bg-white text-teal-700 rounded-xl font-bold text-lg hover:bg-gray-100 transition transform hover:-translate-y-1 shadow-2xl shadow-black/40"
                        >
                            <i className="fas fa-calendar-alt mr-3"></i>Request a Personalized Demo
                        </button>
                        <button 
                            onClick={() => navigate('/features')}
                            className="px-10 py-4 border-2 border-white text-white rounded-xl font-bold text-lg hover:bg-white/10 transition duration-300"
                        >
                            <i className="fas fa-list-ul mr-3"></i>Explore Our Features
                        </button>
                    </div>
                </section>
            </div>

            {/* Simple Footer - Dark Style */}
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

export default SolutionsPage;