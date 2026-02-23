import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, ArrowRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function AccessSetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: lead } = useQuery({
    queryKey: ['myLead', user?.email],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user
  });

  const [accessData, setAccessData] = useState({
    accessRestrictions: '',
    gateCode: '',
    gateCodeProvisionMethod: 'n/a',
    hasPets: false,
    petsEnterPoolArea: false,
    petsSwimInPool: false,
    petsCanBeSecured: false,
    specialInstructions: ''
  });

  const saveAccessMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Lead.update(lead.id, accessData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myLead'] });
      navigate(createPageUrl('PaymentSetup'));
    }
  });

  const handleContinue = () => {
    saveAccessMutation.mutate();
  };

  if (!user || !lead) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="w-6 h-6 text-teal-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Access & Safety Information
        </h1>
        <p className="text-gray-600">
          Help our technicians access your pool safely and efficiently
        </p>
      </div>

      <div className="space-y-6">
        {/* Access Restrictions */}
        <Card>
          <CardHeader>
            <CardTitle>Property Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Are there any access restrictions?</Label>
              <Select 
                value={accessData.accessRestrictions} 
                onValueChange={(v) => setAccessData({ ...accessData, accessRestrictions: v })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select access type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No restrictions</SelectItem>
                  <SelectItem value="locked_gate">Locked gate</SelectItem>
                  <SelectItem value="code_required">Access code required</SelectItem>
                  <SelectItem value="hoa">HOA/Community</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {accessData.accessRestrictions === 'code_required' && (
              <div>
                <Label>Gate/Access Code</Label>
                <Input
                  type="text"
                  value={accessData.gateCode}
                  onChange={(e) => setAccessData({ ...accessData, gateCode: e.target.value, gateCodeProvisionMethod: 'entered' })}
                  placeholder="Enter access code"
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">Stored securely and encrypted</p>
              </div>
            )}

            <div>
              <Label>Special Access Instructions (Optional)</Label>
              <Textarea
                value={accessData.specialInstructions}
                onChange={(e) => setAccessData({ ...accessData, specialInstructions: e.target.value })}
                placeholder="E.g., Use side gate, park in driveway, call when arrived, etc."
                className="mt-2"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pet Safety */}
        <Card>
          <CardHeader>
            <CardTitle>Pet Safety</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="has-pets"
                checked={accessData.hasPets}
                onCheckedChange={(checked) => setAccessData({ ...accessData, hasPets: checked })}
              />
              <Label htmlFor="has-pets" className="cursor-pointer font-normal">
                Pets are on the property
              </Label>
            </div>

            {accessData.hasPets && (
              <div className="ml-6 space-y-3 border-l-2 border-gray-200 pl-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="pets-enter"
                    checked={accessData.petsEnterPoolArea}
                    onCheckedChange={(checked) => setAccessData({ ...accessData, petsEnterPoolArea: checked })}
                  />
                  <Label htmlFor="pets-enter" className="cursor-pointer font-normal text-sm">
                    Pets enter the pool area
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="pets-swim"
                    checked={accessData.petsSwimInPool}
                    onCheckedChange={(checked) => setAccessData({ ...accessData, petsSwimInPool: checked })}
                  />
                  <Label htmlFor="pets-swim" className="cursor-pointer font-normal text-sm">
                    Pets swim in the pool
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="pets-secured"
                    checked={accessData.petsCanBeSecured}
                    onCheckedChange={(checked) => setAccessData({ ...accessData, petsCanBeSecured: checked })}
                  />
                  <Label htmlFor="pets-secured" className="cursor-pointer font-normal text-sm">
                    Pets can be secured during service
                  </Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Continue Button */}
        <Card className="bg-gradient-to-r from-teal-600 to-blue-600 text-white border-0">
          <CardContent className="pt-6">
            <Button
              onClick={handleContinue}
              disabled={!accessData.accessRestrictions || saveAccessMutation.isPending}
              className="w-full bg-white text-teal-600 hover:bg-gray-100 text-lg h-14"
            >
              {saveAccessMutation.isPending ? 'Saving...' : (
                <>
                  Continue to Payment Setup
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}