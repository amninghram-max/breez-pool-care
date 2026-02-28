import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, ExternalLink, FileText, Image } from 'lucide-react';

const EQUIPMENT_LABELS = {
  pump: 'Pump',
  filter: 'Filter',
  heater: 'Heater',
  solar_heater: 'Solar Heater',
  automation: 'Automation System',
  salt_cell: 'Salt Cell',
  other: 'Equipment',
};

const EQUIPMENT_DESCRIPTIONS = {
  pump: 'Circulates water through your filter and return jets to keep the pool clean and clear.',
  filter: 'Removes debris, particles, and contaminants from the water as it passes through.',
  heater: 'Warms your pool water to a comfortable temperature.',
  solar_heater: 'Uses solar energy to warm your pool water.',
  automation: 'Controls your pool equipment — pump scheduling, lighting, and more — from one interface.',
  salt_cell: 'Converts dissolved salt in your water into chlorine, providing a natural sanitization method.',
  other: 'Pool equipment.',
};

export default function EquipmentCard({ equipment }) {
  const [expanded, setExpanded] = useState(false);

  const label = EQUIPMENT_LABELS[equipment.equipmentType] || 'Equipment';
  const description = EQUIPMENT_DESCRIPTIONS[equipment.equipmentType] || '';
  const hasDetails = equipment.brand || equipment.model || equipment.labelPhotoUrl || equipment.manualPdfUrl || equipment.manufacturerWebsiteUrl;

  return (
    <Card className="border-gray-100">
      <CardContent className="pt-4 pb-4 space-y-0">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setExpanded(v => !v)}
        >
          <div>
            <p className="font-semibold text-gray-800 text-sm">{label}</p>
            {(equipment.brand || equipment.model) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {[equipment.brand, equipment.model].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {hasDetails && (
            expanded
              ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="pt-4 space-y-4">
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>

            {/* Label photo */}
            {equipment.labelPhotoUrl && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium flex items-center gap-1.5">
                  <Image className="w-3 h-3" /> Equipment Label
                </p>
                <a href={equipment.labelPhotoUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={equipment.labelPhotoUrl}
                    alt={`${label} label`}
                    className="w-full max-h-40 object-contain rounded-lg border border-gray-100 bg-gray-50"
                  />
                </a>
              </div>
            )}

            {/* Manual access */}
            {(equipment.manualPdfUrl || equipment.manufacturerWebsiteUrl) && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Operating Manual</p>
                <div className="flex flex-col gap-2">
                  {equipment.manualPdfUrl && (
                    <a
                      href={equipment.manualPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
                    >
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      View Manual PDF
                    </a>
                  )}
                  {equipment.manufacturerWebsiteUrl && (
                    <a
                      href={equipment.manufacturerWebsiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      Manufacturer Website
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}