import React, { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function Login({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // Password Reset Modal State
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetEmail, setResetEmail] = useState("");
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState({ text: "", type: "" });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        // --- Demo User Logic ---
        // For demonstration, allow login with a specific demo account
        // In a real application, you would remove this and rely solely on Firebase Auth
        if (email === "demo@loadmemo.com" && password === "password") {
            try {
                // Attempt to sign in the demo user via Firebase to get a valid session
                await signInWithEmailAndPassword(auth, email, password);
                if (onLogin) onLogin();
                navigate("/dashboard"); // Navigate to a dashboard route
            } catch (err) {
                 // If demo user doesn't exist in Firebase, handle it gracefully
                console.warn("Demo user not found in Firebase. Logging in locally for demo purposes.");
                if (onLogin) onLogin();
                navigate("/dashboard");
            } finally {
                setLoading(false);
            }
            return; // Stop execution for the demo user
        }
        // --- End Demo User Logic ---

        try {
            await signInWithEmailAndPassword(auth, email, password);
            if (onLogin) onLogin();
            navigate("/dashboard"); // Navigate to a dashboard route on successful login
        } catch (err) {
            switch (err.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    setError("Invalid email or password. Please try again.");
                    break;
                case 'auth/too-many-requests':
                    setError("Access temporarily disabled due to too many failed login attempts. Please reset your password or try again later.");
                    break;
                default:
                    setError("An unexpected error occurred. Please try again.");
                    console.error("Firebase Auth Error:", err);
                    break;
            }
        }
        setLoading(false);
    };

    // Handle Password Reset
    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setResetLoading(true);
        setResetMessage({ text: "", type: "" });

        if (!resetEmail.trim()) {
            setResetMessage({ text: "Please enter your email address.", type: "error" });
            setResetLoading(false);
            return;
        }

        try {
            await sendPasswordResetEmail(auth, resetEmail.trim());
            setResetMessage({ 
                text: "Password reset email sent! Check your inbox and spam folder.", 
                type: "success" 
            });
            // Clear the email field after successful send
            setTimeout(() => {
                setShowResetModal(false);
                setResetEmail("");
                setResetMessage({ text: "", type: "" });
            }, 3000);
        } catch (err) {
            let errorMessage = "Failed to send reset email. ";
            switch (err.code) {
                case 'auth/user-not-found':
                    errorMessage += "No account found with this email.";
                    break;
                case 'auth/invalid-email':
                    errorMessage += "Invalid email address.";
                    break;
                case 'auth/too-many-requests':
                    errorMessage += "Too many attempts. Please try again later.";
                    break;
                default:
                    errorMessage += "Please try again.";
                    console.error("Password Reset Error:", err);
            }
            setResetMessage({ text: errorMessage, type: "error" });
        }
        setResetLoading(false);
    };

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white flex items-center justify-center p-4">
             <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#1f2937 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
            
            <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl shadow-black/30">
                <div className="text-center mb-8">
                    <div className="flex justify-center items-center mb-4">
                        <img src="/logo.png" alt="LoadMemo Logo" className="w-12 h-12 mr-3" />
                        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tighter">
                            LoadMemo
                        </h1>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
                    <p className="text-gray-400">Sign in to manage your fleet.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                        <div className="relative">
                            <i className="fas fa-envelope absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                            <input
                                id="email"
                                className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoFocus
                                placeholder="you@company.com"
                            />
                        </div>
                    </div>
                    
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-400">Password</label>
                            <button
                                type="button"
                                onClick={() => setShowResetModal(true)}
                                className="text-sm text-teal-400 hover:text-teal-300 transition"
                            >
                                Forgot Password?
                            </button>
                        </div>
                         <div className="relative">
                            <i className="fas fa-lock absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                            <input
                                className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={6}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>
                    
                    {error && 
                        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center">
                            <i className="fas fa-exclamation-circle mr-3"></i>
                            <span>{error}</span>
                        </div>
                    }
                    
                    <button
                        type="submit"
                        className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold text-lg hover:bg-teal-500 transition transform hover:-translate-y-1 shadow-lg shadow-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Signing In...
                            </>
                        ) : "Sign In"}
                    </button>
                </form>

                <p className="text-center text-sm text-gray-500 mt-6">
                    Don't have an account? 
                    <button onClick={() => navigate('/register')} className="font-semibold text-teal-400 hover:text-teal-300 ml-1">
                        Sign up here
                    </button>
                </p>
            </div>

            {/* Password Reset Modal */}
            {showResetModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-white">Reset Password</h3>
                            <button
                                onClick={() => {
                                    setShowResetModal(false);
                                    setResetEmail("");
                                    setResetMessage({ text: "", type: "" });
                                }}
                                className="text-gray-400 hover:text-white transition"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        
                        <p className="text-gray-400 mb-6">
                            Enter your email address and we'll send you a link to reset your password.
                        </p>
                        
                        <form onSubmit={handlePasswordReset} className="space-y-4">
                            <div>
                                <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-400 mb-2">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <i className="fas fa-envelope absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                                    <input
                                        id="resetEmail"
                                        type="email"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition placeholder-gray-500"
                                        placeholder="you@company.com"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            
                            {resetMessage.text && (
                                <div className={`px-4 py-3 rounded-lg text-sm flex items-center ${
                                    resetMessage.type === 'success' 
                                        ? 'bg-green-500/20 border border-green-500/30 text-green-400' 
                                        : 'bg-red-500/20 border border-red-500/30 text-red-400'
                                }`}>
                                    <i className={`mr-3 ${
                                        resetMessage.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'
                                    }`}></i>
                                    <span>{resetMessage.text}</span>
                                </div>
                            )}
                            
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowResetModal(false);
                                        setResetEmail("");
                                        setResetMessage({ text: "", type: "" });
                                    }}
                                    className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-600 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={resetLoading}
                                    className="flex-1 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {resetLoading ? (
                                        <>
                                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Sending...
                                        </>
                                    ) : "Send Reset Link"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}