import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';

const CustomerRegistration = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [formData, setFormData] = useState({
        companyName: '',
        adminEmail: '',
        adminPassword: '',
        confirmPassword: '',
        contactName: '',
        phone: '',
        notes: ''
    });
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    
    // Check if we should show success screen (from URL param - survives re-renders!)
    const isSubmitted = searchParams.get('success') === 'true';
    const submittedEmail = searchParams.get('email') || '';

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.companyName.trim()) newErrors.companyName = 'Company name is required';
        if (!formData.adminEmail.trim()) {
            newErrors.adminEmail = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.adminEmail)) {
            newErrors.adminEmail = 'Please enter a valid email';
        }
        if (!formData.adminPassword) {
            newErrors.adminPassword = 'Password is required';
        } else if (formData.adminPassword.length < 6) {
            newErrors.adminPassword = 'Password must be at least 6 characters';
        }
        if (formData.adminPassword !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }
        if (!formData.contactName.trim()) newErrors.contactName = 'Contact name is required';
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const newErrors = validateForm();
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        
        setIsSubmitting(true);
        const emailToSave = formData.adminEmail.toLowerCase().trim();
        
        try {
            // Step 1: Create Firebase Auth user
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                emailToSave,
                formData.adminPassword
            );
            
            console.log('✅ Auth user created:', userCredential.user.uid);

            // Step 2: Call Cloud Function to create Firestore documents
            try {
                const createRegistration = httpsCallable(functions, 'createTenantRegistration');
                const result = await createRegistration({
                    companyName: formData.companyName.trim(),
                    contactName: formData.contactName.trim(),
                    phone: formData.phone.trim(),
                    notes: formData.notes.trim()
                });
                console.log('✅ Registration created:', result.data);
            } catch (funcError) {
                console.error('Cloud function error:', funcError);
                // Continue anyway - auth user is created
            }

            // Step 3: Sign out - user can't access until approved
            await signOut(auth);
            console.log('✅ User signed out');

            // Step 4: Navigate to success screen using URL params
            // This survives component re-mounts caused by auth state changes!
            navigate(`/register?success=true&email=${encodeURIComponent(emailToSave)}`, { replace: true });
            
        } catch (error) {
            console.error('Registration error:', error);
            
            if (error.code === 'auth/email-already-in-use') {
                setErrors({ adminEmail: 'This email is already registered. Please use a different email or login.' });
            } else if (error.code === 'auth/weak-password') {
                setErrors({ adminPassword: 'Password is too weak. Please use a stronger password.' });
            } else if (error.code === 'auth/invalid-email') {
                setErrors({ adminEmail: 'Invalid email address.' });
            } else {
                setErrors({ submit: 'Registration failed. Please try again.' });
            }
            
            // Make sure user is signed out on error
            try {
                await signOut(auth);
            } catch (signOutError) {
                // Ignore
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Success Screen with Contact Info ---
    if (isSubmitted) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#1f2937 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
                <div className="relative max-w-lg w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl text-center">
                    <div className="mx-auto h-16 w-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4 border border-green-500/30">
                        <i className="fas fa-check text-green-400 text-3xl"></i>
                    </div>
                    <h2 className="text-3xl font-extrabold text-white">Account Created!</h2>
                    <p className="mt-2 text-lg text-gray-400">Your account is pending activation.</p>
                    
                    {/* Status Info */}
                    <div className="mt-6 p-6 bg-yellow-900/30 border border-yellow-600/50 rounded-xl text-left">
                        <p className="text-base font-semibold text-yellow-400 mb-3">
                            <i className="fas fa-clock mr-2"></i>Activation Pending
                        </p>
                        <p className="text-sm text-gray-300">
                            Your account has been created and is awaiting admin approval. 
                            You will receive an email notification once your account is activated.
                        </p>
                    </div>

                    {/* What Happens Next */}
                    <div className="mt-4 p-6 bg-gray-800 rounded-xl text-left">
                        <p className="text-base font-semibold text-white mb-3">
                            <i className="fas fa-info-circle mr-2 text-teal-400"></i>What Happens Next:
                        </p>
                        <ul className="text-sm text-gray-300 space-y-2">
                            <li className="flex items-start">
                                <i className="fas fa-check-circle mr-2 mt-1 text-teal-400"></i>
                                <span>Our team will review your registration within 1-2 business days.</span>
                            </li>
                            <li className="flex items-start">
                                <i className="fas fa-envelope mr-2 mt-1 text-teal-400"></i>
                                <span>You'll receive an email at <strong>{submittedEmail}</strong> once approved.</span>
                            </li>
                            <li className="flex items-start">
                                <i className="fas fa-sign-in-alt mr-2 mt-1 text-teal-400"></i>
                                <span>After approval, you can login with your email and password.</span>
                            </li>
                        </ul>
                    </div>

                    {/* Contact Info */}
                    <div className="mt-4 p-6 bg-teal-900/30 border border-teal-600/50 rounded-xl text-left">
                        <p className="text-base font-semibold text-teal-400 mb-3">
                            <i className="fas fa-headset mr-2"></i>Need Help?
                        </p>
                        <p className="text-sm text-gray-300 mb-3">
                            If you have questions or need faster activation, contact us:
                        </p>
                        <div className="space-y-2">
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
                        onClick={() => navigate('/')} 
                        className="mt-8 w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-500 transition transform hover:-translate-y-1"
                    >
                        <i className="fas fa-home mr-2"></i>Back to Home
                    </button>
                </div>
            </div>
        );
    }

    // --- Registration Form Screen ---
    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white">
            <nav className="bg-gray-900/90 backdrop-blur-md shadow-lg border-b border-gray-800 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                         <div className="flex items-center">
                            <button onClick={() => navigate('/')} className="flex items-center">
                                <img src="/logo.png" alt="LoadMemo Logo" className="w-20 h-20 mr-3 animate-pulse" />
                                <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tighter">LoadMemo</h1>
                            </button>
                        </div>
                        <div className="hidden md:flex items-center space-x-6">
                            <button onClick={() => navigate('/')} className="text-gray-300 hover:text-teal-400 text-base font-semibold transition">Home</button>
                            <button onClick={() => navigate('/features')} className="text-gray-300 hover:text-teal-400 text-base font-semibold transition">Features</button>
                            <button onClick={() => navigate('/contact')} className="text-gray-300 hover:text-teal-400 text-base font-semibold transition">Contact</button>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="relative py-12 px-4 sm:px-6 lg:px-8">
                <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#1f2937 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
                <div className="relative max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-start">
                        <div className="lg:sticky lg:top-28">
                            <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl">
                                <div className="text-center mb-6">
                                    <h2 className="text-3xl font-extrabold text-white">Register Your Company</h2>
                                    <p className="mt-2 text-lg text-gray-400">Get started with the future of fleet management.</p>
                                </div>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {[
                                        { name: 'companyName', label: 'Company Name *', type: 'text', placeholder: 'ABC Trucking Co.', icon: 'fas fa-building' },
                                        { name: 'contactName', label: 'Contact Person *', type: 'text', placeholder: 'John Smith', icon: 'fas fa-user' },
                                        { name: 'adminEmail', label: 'Admin Email *', type: 'email', placeholder: 'admin@company.com', icon: 'fas fa-envelope' },
                                        { name: 'phone', label: 'Phone Number', type: 'tel', placeholder: '(555) 123-4567', icon: 'fas fa-phone' },
                                        { name: 'adminPassword', label: 'Admin Password *', type: 'password', placeholder: '••••••••', icon: 'fas fa-lock' },
                                        { name: 'confirmPassword', label: 'Confirm Password *', type: 'password', placeholder: '••••••••', icon: 'fas fa-lock' },
                                    ].map(field => (
                                        <div key={field.name}>
                                            <label htmlFor={field.name} className="block text-sm font-medium text-gray-400 mb-1">{field.label}</label>
                                            <div className="relative">
                                                <input id={field.name} name={field.name} type={field.type} value={formData[field.name]} onChange={handleChange}
                                                    className={`w-full px-4 py-3 pl-12 bg-gray-800 border ${errors[field.name] ? 'border-red-500' : 'border-gray-600'} rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500`}
                                                    placeholder={field.placeholder} />
                                                <i className={`${field.icon} absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500`}></i>
                                            </div>
                                            {errors[field.name] && <p className="mt-1 text-sm text-red-400">{errors[field.name]}</p>}
                                        </div>
                                    ))}
                                    <div>
                                        <label htmlFor="notes" className="block text-sm font-medium text-gray-400 mb-1">Additional Notes</label>
                                        <textarea id="notes" name="notes" rows={3} value={formData.notes} onChange={handleChange} placeholder="Any special requirements or notes..."
                                            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500" />
                                    </div>
                                    {errors.submit && <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{errors.submit}</div>}
                                    <button type="submit" disabled={isSubmitting} className="w-full py-3 px-4 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-500 transform hover:-translate-y-1 transition duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                        {isSubmitting ? (<><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Creating Account...</>) 
                                        : (<><i className="fas fa-rocket mr-2"></i>Submit Registration</>)}
                                    </button>
                                    <p className="text-center text-sm text-gray-500 mt-4">Already have an account? 
                                        <button type="button" onClick={() => navigate('/')} className="text-teal-400 hover:text-teal-300 font-semibold ml-1">Sign In</button>
                                    </p>
                                </form>
                            </div>
                        </div>
                        <div className="text-white space-y-8">
                            <div>
                                <h3 className="text-4xl font-black mb-4">The Last TMS You'll Ever Need</h3>
                                <p className="text-xl text-gray-400">Join thousands of carriers across North America who trust LoadMemo to streamline operations, increase profitability, and simplify compliance.</p>
                            </div>
                            <div className="space-y-4">
                                {[
                                    { icon: 'fas fa-truck-moving', title: 'Complete Fleet Management', description: 'From dispatch and real-time GPS tracking to maintenance and driver assignments.', color: 'blue' },
                                    { icon: 'fas fa-file-invoice-dollar', title: 'Automated Accounting', description: 'Simplify your back office with integrated invoicing, payroll, expense tracking, and IFTA reporting.', color: 'green' },
                                    { icon: 'fas fa-sitemap', title: 'Multi-Company Support', description: 'Perfect for growing businesses, manage multiple MC/DOT numbers from a single, unified dashboard.', color: 'purple' },
                                    { icon: 'fas fa-mobile-alt', title: 'Powerful Driver App', description: 'Empower your drivers with mobile access to loads, document scanning, HOS, and direct communication.', color: 'orange' }
                                ].map(item => (
                                    <div key={item.title} className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                                        <div className="flex items-start space-x-4">
                                            <div className={`w-12 h-12 bg-${item.color}-500/20 rounded-full flex items-center justify-center flex-shrink-0 border border-${item.color}-500/30`}>
                                                <i className={`${item.icon} text-${item.color}-400 text-xl`}></i>
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-semibold mb-1 text-white">{item.title}</h4>
                                                <p className="text-gray-400">{item.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-800">
                                <div className="text-center"><div className="text-3xl font-bold text-teal-400">1,000+</div><div className="text-sm text-gray-400">Active Companies</div></div>
                                <div className="text-center"><div className="text-3xl font-bold text-teal-400">50K+</div><div className="text-sm text-gray-400">Loads Monthly</div></div>
                                <div className="text-center"><div className="text-3xl font-bold text-teal-400">99.9%</div><div className="text-sm text-gray-400">Uptime</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomerRegistration;