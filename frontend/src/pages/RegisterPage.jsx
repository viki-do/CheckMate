import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Mail, User, Lock, ChevronLeft } from 'lucide-react';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';
import { PASSWORD_REQUIREMENTS_MESSAGE, passwordMeetsRequirements } from '../utils/passwordValidation';
import { API_BASE } from '../config/api';

const RegisterPage = () => {
  const [regStep, setRegStep] = useState(1); // 1: Választás, 2: Adatmegadás
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '' });
  const [registerError, setRegisterError] = useState('');
  const navigate = useNavigate();
  const { demoToken } = useParams();
  const [searchParams] = useSearchParams();
  const activeDemoToken = demoToken || searchParams.get('demo') || '';
  const isDemoMode = Boolean(activeDemoToken);

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError('');
    if (!passwordMeetsRequirements(registerForm.password)) {
      setRegisterError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    try {
      await axios.post(`${API_BASE}/register`, {
        ...registerForm,
        demo_token: activeDemoToken || undefined,
      });
      alert("Registration successful. You can now sign in.");
      navigate('/login');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || "Registration failed");
    }
  };

  const handleSocialLogin = (provider) => {
    window.location.assign(`${API_BASE}/auth/${provider}`);
  };

  const handlePasswordChange = (e) => {
    const nextPassword = e.target.value;
    if (registerError && nextPassword.length === 0) setRegisterError('');
    setRegisterForm({ ...registerForm, password: nextPassword });
  };

  // Reusable Tailwind classes
  const inputClasses = "w-full pl-10 pr-3 py-3 bg-[#262421] border border-[#454241] rounded text-white focus:outline-none focus:border-[#81b64c] transition-colors";
  const mainBtnClasses = "w-full py-3.5 bg-[#81b64c] text-white text-lg font-bold rounded hover:bg-[#a3d16a] transition-colors cursor-pointer";
  const socialBtnClasses = "flex items-center justify-center gap-3 w-full p-3 bg-[#454241] text-white rounded hover:bg-[#53504f] transition-colors duration-200 text-sm font-medium cursor-pointer";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#262421] px-4 py-6 font-sans overflow-y-auto">
      
      {/* Jobb felső Log In link */}
      <div className="absolute top-5 right-4 sm:right-10">
        <Link to="/login" className="text-white no-underline opacity-80 hover:opacity-100 transition-opacity">Log In</Link>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <img src="/assets/pieces/white_pawn.png" className="w-10" alt="logo" />
        <h1 className="text-white text-3xl font-bold m-0">
          CheckMate<span className="text-[#81b64c]">.com</span>
        </h1>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="w-full max-w-[450px] text-center"
      >
        <AnimatePresence mode="wait">
          {/* --- 1. LÉPÉS: VÁLASZTÁS --- */}
          {regStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-white text-3xl font-bold mb-2">{isDemoMode ? 'Create Demo Account' : 'Create Your Account'}</h2>
              <img 
                src="/assets/pieces/white_pawn.png" 
                className="w-20 my-5 drop-shadow-[0_0_10px_#81b64c]" 
                alt="pawn" 
              />
              
              <div className="flex flex-col gap-3 w-full mt-5">
                <button onClick={() => setRegStep(2)} className={mainBtnClasses}>
                  Continue with Email
                </button>
                
                {!isDemoMode && (
                  <>
                    <div className="flex items-center gap-2.5 my-4 text-[#8b8987] text-sm select-none">
                      <div className="flex-1 h-px bg-[#454241]"></div>
                      OR
                      <div className="flex-1 h-px bg-[#454241]"></div>
                    </div>
                    
                    <button onClick={() => handleSocialLogin('google')} className={socialBtnClasses}>
                      <img src="/assets/logos/google.png" alt="google" className="w-5 h-5 object-contain pointer-events-none" />
                      Continue with Google
                    </button>

                    <button onClick={() => handleSocialLogin('github')} className={socialBtnClasses}>
                      <img src="/assets/logos/github.svg" alt="github" className="w-5 h-5 object-contain invert pointer-events-none" />
                      Continue with GitHub
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* --- 2. LÉPÉS: ADATOK MEGADÁSA --- */}
          {regStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-chess-bg p-5 sm:p-8 rounded-lg text-left shadow-xl"
            >
              <div 
                className="flex items-center gap-1 mb-5 cursor-pointer text-[#8b8987] hover:text-white transition-colors"
                onClick={() => setRegStep(1)}
              >
                <ChevronLeft size={20} /> <span className="text-sm font-medium">Back</span>
              </div>
              
              <h2 className="text-white text-2xl font-bold mb-6">{isDemoMode ? 'Start 24-hour demo' : 'Sign up with Email'}</h2>
              
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                {registerError && (
                  <div className="rounded border-l-4 border-[#ff4b35] bg-[#3e2521] px-3 py-2 text-sm font-bold text-white">
                    {registerError}
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8987]" size={20} />
                  <input 
                    type="email" placeholder="Email" required className={inputClasses}
                    onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} 
                  />
                </div>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8987]" size={20} />
                  <input 
                    type="text" placeholder="Username" required className={inputClasses}
                    onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} 
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8987]" size={20} />
                  <input 
                    type="password" placeholder="Password" required className={inputClasses}
                    onChange={handlePasswordChange} 
                  />
                </div>

                <button type="submit" className={`${mainBtnClasses} mt-2`}>
                  Create Account
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
