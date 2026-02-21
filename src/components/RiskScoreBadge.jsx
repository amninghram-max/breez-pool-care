import React from 'react';
import { AlertCircle, TrendingUp, CheckCircle } from 'lucide-react';

export default function RiskScoreBadge({ riskScore, riskLevel }) {
  const getRiskConfig = () => {
    if (riskScore < 34) {
      return {
        level: 'Low',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        bgColor: 'bg-emerald-50',
        icon: CheckCircle,
        description: 'Low maintenance requirements'
      };
    } else if (riskScore < 67) {
      return {
        level: 'Medium',
        color: 'bg-amber-100 text-amber-800 border-amber-300',
        bgColor: 'bg-amber-50',
        icon: TrendingUp,
        description: 'Moderate maintenance needs'
      };
    } else {
      return {
        level: 'High',
        color: 'bg-red-100 text-red-800 border-red-300',
        bgColor: 'bg-red-50',
        icon: AlertCircle,
        description: 'Requires specialized care'
      };
    }
  };

  const config = getRiskConfig();
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border p-4 ${config.bgColor} border-current`}>
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6" />
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{riskScore}</span>
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${config.color}`}>
              {config.level}
            </span>
          </div>
          <p className="text-sm opacity-80 mt-1">{config.description}</p>
        </div>
      </div>
    </div>
  );
}