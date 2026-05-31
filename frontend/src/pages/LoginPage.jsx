import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { User, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config/api';

const LoginPage = () => {
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const username = params.get('username');
    const userId = params.get('user_id');
    const mode = params.get('mode');
    const error = params.get('error');

    if (error) {
      alert("Social sign-in failed. Please try again.");
      window.history.replaceState({}, document.title, "/login"); 
      return;
    }

    if (token && username && userId) {
      localStorage.setItem('chessToken', token);
      localStorage.setItem('chessUsername', username);
      localStorage.setItem('chessUserId', userId);
      if (mode) localStorage.setItem('chessMode', mode);
      window.history.replaceState({}, document.title, "/login");
      window.location.replace('/home');
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/login`, loginForm);
      localStorage.setItem('chessToken', res.data.access_token);
      localStorage.setItem('chessUsername', res.data.username);
      localStorage.setItem('chessUserId', res.data.user_id);
      localStorage.setItem('chessMode', res.data.mode || 'user');
      if (res.data.demo_expires_at) localStorage.setItem('chessDemoExpiresAt', res.data.demo_expires_at);
      window.location.replace('/home');
    } catch (err) { 
      if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED' || err?.message === 'Request aborted') {
        setIsSubmitting(false);
        return;
      }
      console.error(err); 
      alert("Invalid login credentials.");
      setIsSubmitting(false);
    }
  };

  const handleSocialLogin = (provider) => {
    const url = `${API_BASE}/auth/${provider}`;
    window.location.assign(url);
  };

  // Közös Tailwind osztályok az inputokhoz és a social gombokhoz
  const inputClasses = "w-full pl-10 pr-3 py-3 bg-[#262421] border border-[#454241] rounded text-white focus:outline-none focus:border-[#81b64c] transition-colors";
  const socialBtnClasses = "flex items-center w-full px-4 py-3 bg-[#454241] text-white rounded hover:bg-[#53504f] transition-colors duration-200 text-sm font-medium";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#262421] px-4 py-6 font-sans overflow-y-auto">
      
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <img src="/assets/pieces/white_pawn.png" className="w-10" alt="logo" />
        <h1 className="text-white text-3xl font-bold m-0">
          Checkmate<span className="text-[#81b64c]">.com</span>
        </h1>
      </div>

      {/* Login Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[400px] bg-chess-bg px-5 py-7 sm:px-8 sm:py-10 rounded-lg shadow-[0_15px_35px_rgba(0,0,0,0.4)] text-center"
      >
        <h2 className="text-white text-2xl font-bold mb-6">Sign in</h2>
        
        {/* Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8987]" size={20} />
            <input 
              type="text" 
              placeholder="Username" 
              required 
              className={inputClasses}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} 
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8987]" size={20} />
            <input 
              type="password" 
              placeholder="Password" 
              required 
              className={inputClasses}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} 
            />
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full mt-2 py-3.5 bg-[#81b64c] text-white text-lg font-bold rounded hover:bg-[#a3d16a] transition-colors disabled:opacity-70 disabled:cursor-wait"
          >
            {isSubmitting ? 'Signing in...' : 'Log In'}
          </button>
        </form>

        {/* Separator */}
        <div className="flex items-center gap-2.5 my-5 text-[#8b8987] text-sm">
          <div className="flex-1 h-px bg-[#454241]"></div> 
          OR 
          <div className="flex-1 h-px bg-[#454241]"></div>
        </div>

        {/* Social Buttons */}
        <div className="flex flex-col gap-2.5">
          <button onClick={() => handleSocialLogin('google')} className={socialBtnClasses}>
            <div className="w-8 flex justify-center items-center">
              <img src="/assets/logos/google.png" alt="Google" className="w-5 h-5 object-contain" />
            </div>
            <span className="ml-2">Login with Google</span>
          </button>

          <button onClick={() => handleSocialLogin('github')} className={socialBtnClasses}>
            <div className="w-8 flex justify-center items-center">
                <img src="/assets/logos/github.svg" alt="GitHub" className="w-5 h-5 invert" />
            </div>
            <span className="ml-2">Login with GitHub</span>
          </button>

          <button onClick={() => handleSocialLogin('facebook')} className={socialBtnClasses}>
            <div className="w-8 flex justify-center items-center">
              <img src="/assets/logos/facebook.svg" alt="Facebook" className="w-5 h-5 object-contain" />
            </div>
            <span className="ml-2">Login with Facebook</span>
          </button>
        </div>

        {/* Register Link */}
        <p className="mt-6 text-[#8b8987] text-sm">
          New? <Link to="/register" className="text-[#81b64c] font-bold ml-1 no-underline hover:underline">
            Sign up now
          </Link>.
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
