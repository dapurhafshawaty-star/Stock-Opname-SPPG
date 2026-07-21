import React, { useState, useEffect } from 'react';
import { googleSignIn, logoutFirebase } from '../lib/firebaseAuth';
import { UserProfile, UserRole } from '../types';
import { LogIn, ShieldAlert, KeyRound, ArrowLeft, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthGateProps {
  staffProfiles: UserProfile[];
  onAuthComplete: (user: UserProfile, token: string) => void;
  onAddAdminProfile: (admin: UserProfile) => Promise<void>;
  token: string | null;
  googleUserEmail: string | null;
  onGoogleSignIn: () => Promise<{ email: string; token: string }>;
  onSignOut: () => Promise<void>;
}

export default function AuthGate({
  staffProfiles,
  onAuthComplete,
  onAddAdminProfile,
  token,
  googleUserEmail,
  onGoogleSignIn,
  onSignOut,
}: AuthGateProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // PIN Login States
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  
  // First time Admin registration
  const [showAdminReg, setShowAdminReg] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminPin, setAdminPin] = useState('');

  // Handle Google Login Click
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await onGoogleSignIn();
      // Wait for profiles to sync. If no profiles exist, show admin registration form
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Gagal login menggunakan akun Google.');
    } finally {
      setLoading(false);
    }
  };

  // Check if first-time setup is needed
  useEffect(() => {
    if (googleUserEmail && token) {
      const matched = staffProfiles.find(
        (p) => p.email.toLowerCase() === googleUserEmail.toLowerCase()
      );
      if (!matched && staffProfiles.length === 0) {
        setShowAdminReg(true);
      } else if (matched) {
        setSelectedProfile(matched);
      } else {
        setError(`Email ${googleUserEmail} belum terdaftar. Silakan hubungi Admin Dapur SPPG.`);
      }
    } else {
      setSelectedProfile(null);
      setShowAdminReg(false);
    }
  }, [googleUserEmail, staffProfiles, token]);

  // Handle Admin Register
  const handleRegisterAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim() || adminPin.length !== 4) {
      setError('Masukkan nama lengkap dan 4 digit PIN.');
      return;
    }

    setLoading(true);
    try {
      const newAdmin: UserProfile = {
        id: 'STAFF-' + Date.now(),
        name: adminName,
        email: googleUserEmail!,
        role: 'ADMIN',
        pin: adminPin,
      };
      await onAddAdminProfile(newAdmin);
      setSelectedProfile(newAdmin);
      setShowAdminReg(false);
    } catch (err: any) {
      setError('Gagal membuat profil admin: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle PIN Pad Clicks
  const handlePinClick = (num: string) => {
    setPinError(false);
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      
      // Auto submit when 4 digits are entered
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    setPinError(false);
    setPin(pin.slice(0, -1));
  };

  const handleClear = () => {
    setPinError(false);
    setPin('');
  };

  const verifyPin = (enteredPin: string) => {
    if (!selectedProfile) return;
    
    if (selectedProfile.pin === enteredPin) {
      // PIN correct! Proceed to app
      onAuthComplete(selectedProfile, token!);
    } else {
      // PIN incorrect
      setPinError(true);
      setPin('');
      // Vibrate on error
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
      {/* Background patterns */}
      <div className="absolute top-0 inset-x-0 h-64 bg-emerald-600/10 -skew-y-3 origin-top-left -z-10" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 flex flex-col p-6 sm:p-8 relative">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl mx-auto flex items-center justify-center text-white font-black text-2xl shadow-md shadow-emerald-500/20 mb-3">
            SP
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dapur SPPG</h1>
          <p className="text-sm text-slate-500 mt-1">Sistem Manajemen Stock Opname & Bahan Makanan</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-100 flex items-start gap-2 text-xs text-red-600">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <div>
              <span className="font-semibold">Perhatian:</span> {error}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* STEP 1: Google Sign-In */}
          {!token && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center py-4"
            >
              <p className="text-sm text-slate-500 text-center mb-6 max-w-xs">
                Gunakan email Google resmi Dapur SPPG untuk mengaktifkan sinkronisasi Google Sheets otomatis.
              </p>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="gsi-material-button w-full flex items-center justify-center py-2.5 px-4 border border-slate-300 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer shadow-sm text-slate-700 font-medium text-sm gap-3 relative"
              >
                {loading ? (
                  <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin" />
                ) : (
                  <>
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                    <span>Masuk dengan Google</span>
                  </>
                )}
              </button>
            </motion.div>
          )}

          {/* STEP 2: First Time Admin Registration */}
          {token && showAdminReg && (
            <motion.form
              onSubmit={handleRegisterAdmin}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4"
            >
              <div className="bg-emerald-50 p-4 rounded-xl text-emerald-800 text-xs flex gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
                <div>
                  <p className="font-semibold">Inisialisasi Sistem</p>
                  <p>Email Google Anda berhasil terverifikasi. Karena belum ada staff terdaftar, Anda akan terdaftar sebagai <strong className="font-bold">ADMIN UTAMA</strong>.</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Chef Hafshawaty"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Buat 4-Digit PIN Baru</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  pattern="[0-9]{4}"
                  placeholder="xxxx"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 tracking-[0.5em] text-center font-bold"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">PIN digunakan untuk login harian cepat di perangkat dapur.</span>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" /> Batalkan
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Selesaikan Pendaftaran'}
                </button>
              </div>
            </motion.form>
          )}

          {/* STEP 3: PIN Verification Pad */}
          {token && selectedProfile && !showAdminReg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center"
            >
              <div className="flex items-center gap-2 mb-4 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-full text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Terhubung: {googleUserEmail}</span>
              </div>

              <div className="text-center mb-6">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Selamat Datang</p>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">{selectedProfile.name}</h2>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-semibold">
                  Role: {selectedProfile.role === 'ADMIN' ? 'Admin Dapur' : selectedProfile.role === 'SUPERVISOR' ? 'Supervisor' : 'Staf Dapur'}
                </span>
              </div>

              {/* Password dots */}
              <div className="flex justify-center gap-4 mb-6">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`w-3.5 h-3.5 rounded-full border border-slate-300 transition-all duration-150 ${
                      pinError
                        ? 'bg-red-500 border-red-500 animate-bounce'
                        : index < pin.length
                        ? 'bg-emerald-500 border-emerald-500 scale-110 shadow-sm'
                        : 'bg-slate-100'
                    }`}
                  />
                ))}
              </div>

              {pinError && (
                <p className="text-xs text-red-500 font-medium mb-4 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> PIN Salah, silakan coba lagi.
                </p>
              )}

              {/* Numpad Grid */}
              <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    onClick={() => handlePinClick(num)}
                    className="aspect-square bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-100 text-slate-800 font-bold text-lg rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="aspect-square bg-slate-100/50 hover:bg-slate-100 text-slate-500 text-xs font-semibold rounded-xl flex items-center justify-center transition-all cursor-pointer"
                >
                  Clear
                </button>
                <button
                  onClick={() => handlePinClick('0')}
                  className="aspect-square bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-100 text-slate-800 font-bold text-lg rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className="aspect-square bg-slate-100/50 hover:bg-slate-100 text-slate-500 text-xs font-semibold rounded-xl flex items-center justify-center transition-all cursor-pointer"
                >
                  Del
                </button>
              </div>

              {/* Back Button / Switch Email */}
              <button
                onClick={onSignOut}
                className="mt-6 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Keluar dari email ini
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer brand info */}
        <div className="mt-8 pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400">
          SPPG Boarding School Kitchen Management System v1.0
        </div>
      </div>
    </div>
  );
}
