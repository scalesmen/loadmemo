import React, { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate, useLocation } from "react-router-dom";

export default function FinishSignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [showForm, setShowForm] = useState(true);
  const [inviteToken, setInviteToken] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenFromUrl = params.get("token");
    if (tokenFromUrl) {
      setInviteToken(tokenFromUrl);
    } else {
      setMessage({ text: "Invalid or missing invite link.", type: "error" });
      setShowForm(false);
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setMessage({ text: "", type: "" });

    // Basic validation
    if (!inviteToken) {
      setMessage({ text: "Invalid invite link (missing token).", type: "error" });
      setProcessing(false);
      return;
    }
    if (!name.trim() || !email.trim()) {
      setMessage({ text: "Name and Email are required.", type: "error" });
      setProcessing(false);
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      setProcessing(false);
      return;
    }
    if (password.length < 6) {
      setMessage({ text: "Password must be at least 6 characters.", type: "error" });
      setProcessing(false);
      return;
    }

    // Logging all values with types for debugging
    console.log("FinishSignUp.js: About to submit payload:");
    console.log("token:", inviteToken, typeof inviteToken, inviteToken.length, inviteToken);
    console.log("name:", name, typeof name, name.length, name);
    console.log("email:", email, typeof email, email.length, email);
    console.log("password:", password, typeof password, password.length, password);

    // Type & empty checks
    if (
      typeof inviteToken !== "string" ||
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !inviteToken.trim() ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      console.warn("[FinishSignUp.js] Submission stopped: One or more fields are not strings or are empty.");
      setMessage({ text: "Some required information is missing or invalid.", type: "error" });
      setProcessing(false);
      return;
    }

    try {
      const functions = getFunctions();
      const createNewUser = httpsCallable(functions, "createNewUserFromInvite");
      const payload = {
        token: inviteToken.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password,
      };

      // Log the final payload (not just variables)
      console.log("Payload being sent:", payload);

      const result = await createNewUser(payload);

      if (result.data && result.data.success) {
        setMessage({
          text: result.data.message || "Registration successful! You can now log in.",
          type: "success",
        });
        setShowForm(false);
        setTimeout(() => navigate("/login"), 3000);
      } else {
        setMessage({
          text: result.data?.message || "Unknown error during registration.",
          type: "error",
        });
      }
    } catch (error) {
      let friendlyMessage = "Registration failed: ";
      if (error.code === "already-exists") {
        friendlyMessage += "This email address is already registered.";
      } else if (error.code === "not-found") {
        friendlyMessage += "Invalid or expired invite token.";
        setShowForm(false);
      } else if (error.code === "invalid-argument") {
        friendlyMessage += "Missing required information. Please fill out all fields.";
      } else {
        friendlyMessage += error.message;
      }
      setMessage({ text: friendlyMessage, type: "error" });
      console.error("FinishSignUp.js: --- ERROR calling createNewUserFromInvite function ---", error);
    }
    setProcessing(false);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Complete Your Registration
        </h2>
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Full Name
              </label>
              <input
                id="name"
                className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email Address
              </label>
              <input
                id="email"
                className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your invite email"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Set Password
              </label>
              <input
                id="password"
                className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Create a new password"
              />
            </div>
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Re-enter password"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70"
              disabled={processing || !inviteToken}
            >
              {processing
                ? "Completing Registration..."
                : "Complete Registration & Set Password"}
            </button>
          </form>
        ) : (
          message.text && (
            <div
              className={`p-4 rounded-md ${
                message.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              <p className="font-medium">
                {message.type === "success" ? "Success!" : "Error!"}
              </p>
              <p>{message.text}</p>
              {message.type === "success" && (
                <button
                  onClick={() => navigate("/login")}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-md text-sm"
                >
                  Proceed to Login
                </button>
              )}
              {message.type === "error" && !showForm && (
                <button
                  onClick={() => navigate("/login")}
                  className="mt-4 bg-gray-500 hover:bg-gray-600 text-white font-medium px-4 py-2 rounded-md text-sm"
                >
                  Go to Login / Request New Invite
                </button>
              )}
            </div>
          )
        )}
        {message.text && showForm && (
          <div
            className={`mt-4 text-sm p-3 rounded-md ${
              message.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
