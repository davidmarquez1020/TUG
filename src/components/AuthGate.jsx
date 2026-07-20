import React, { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { signIn, signUp } from "../lib/auth.js";

export default function AuthGate() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await signUp(email, password, displayName);
        if (error) throw error;
        setError("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 text-gray-100 font-semibold text-lg mb-8 justify-center">
          <LifeBuoy className="w-5 h-5 text-orange-500" /> TUG
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex bg-gray-700 rounded-full p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold ${mode === "signin" ? "bg-orange-600 text-white" : "text-gray-400"}`}
            >
              SIGN IN
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold ${mode === "signup" ? "bg-orange-600 text-white" : "text-gray-400"}`}
            >
              SIGN UP
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-gray-400 text-xs font-medium mb-1.5 block uppercase tracking-wide">Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="First name or handle"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500"
                />
              </div>
            )}
            <div>
              <label className="text-gray-400 text-xs font-medium mb-1.5 block uppercase tracking-wide">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium mb-1.5 block uppercase tracking-wide">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500"
              />
            </div>

            {error && <p className="text-orange-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-lg text-white font-semibold text-sm tracking-wide bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-400"
            >
              {busy ? "..." : mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
