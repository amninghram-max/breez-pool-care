import React from 'react';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, Mail, Copy, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function QuickActionsBar({ lead }) {
  const handleCopyAddress = () => {
    if (lead?.serviceAddress) {
      navigator.clipboard.writeText(lead.serviceAddress);
      toast.success('Address copied to clipboard');
    }
  };

  const handleOpenMaps = () => {
    if (lead?.serviceAddress) {
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(lead.serviceAddress)}`;
      window.open(mapsUrl, '_blank');
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {lead?.mobilePhone && (
        <a href={`tel:${lead.mobilePhone}`} className="no-underline">
          <Button size="sm" variant="outline" className="gap-2">
            <Phone className="w-3 h-3" />
            Call
          </Button>
        </a>
      )}

      {lead?.mobilePhone && (
        <a href={`sms:${lead.mobilePhone}`} className="no-underline">
          <Button size="sm" variant="outline" className="gap-2">
            <MessageCircle className="w-3 h-3" />
            Text
          </Button>
        </a>
      )}

      {lead?.email && (
        <a href={`mailto:${lead.email}`} className="no-underline">
          <Button size="sm" variant="outline" className="gap-2">
            <Mail className="w-3 h-3" />
            Email
          </Button>
        </a>
      )}

      {lead?.serviceAddress && (
        <Button size="sm" variant="outline" className="gap-2" onClick={handleCopyAddress}>
          <Copy className="w-3 h-3" />
          Copy Address
        </Button>
      )}

      {lead?.serviceAddress && (
        <Button size="sm" variant="outline" className="gap-2" onClick={handleOpenMaps}>
          <MapPin className="w-3 h-3" />
          Open Maps
        </Button>
      )}
    </div>
  );
}