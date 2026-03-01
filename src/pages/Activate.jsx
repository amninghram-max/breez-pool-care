import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROTECTED_ROLES = ['admin', 'staff', 'technician'];

export default function Activate() {
  const navigate = useNavigate();
  // Path routing only — /Activate?leadId=...
  const leadId = new URLSearchParams(window.location.search).get('leadId');

  const [status, setStatus] = useState('idle'); // idle | linking | success | error
  const [errorMsg, setErrorMsg] = useState('');

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
    if (!user) return; // wait for auth
    if (!leadId) return; // show error UI below

    const doLink = async () => {
      setStatus('linking');
      try {
        // Validate lead exists via backend function (bypasses RLS for new users)
        let leadValid = false;
        try {
          const res = await base44.functions.invoke('linkUserToLead', {
            validateOnly: true,
            leadId,
          });
          leadValid = res.data?.leadExists === true;
        } catch {
          leadValid = false;
        }

        if (!leadValid) {
          setErrorMsg('This activation link is invalid or has expired. Please contact support.');
          setStatus('error');
          return;
        }

        // Build updateMe payload — never downgrade protected roles
        const updatePayload = { linkedLeadId: leadId };
        const isProtected = PROTECTED_ROLES.includes(user.role);
        if (!isProtected) {
          updatePayload.role = 'customer';
        }

        await base44.auth.updateMe(updatePayload);
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
            <h2 className="text-xl font-semibold text-gray-900">Create your account to continue</h2>
            <p className="text-gray-600 text-sm">
              Please log in or sign up to activate your Breez Pool Care account. Your pool profile will be linked automatically.
            </p>
          </div>
          <Button
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
          >
            Log in / Sign up
          </Button>
          <p className="text-xs text-gray-400">
            Already have an account? Logging in will link your pool profile automatically.
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

  // ── Success ─────────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 space-y-4 text-center">
          <CheckCircle className="w-12 h-12 text-teal-500 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">You're all set!</h2>
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