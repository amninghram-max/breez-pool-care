import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Activate() {
  const navigate = useNavigate();
  // Path routing only — /Activate?leadId=...
  const leadId = new URLSearchParams(window.location.search).get('leadId');

  const [status, setStatus] = useState('idle'); // idle | linking | success | error | role_blocked
  const [errorMsg, setErrorMsg] = useState('');
  const [leadFirstName, setLeadFirstName] = useState(null);

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
      // Try to fetch lead first name for personalization
      try {
        const lead = await base44.entities.Lead.get(leadId);
        if (lead?.firstName) setLeadFirstName(lead.firstName);
      } catch { /* RLS may block — silent */ }

      try {
        const res = await base44.functions.invoke('linkUserToLead', { leadId });

        if (!res.data?.ok) {
          if (res.data?.error === 'role_not_allowed') {
            setStatus('role_blocked');
            return;
          }
          setErrorMsg('This activation link is invalid or has expired. Please contact support.');
          setStatus('error');
          return;
        }

        setStatus('success');

        // Brief pause so user sees success, then navigate
        setTimeout(() => {
          navigate(createPageUrl('ClientHome'), { replace: true });
        }, 1500);
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

  // ── Not authenticated ───────────────────────────────────────────────────────
  if (!userLoading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 space-y-6 text-center">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-12 mx-auto"
          />
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Create your Breez account</h2>
            <p className="text-gray-500 text-sm">
              You'll be linked to your pool profile automatically.
            </p>
          </div>
          <div className="space-y-3">
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => base44.auth.redirectToLogin(window.location.href)}
            >
              Sign up with email
            </Button>
            <Button
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
              onClick={() => base44.auth.redirectToLogin(window.location.href)}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            Already have an account?{' '}
            <button
              className="text-teal-600 hover:underline font-medium"
              onClick={() => base44.auth.redirectToLogin(window.location.href)}
            >
              Sign in
            </button>
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