import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader2, Phone, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Activate() {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const leadId = searchParams.get('leadId');
  const mode = searchParams.get('mode') || 'signup'; // Force signup unless explicitly set to signin

  const [status, setStatus] = useState('idle'); // idle | linking | success | error | role_blocked
  const [errorMsg, setErrorMsg] = useState('');
  const [leadFirstName, setLeadFirstName] = useState(null);

  // Auth form state
  const [authMode, setAuthMode] = useState(mode); // 'signup' | 'signin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  // OTP verification
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['activateUser'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    if (userLoading) return;
    if (!leadId) return; // error UI shown below
    if (!user) return;  // login UI shown below — wait for auth before validating

    const doLink = async () => {
      setStatus('linking');
      try {
        const res = await base44.functions.invoke('linkUserToLead', { leadId, role: 'customer' });

        if (!res.data?.ok) {
          if (res.data?.error === 'role_not_allowed') {
            setStatus('role_blocked');
            return;
          }
          setErrorMsg('This activation link is invalid or has expired. Please contact support.');
          setStatus('error');
          return;
        }

        // Redirect to Agreements page
        navigate(createPageUrl('Agreements') + (leadId ? `?inspectionId=${leadId}` : ''), { replace: true });
      } catch (err) {
        console.error('Activate error:', err);
        setErrorMsg(err.message || 'Something went wrong. Please try again or contact support.');
        setStatus('error');
      }
    };

    doLink();
  }, [user, userLoading, leadId, navigate]);

  // ── No leadId ──────────────────────────────────────────────────────────────
  if (!leadId) {
    return (
      <ErrorCard
        title="Invalid activation link"
        message="This link is missing a required parameter. Please use the link from your welcome email or contact support."
      />
    );
  }

  // ── Inline auth handlers ────────────────────────────────────────────────────
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!passwordsMatch) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthError('');
    setAuthLoading(true);
    try {
      await base44.auth.register({ email, password });
      setOtpStep(true);
    } catch (err) {
      setAuthError(err.message || 'Registration failed. Please try again.');
      setPassword('');
      setConfirmPassword('');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOtpVerifyAndLink = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await base44.auth.verifyOtp({ email, otpCode });
      // Log in after OTP verified
      await base44.auth.loginViaEmailPassword(email, password);
      // Link to lead with customer role
      if (leadId) {
        const res = await base44.functions.invoke('linkUserToLead', { leadId, role: 'customer' });
        if (!res.data?.ok) {
          setAuthError(res.data?.error === 'role_not_allowed' ? 'This account cannot be linked.' : 'Failed to link account.');
          setAuthLoading(false);
          return;
        }
      }
      // Navigate to Agreements page
      navigate(createPageUrl('Agreements') + (leadId ? `?inspectionId=${leadId}` : ''), { replace: true });
    } catch (err) {
      setAuthError(err.message || 'Verification failed. Please check your code.');
    } finally {
      setAuthLoading(false);
    }
  };



  const handleSignin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      queryClient.invalidateQueries({ queryKey: ['activateUser'] });
    } catch (err) {
      setAuthError(err.message || 'Sign in failed. Please check your email and password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const GoogleIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );

  // ── Not authenticated ───────────────────────────────────────────────────────
  if (!userLoading && !user) {
    const isSignup = authMode === 'signup';

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 space-y-6">
          <div className="text-center">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
              alt="Breez Pool Care"
              className="h-12 mx-auto mb-4"
            />
            <h2 className="text-2xl font-bold text-gray-900">
              {isSignup ? 'Create your Breez account' : 'Sign in to your account'}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {isSignup
                ? "You'll be linked to your pool profile automatically."
                : 'Sign in to link your pool profile.'}
            </p>
          </div>

          {/* Google */}
          <Button
            variant="outline"
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2">or</div>
          </div>

          {/* OTP Step */}
          {otpStep ? (
            <form onSubmit={handleOtpVerifyAndLink} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                We sent a verification code to <strong>{email}</strong>. Enter it below.
              </p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-center tracking-widest"
              />
              {authError && <p className="text-red-500 text-xs text-center">{authError}</p>}
              <Button onClick={handleOtpVerifyAndLink} disabled={authLoading} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Continue'}
              </Button>
              <button type="button" className="text-xs text-gray-400 w-full text-center hover:underline" onClick={() => base44.auth.resendOtp(email)}>
                Resend code
              </button>
            </form>
          ) : (
            /* Email/Password form */
            <form onSubmit={isSignup ? handleSignup : handleSignin} className="space-y-3">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isSignup && (
                <div className="space-y-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                      passwordMismatch ? 'border-red-400' : confirmPassword && passwordsMatch ? 'border-green-400' : 'border-gray-300'
                    }`}
                  />
                  {passwordMismatch && (
                    <p className="text-red-500 text-xs">Passwords do not match</p>
                  )}
                  {passwordsMatch && (
                    <p className="text-green-600 text-xs">✓ Passwords match</p>
                  )}
                </div>
              )}
              {authError && <p className="text-red-500 text-xs">{authError}</p>}
              <Button
                type="submit"
                disabled={authLoading || (isSignup && !passwordsMatch)}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSignup ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          )}

          <p className="text-sm text-gray-500 text-center">
            {isSignup ? (
              <>Already have an account?{' '}
                <button className="text-teal-600 hover:underline font-medium" onClick={() => { setAuthMode('signin'); setAuthError(''); setOtpStep(false); setConfirmPassword(''); }}>Sign in</button>
              </>
            ) : (
              <>Don't have an account?{' '}
                <button className="text-teal-600 hover:underline font-medium" onClick={() => { setAuthMode('signup'); setAuthError(''); }}>Create one</button>
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (userLoading || status === 'idle') {
    return <LoadingScreen message="Checking your account…" />;
  }

  if (status === 'linking') {
    return <LoadingScreen message="Linking your pool profile…" />;
  }

  // ── Role blocked ─────────────────────────────────────────────────────────────
  if (status === 'role_blocked') {
    return (
      <ErrorCard
        title="Please use a customer account"
        message="This activation link is for customers only. Staff and admin accounts cannot be linked via this page."
      />
    );
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 space-y-4 text-center">
          <CheckCircle className="w-12 h-12 text-teal-500 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">
            {leadFirstName ? `You're all set, ${leadFirstName}!` : "You're all set!"}
          </h2>
          <p className="text-gray-600 text-sm">Taking you to your dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  return <ErrorCard title="Activation failed" message={errorMsg} />;
}

function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 text-teal-500 animate-spin mx-auto" />
        <p className="text-gray-600 text-sm">{message}</p>
      </div>
    </div>
  );
}

function ErrorCard({ title, message }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 space-y-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="text-gray-600 text-sm">{message}</p>
        <a href="tel:+13215243838">
          <Button variant="outline" className="w-full mt-2">
            <Phone className="w-4 h-4 mr-2" />
            Call us at (321) 524-3838
          </Button>
        </a>
      </div>
    </div>
  );
}