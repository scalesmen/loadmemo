// src/components/ContactPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ContactPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        company: '',
        fleetSize: '',
        phone: '',
        message: ''
    });

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Handle form submission here (e.g., send to an API endpoint)
        console.log('Form submitted:', formData);
        alert('Thank you for your interest! We will contact you within 24 hours.');
        // Optionally reset form
        setFormData({
            name: '', email: '', company: '', fleetSize: '', phone: '', message: ''
        });
    };

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
                            {/* Replaced CTA button with active link */}
                            <button 
                                onClick={() => navigate('/contact')}
                                className="px-3 py-2 text-base font-semibold transition duration-150 text-teal-400 border-b-2 border-teal-400"
                            >
                                Contact
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
                        Let's Talk About{" "}
                        <span className="bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
                            Your Fleet.
                        </span>
                    </h1>
                    <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                        Ready to see how LoadMemo can streamline your operations? Fill out the form to schedule a personalized demo with one of our fleet management experts.
                    </p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="grid lg:grid-cols-5 gap-12">
                    
                    {/* Contact Form */}
                    <div className="lg:col-span-3 bg-gray-900 rounded-2xl shadow-2xl p-8 lg:p-12 border border-gray-800">
                        <h2 className="text-3xl font-bold text-white mb-8">
                            Request a Demo
                        </h2>
                        
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-2">Full Name *</label>
                                    <input type="text" id="name" name="name" required value={formData.name} onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500" placeholder="John Doe" />
                                </div>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-2">Email Address *</label>
                                    <input type="email" id="email" name="email" required value={formData.email} onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500" placeholder="john@company.com" />
                                </div>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="company" className="block text-sm font-medium text-gray-400 mb-2">Company Name</label>
                                    <input type="text" id="company" name="company" value={formData.company} onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500" placeholder="ABC Trucking" />
                                </div>
                                <div>
                                    <label htmlFor="fleetSize" className="block text-sm font-medium text-gray-400 mb-2">Fleet Size</label>
                                    <select id="fleetSize" name="fleetSize" value={formData.fleetSize} onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition">
                                        <option value="">Select fleet size</option>
                                        <option value="1">Owner-operator (1 truck)</option>
                                        <option value="2-10">Small fleet (2-10 trucks)</option>
                                        <option value="11-30">Medium fleet (11-30 trucks)</option>
                                        <option value="31-50">Large fleet (31-50 trucks)</option>
                                        <option value="50+">Enterprise (50+ trucks)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-400 mb-2">Phone Number</label>
                                <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500" placeholder="(555) 123-4567" />
                            </div>
                            
                            <div>
                                <label htmlFor="message" className="block text-sm font-medium text-gray-400 mb-2">Message</label>
                                <textarea id="message" name="message" rows="4" value={formData.message} onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition resize-none placeholder-gray-500" placeholder="Tell us about your current challenges and how LoadMemo can help..."></textarea>
                            </div>
                            
                            <button type="submit" className="w-full py-4 bg-teal-600 text-white rounded-lg font-semibold text-lg hover:bg-teal-500 transition transform hover:-translate-y-1 shadow-lg shadow-teal-500/30">
                                <i className="fas fa-paper-plane mr-2"></i>
                                Submit Request
                            </button>
                        </form>
                    </div>
                    
                    {/* Contact Information */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
                             <h3 className="text-2xl font-bold text-white mb-6">Contact Information</h3>
                            <div className="space-y-6">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-teal-900/50 rounded-lg flex items-center justify-center flex-shrink-0 border border-teal-500/50">
                                        <i className="fas fa-phone text-teal-400"></i>
                                    </div>
                                    <div className="ml-4">
                                        <h4 className="font-semibold text-white">Sales Hotline</h4>
                                        <p className="text-gray-400">1-800-LOADMEMO</p>
                                        <p className="text-gray-500 text-sm">Mon-Fri 8AM-8PM EST</p>
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-teal-900/50 rounded-lg flex items-center justify-center flex-shrink-0 border border-teal-500/50">
                                        <i className="fas fa-envelope text-teal-400"></i>
                                    </div>
                                    <div className="ml-4">
                                        <h4 className="font-semibold text-white">General Inquiries</h4>
                                        <p className="text-gray-400">sales@loadmemo.com</p>
                                        <p className="text-gray-500 text-sm">Response within 2 business hours</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
                            <h3 className="text-2xl font-bold text-white mb-6">What to Expect</h3>
                            <ul className="space-y-4 text-gray-300">
                                <li className="flex items-start"><i className="fas fa-check-circle text-green-400 mr-3 mt-1"></i><span>A brief call to understand your fleet's unique needs.</span></li>
                                <li className="flex items-start"><i className="fas fa-check-circle text-green-400 mr-3 mt-1"></i><span>A live, personalized demo of the LoadMemo platform.</span></li>
                                <li className="flex items-start"><i className="fas fa-check-circle text-green-400 mr-3 mt-1"></i><span>Transparent, no-obligation pricing for your fleet size.</span></li>
                                <li className="flex items-start"><i className="fas fa-check-circle text-green-400 mr-3 mt-1"></i><span>A clear plan for data migration and onboarding.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12 mt-10">
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

export default ContactPage;