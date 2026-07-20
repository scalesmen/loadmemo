// src/components/PrivacyPolicyPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicyPage = () => {
    const navigate = useNavigate();

    const Section = ({ title, icon, children }) => (
        <section className="mb-10">
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center border-b border-gray-700 pb-4">
                <i className={`${icon} text-teal-400 mr-4 text-2xl`}></i>
                <span>{title}</span>
            </h2>
            <div className="text-gray-400 leading-relaxed space-y-4">
                {children}
            </div>
        </section>
    );

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
                        <div className="flex items-center space-x-4">
                            <button 
                                onClick={() => navigate('/')}
                                className="text-gray-300 hover:text-teal-400 px-3 py-2 rounded-md text-base font-semibold transition"
                            >
                                <i className="fas fa-home mr-2"></i>Back to Home
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Header Section */}
            <div className="bg-gray-900 py-16 border-b border-gray-800">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-5xl font-black text-white mb-4">Privacy Policy</h1>
                    <p className="text-xl text-gray-400">
                        Your trust is important to us. Here’s how we protect and handle your information.
                    </p>
                    <div className="mt-6 text-gray-500">
                        <p className="text-sm">Last Updated: {new Date("2025-10-01").toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                </div>
            </div>

            {/* Privacy Policy Content */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 lg:p-12">
                    
                    <Section title="Introduction" icon="fas fa-info-circle">
                        <p>
                            LoadMemo ("we," "our," or "us") operates the LoadMemo web platform, the LoadMemo Driver mobile application, and the LoadMemo Import Assistant Chrome Extension (collectively, the "Services"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Services.
                        </p>
                    </Section>

                    <Section title="Information We Collect" icon="fas fa-database">
                         <p>We collect information necessary to provide and improve our Services. This is broken down by how you interact with our platform.</p>
                         <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
                           <h3 className="font-semibold text-white text-lg mb-2">Web Platform Data (For Fleet Managers & Dispatchers)</h3>
                           <p>Personal information is entered into our secure web platform by authorized company personnel (e.g., dispatchers, fleet managers). This includes:</p>
                           <ul className="list-disc list-inside mt-2 space-y-1">
                               <li><strong>Account Information:</strong> Name, email address, phone number, company affiliation.</li>
                               <li><strong>Driver & Fleet Information:</strong> Driver license details, DOT numbers, vehicle information, and other compliance data.</li>
                               <li><strong>Load Information:</strong> Pickup/delivery locations, customer details, and freight documentation.</li>
                           </ul>
                         </div>
                         <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
                           <h3 className="font-semibold text-white text-lg mb-2">Mobile App Data (For Drivers)</h3>
                           <p>The LoadMemo Driver mobile app is designed for privacy and simplicity. The app does <strong>NOT</strong> collect, store, or require any personal information from drivers. It operates using only a pre-generated Driver ID assigned via the web platform. The app processes:</p>
                           <ul className="list-disc list-inside mt-2 space-y-1">
                               <li><strong>GPS Data:</strong> Real-time location for active load tracking, used only while a load is in progress.</li>
                               <li><strong>Digital Documentation:</strong> Photos and e-signatures for Proof of Delivery, which are stamped with time and location.</li>
                           </ul>
                         </div>
                         <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
                           <h3 className="font-semibold text-white text-lg mb-2">Chrome Extension Data</h3>
                           <p>The "LoadMemo Import Assistant" extension helps you import load data. It only handles:</p>
                           <ul className="list-disc list-inside mt-2 space-y-1">
                               <li><strong>Your LoadMemo API Key:</strong> Stored securely and locally in your browser.</li>
                               <li><strong>Web Page Content:</strong> Processed temporarily to extract load data but is never stored by the extension or our servers.</li>
                           </ul>
                         </div>
                    </Section>

                    <Section title="How We Use Your Information" icon="fas fa-cogs">
                        <p>We use the information we collect to operate, maintain, and improve our services. This includes:</p>
                        <ul className="list-disc list-inside space-y-2">
                           <li><strong>Service Delivery:</strong> To facilitate load assignments, track shipments, process documentation, and enable communication between dispatchers and drivers.</li>
                           <li><strong>Business Operations:</strong> To generate invoices and earnings reports, maintain load histories, and ensure regulatory compliance.</li>
                           <li><strong>Support and Communication:</strong> To send load notifications, provide customer support, and share important service announcements.</li>
                        </ul>
                    </Section>

                    <Section title="Data Security" icon="fas fa-shield-alt">
                        <p>We implement industry-standard security measures to protect your information, including encryption of data in transit and at rest, secure access controls, and regular security audits. Access to personal data is strictly limited to authorized personnel on a need-to-know basis.</p>
                    </Section>

                    <Section title="Your Rights and Choices" icon="fas fa-user-shield">
                        <p>You have the right to access, update, or request the deletion of your personal data. You can also control location services and communication preferences through the application settings. For any requests regarding your data, please contact us at <a href="mailto:privacy@loadmemo.com" className="text-teal-400 hover:underline">privacy@loadmemo.com</a>.</p>
                    </Section>

                    <Section title="Contact Us" icon="fas fa-envelope">
                        <p>If you have any questions or concerns about this Privacy Policy or our data practices, please don't hesitate to reach out.</p>
                        <div className="mt-4 p-6 bg-gray-800 rounded-lg border border-gray-700 flex items-center">
                            <i className="fas fa-envelope text-2xl text-teal-400 mr-4"></i>
                            <div>
                                <h4 className="font-semibold text-white">Email Us</h4>
                                <a href="mailto:privacy@loadmemo.com" className="text-teal-400 hover:underline">privacy@loadmemo.com</a>
                            </div>
                        </div>
                    </Section>

                </div>

                {/* Back to Top Button */}
                <div className="text-center mt-12">
                    <button 
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="px-8 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-500 transition transform hover:-translate-y-1 shadow-lg"
                    >
                        <i className="fas fa-arrow-up mr-2"></i>Back to Top
                    </button>
                </div>
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

export default PrivacyPolicyPage;