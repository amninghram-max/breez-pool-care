import React from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Play } from 'lucide-react';

export default function StartInspectionButton({ leadId }) {
  return (
    <Link to={createPageUrl('InspectionSubmit') + `?leadId=${leadId}`}>
      <Button size="sm" variant="default" className="gap-2">
        <Play className="w-3 h-3" />
        Start Inspection
      </Button>
    </Link>
  );
}