import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCustomerPageGuard } from '@/components/auth/useCustomerPageGuard';
import EquipmentCard from '../components/customer/EquipmentCard';

const EQUIPMENT_ORDER = ['pump', 'filter', 'heater', 'solar_heater', 'salt_cell', 'automation', 'other'];

export default function CustomerEquipment() {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  useCustomerPageGuard(user, userLoading);

  const { data: lead } = useQuery({
    queryKey: ['customerLead'],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user,
  });

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['customerEquipment', lead?.id],
    queryFn: () => base44.entities.PoolEquipment.filter({ leadId: lead.id, isActive: true }),
    enabled: !!lead,
  });

  const sorted = [...equipment].sort((a, b) =>
    EQUIPMENT_ORDER.indexOf(a.equipmentType) - EQUIPMENT_ORDER.indexOf(b.equipmentType)
  );

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to={createPageUrl('ClientHome')}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Your Equipment</h1>
          <p className="text-xs text-gray-500">Pool equipment installed at your property</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-4 border-teal-500 border-t-transparent rounded-full" />
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Equipment details haven't been added yet. Check back after your first service visit.
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(item => (
          <EquipmentCard key={item.id} equipment={item} />
        ))}
      </div>
    </div>
  );
}