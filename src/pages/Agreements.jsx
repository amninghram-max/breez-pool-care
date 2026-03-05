import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Eye, Loader2, CheckCircle2 } from 'lucide-react';
import AgreementModal from '@/components/agreements/AgreementModal';
import {
  AGREEMENT_ITEMS,
  AGREEMENT_CONTENT,
  AGREEMENT_VERSIONS,
} from '@/components/agreements/agreementContent';

export default function Agreements() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [validationError, setValidationError] = useState(null);

  // Agreement state
  const [agreed, setAgreed] = useState({
    serviceAgreement: false,
    privacyPolicy: false,
    photoConsent: false,
  });

  const urlParams = new URLSearchParams(window.location.search);
  const inspectionId = urlParams.get('inspectionId');

  // Fetch user and lead
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: lead } = useQuery({
    queryKey: ['myLead', user?.email],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user,
  });

  // If already agreed with same versions, skip to payment setup
  if (lead?.agreementsAccepted && lead?.agreementsAcceptedAt) {
    const alreadyAgreed =
      lead.agreementsAccepted === true;
    if (alreadyAgreed) {
      navigate(
        createPageUrl('PaymentSetup') +
          (inspectionId ? `?inspectionId=${inspectionId}` : ''),
        { replace: true }
      );
      return null;
    }
  }

  if (!user || !lead) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const handleViewAgreement = (itemId) => {
    const contentKey = itemId;
    setSelectedAgreement(AGREEMENT_CONTENT[contentKey]);
    setIsModalOpen(true);
  };

  const handleAgreeToAll = async () => {
    // Validate required agreements
    if (!agreed.serviceAgreement || !agreed.privacyPolicy) {
      setValidationError('Please agree to the required agreements to continue.');
      return;
    }

    setValidationError(null);
    setLoading(true);
    setError(null);

    try {
      // Create/upsert AgreementAcceptance record
      const ipAddress = await (async () => {
        try {
          const res = await fetch('https://api.ipify.org?format=json');
          const data = await res.json();
          return data.ip || null;
        } catch {
          return null;
        }
      })();

      const userAgent = navigator.userAgent;

      // Check if acceptance record already exists
      const existing = await base44.entities.AgreementAcceptance.filter({
        leadId: lead.id,
        versionServiceAgreement: AGREEMENT_VERSIONS.serviceAgreement,
        versionPrivacyPolicy: AGREEMENT_VERSIONS.privacyPolicy,
        versionPhotoConsent: AGREEMENT_VERSIONS.photoConsent,
      });

      if (existing.length > 0) {
        // Update existing record
        await base44.entities.AgreementAcceptance.update(existing[0].id, {
          agreedToServiceAgreement: agreed.serviceAgreement,
          agreedToPrivacyPolicy: agreed.privacyPolicy,
          photoConsent: agreed.photoConsent,
          acceptedAt: new Date().toISOString(),
          ipAddress,
          userAgent,
        });
      } else {
        // Create new record
        await base44.entities.AgreementAcceptance.create({
          leadId: lead.id,
          email: lead.email,
          serviceAddress: lead.serviceAddress,
          agreedToServiceAgreement: agreed.serviceAgreement,
          agreedToPrivacyPolicy: agreed.privacyPolicy,
          photoConsent: agreed.photoConsent,
          acceptedAt: new Date().toISOString(),
          versionServiceAgreement: AGREEMENT_VERSIONS.serviceAgreement,
          versionPrivacyPolicy: AGREEMENT_VERSIONS.privacyPolicy,
          versionPhotoConsent: AGREEMENT_VERSIONS.photoConsent,
          ipAddress,
          userAgent,
        });
      }

      // Update lead to mark agreements as accepted
      await base44.entities.Lead.update(lead.id, {
        agreementsAccepted: true,
        agreementsAcceptedAt: new Date().toISOString(),
      });

      // Navigate to PaymentSetup
      navigate(
        createPageUrl('PaymentSetup') +
          (inspectionId ? `?inspectionId=${inspectionId}` : '')
      );
    } catch (err) {
      console.error('Agreement acceptance error:', err);
      setError(err.message || 'Failed to save agreements. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
          <CheckCircle2 className="w-8 h-8 text-teal-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Legal Agreements</h1>
        <p className="text-lg text-gray-600">
          Please review and agree to our terms before continuing
        </p>
      </div>

      {/* Agreement Items */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Required & Optional Agreements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {AGREEMENT_ITEMS.map((item) => (
            <div key={item.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <Checkbox
                id={item.id}
                checked={agreed[item.id]}
                onCheckedChange={(checked) =>
                  setAgreed((prev) => ({ ...prev, [item.id]: checked }))
                }
                className="mt-1 cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor={item.id} className="cursor-pointer block">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{item.title}</span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        item.required
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {item.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                </label>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleViewAgreement(item.id)}
                className="mt-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
              >
                <Eye className="w-4 h-4 mr-1" />
                View
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Validation Error */}
      {validationError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {/* Server Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">By continuing, you agree to:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Our Customer Service Agreement with billing & suspension terms</li>
                <li>Our Privacy Policy</li>
                {agreed.photoConsent && <li>Photo & media consent for marketing</li>}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA Button */}
      <Button
        onClick={handleAgreeToAll}
        disabled={loading}
        className="w-full h-12 text-lg bg-teal-600 hover:bg-teal-700 text-white"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Agree to All & Continue'
        )}
      </Button>

      <p className="text-xs text-gray-500 text-center mt-4">
        You can cancel your service anytime at the end of your billing cycle.
      </p>

      {/* Agreement Modal */}
      <AgreementModal
        agreement={selectedAgreement}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}