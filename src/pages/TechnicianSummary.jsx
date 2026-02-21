import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, Lock } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

export default function TechnicianSummary() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const quoteId = searchParams.get('quoteId');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: quote } = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => base44.entities.Quote.get(quoteId),
    enabled: !!quoteId,
  });

  const { data: property } = useQuery({
    queryKey: ['property', quote?.propertyId],
    queryFn: () => base44.entities.Property.get(quote?.propertyId),
    enabled: !!quote?.propertyId,
  });

  const { data: quoteBreakdown } = useQuery({
    queryKey: ['quoteBreakdown', quoteId],
    queryFn: async () => {
      const results = await base44.entities.QuoteBreakdown.filter({ quoteId });
      return results[0];
    },
    enabled: !!quoteId,
  });

  const { data: riskScoreFactors } = useQuery({
    queryKey: ['riskScoreFactors', quoteId],
    queryFn: async () => {
      const results = await base44.entities.RiskScoreFactors.filter({ quoteId });
      return results[0];
    },
    enabled: !!quoteId,
  });

  // Only allow authenticated users to view
  if (!user) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-md mx-auto">
          <Lock className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-gray-600 mb-4">You must be logged in to view technician details.</p>
          <Button onClick={() => navigate(createPageUrl('Home'))}>Go Home</Button>
        </div>
      </div>
    );
  }

  if (!property || !quote || !quoteBreakdown || !riskScoreFactors) {
    return <div className="p-6 text-center">Loading technician summary...</div>;
  }

  // Generate technician summary
  const summaryText = generateSummary(property, quote, quoteBreakdown, riskScoreFactors);

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">Technician Summary</h1>
        <p className="text-gray-600 mt-2">Detailed service notes (for technicians only)</p>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Confidential Information</p>
              <p className="text-sm text-blue-800 mt-1">
                This summary includes access codes and sensitive property details. Only share with assigned technicians.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Content */}
      <Card className="bg-white border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Service Notes</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-auto max-h-96 border border-gray-200 whitespace-pre-wrap font-mono">
            {summaryText}
          </pre>
        </CardContent>
      </Card>

      {/* Property Details */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle>Property Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Pool Size</p>
              <p className="text-sm text-gray-900 mt-1">{formatField(property.poolSizeBucket)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Pool Type</p>
              <p className="text-sm text-gray-900 mt-1">{formatField(property.poolType)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Enclosure</p>
              <p className="text-sm text-gray-900 mt-1">{formatField(property.enclosure)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Filter</p>
              <p className="text-sm text-gray-900 mt-1">{formatField(property.filterType)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Sanitizer</p>
              <p className="text-sm text-gray-900 mt-1">{formatField(property.chlorinationMethod)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Condition</p>
              <p className="text-sm text-gray-900 mt-1">{formatField(property.currentCondition)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk & Quote */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle>Risk & Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase mb-2">Risk Score</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{riskScoreFactors.riskScore}</span>
                <span className={`text-sm font-semibold px-3 py-1 rounded ${getRiskBadgeClass(riskScoreFactors.riskLevel)}`}>
                  {riskScoreFactors.riskLevel.toUpperCase()}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase mb-2">Quote</p>
              <p className="text-2xl font-bold text-teal-600">${quote.monthlyBasePrice.toFixed(2)}/mo</p>
              {quoteBreakdown.totalStartupAddOns > 0 && (
                <p className="text-xs text-gray-600 mt-1">+${quoteBreakdown.totalStartupAddOns.toFixed(2)} startup</p>
              )}
            </div>
          </div>

          {riskScoreFactors.topFiveFactors && (
            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 font-semibold uppercase mb-2">Risk Drivers</p>
              <ul className="space-y-1">
                {riskScoreFactors.topFiveFactors.map((factor, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    <span className="font-semibold text-teal-600">{idx + 1}.</span> {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Access Information */}
      {property.accessType && property.accessType !== 'no_restrictions' && (
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader>
            <CardTitle className="text-orange-900">Access Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-orange-700 font-semibold uppercase mb-1">Access Type</p>
              <p className="text-sm text-gray-900">{formatField(property.accessType)}</p>
            </div>
            {property.accessNotes && (
              <div>
                <p className="text-xs text-orange-700 font-semibold uppercase mb-1">Details/Code</p>
                <p className="text-sm text-gray-900 bg-white p-2 rounded border border-orange-200 font-mono">
                  {property.accessNotes}
                </p>
              </div>
            )}
            {property.serviceRestrictionDetails && (
              <div>
                <p className="text-xs text-orange-700 font-semibold uppercase mb-1">Service Restrictions</p>
                <p className="text-sm text-gray-900">{property.serviceRestrictionDetails}</p>
              </div>
            )}
            {property.animalNotes && (
              <div>
                <p className="text-xs text-orange-700 font-semibold uppercase mb-1">Animals on Property</p>
                <p className="text-sm text-gray-900">{property.animalNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Back Button */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
        >
          Back
        </Button>
      </div>
    </div>
  );
}

function formatField(value) {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getRiskBadgeClass(riskLevel) {
  switch (riskLevel) {
    case 'low': return 'bg-emerald-100 text-emerald-800';
    case 'medium': return 'bg-amber-100 text-amber-800';
    case 'high': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function generateSummary(property, quote, quoteBreakdown, riskScoreFactors) {
  const size = property.poolSizeBucket?.replace(/_/g, '-') || 'Unknown';
  const type = property.poolType?.replace(/_/g, ' ') || 'Unknown';
  const enclosure = property.enclosure?.replace(/_/g, ' ') || 'Unknown';
  const filter = property.filterType || 'Unknown';
  const sanitizer = property.chlorinationMethod?.replace(/_/g, ' ') || 'Unknown';
  const chlorinatorInfo = property.chlorinatorType ? ` (${property.chlorinatorType.replace(/_/g, ' ')})` : '';
  const usage = property.useFrequency?.replace(/_/g, ' ') || 'Unknown';
  const pets = property.petsAccess ? `Yes (${property.petsSwimFrequency || 'occasionally'})` : 'No';
  const condition = property.currentCondition?.replace(/_/g, ' ') || 'Unknown';
  const issues = property.knownIssues?.length ? property.knownIssues.join(', ') : 'None';
  const features = property.equipmentFeatures?.length ? property.equipmentFeatures.join(', ') : 'None';
  const access = property.accessType?.replace(/_/g, ' ') || 'Unknown';
  const notes = property.accessNotes || '(See service notes above)';
  const svcRestrictions = property.serviceRestrictionDetails || 'None';
  const animals = property.animalNotes ? `${property.animalsOnProperty.replace(/_/g, ' ')}: ${property.animalNotes}` : 'None';

  return `BREEZ POOL CARE - TECHNICIAN SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROPERTY: ${property.clientName || 'Unnamed'}
ADDRESS: ${property.address}

POOL SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Size: ${size} gallons
Type: ${type}
Enclosure: ${enclosure}
Filter: ${filter}
Sanitization: ${sanitizer}${chlorinatorInfo}
Usage: ${usage}
Condition: ${condition}

PROPERTY DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pets in Pool: ${pets}
Known Issues: ${issues}
Equipment/Features: ${features}
Animals on Property: ${animals}

ACCESS & RESTRICTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Access Type: ${access}
Access Code/Notes: ${notes}
Service Restrictions: ${svcRestrictions}

RISK & SERVICE RECOMMENDATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Risk Score: ${riskScoreFactors.riskScore}/100 (${riskScoreFactors.riskLevel.toUpperCase()})
Top Risk Factors:
${riskScoreFactors.topFiveFactors.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

SERVICE QUOTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Monthly (Weekly Service): $${quote.monthlyBasePrice.toFixed(2)}
Per-Visit: $${quote.perVisitPrice?.toFixed(2) || '—'}
${quoteBreakdown.totalStartupAddOns > 0 ? `First Service Add-ons: $${quoteBreakdown.totalStartupAddOns.toFixed(2)}\n` : ''}
Quote Factors:
${quoteBreakdown.topThreeFactors.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}
`;
}