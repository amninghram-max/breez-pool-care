import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, AlertCircle, Info, Plus, ArrowRight, Settings } from 'lucide-react';

const ColorSwatch = ({ label, hex, description }) => (
  <div className="space-y-2">
    <div className="rounded-lg overflow-hidden shadow-sm border border-gray-200">
      <div 
        className="h-24 w-full" 
        style={{ backgroundColor: hex }}
      />
    </div>
    <div>
      <p className="font-semibold text-gray-900 text-sm">{label}</p>
      <p className="text-xs text-gray-500">{hex}</p>
      <p className="text-xs text-gray-600 mt-1">{description}</p>
    </div>
  </div>
);

export default function DesignSystem() {
  return (
    <div className="space-y-12 py-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gray-900">Breez Design System</h1>
        <p className="text-lg text-gray-600">Visual identity, components, and guidelines</p>
      </div>

      {/* COLOR PALETTE */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Color Palette</h2>
          <p className="text-gray-600">Clean, water-inspired, calming palette</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ColorSwatch 
            label="Primary Teal"
            hex="#1B9B9F"
            description="Buttons, highlights, headers, active states"
          />
          <ColorSwatch 
            label="Secondary Sky"
            hex="#5DADE2"
            description="Cards, secondary surfaces, subtle backgrounds"
          />
          <ColorSwatch 
            label="Accent Coral"
            hex="#FF9999"
            description="Notifications, key actions, emphasis (use sparingly)"
          />
          <ColorSwatch 
            label="White"
            hex="#FFFFFF"
            description="Main backgrounds, card backgrounds"
          />
          <ColorSwatch 
            label="Off-White"
            hex="#F9FAFB"
            description="Secondary backgrounds, subtle contrast"
          />
          <ColorSwatch 
            label="Light Gray"
            hex="#E5E7EB"
            description="Dividers, borders, inactive states"
          />
          <ColorSwatch 
            label="Medium Gray"
            hex="#D1D5DB"
            description="Secondary borders, structure"
          />
          <ColorSwatch 
            label="Dark Gray"
            hex="#6B7280"
            description="Secondary text, labels"
          />
          <ColorSwatch 
            label="Text Gray"
            hex="#1F2937"
            description="Primary text, headlines"
          />
        </div>
      </section>

      {/* TYPOGRAPHY */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Typography</h2>
          <p className="text-gray-600">Clean, modern, highly legible</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Headline Large</p>
                <p className="text-4xl font-bold text-gray-900">Welcome to Breez</p>
                <p className="text-sm text-gray-600 mt-2">Montserrat Bold / 36px / Line-height 1.2</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Headline Medium</p>
                <p className="text-2xl font-semibold text-gray-900">Manage your pool care</p>
                <p className="text-sm text-gray-600 mt-2">Montserrat SemiBold / 24px / Line-height 1.3</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Headline Small</p>
                <p className="text-lg font-semibold text-gray-900">Pool Status Overview</p>
                <p className="text-sm text-gray-600 mt-2">Montserrat SemiBold / 18px / Line-height 1.4</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Body Text</p>
                <p className="text-base text-gray-700">Keep your pool clean and balanced with Breez. Get real-time insights, expert recommendations, and peace of mind.</p>
                <p className="text-sm text-gray-600 mt-2">Montserrat Regular / 16px / Line-height 1.6</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Label / Small Text</p>
                <p className="text-sm font-medium text-gray-600">Enter your pool information</p>
                <p className="text-sm text-gray-600 mt-2">Montserrat Medium / 14px / Line-height 1.5</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Caption</p>
                <p className="text-xs text-gray-500">Last updated 2 hours ago</p>
                <p className="text-sm text-gray-600 mt-2">Montserrat Regular / 12px / Line-height 1.5</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* BUTTONS */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Buttons</h2>
          <p className="text-gray-600">Soft rounded, clear contrast, subtle elevation</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Primary Action</p>
              <div className="flex gap-3">
                <Button className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Service
                </Button>
                <Button className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg" disabled>
                  Disabled
                </Button>
              </div>
            </div>

            <div className="border-t pt-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Secondary Action</p>
              <div className="flex gap-3">
                <Button variant="outline" className="border-gray-300 text-gray-700 rounded-lg">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
                <Button variant="outline" className="border-gray-300 text-gray-700 rounded-lg" disabled>
                  Disabled
                </Button>
              </div>
            </div>

            <div className="border-t pt-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Ghost / Tertiary</p>
              <div className="flex gap-3">
                <Button variant="ghost" className="text-teal-600 hover:bg-teal-50 rounded-lg">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Learn More
                </Button>
              </div>
            </div>

            <div className="border-t pt-6">
              <p className="text-sm font-medium text-gray-700 mb-3">With Icon Only</p>
              <div className="flex gap-3">
                <Button size="icon" className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg">
                  <Plus className="w-5 h-5" />
                </Button>
                <Button size="icon" variant="outline" className="border-gray-300 text-gray-700 rounded-lg">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="border-t pt-6 bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">Button Guidelines</p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Rounded corners: 8px base, 10px for large buttons</li>
                <li>Padding: 12px 16px (medium), 14px 24px (large)</li>
                <li>Soft shadow on hover: 0 4px 12px rgba(0,0,0,0.08)</li>
                <li>Transition: 200ms ease for all states</li>
                <li>Always maintain 44px+ tap target on mobile</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* CARDS */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Cards & Panels</h2>
          <p className="text-gray-600">Floating, soft shadows, rounded corners</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Status Card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Pool Health</span>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold text-gray-900">Balanced</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-teal-600 h-2 rounded-full" style={{ width: '85%' }} />
              </div>
              <p className="text-xs text-gray-500">Last checked 2 hours ago</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-sky-50 to-blue-50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Highlighted Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-blue-900">Use for featured content, recommendations, or gentle alerts.</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-coral-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-coral-500" />
                Alert Card
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700">Action needed on your pool chemical balance.</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Disabled/Inactive State</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">Lower contrast for disabled content</p>
            </CardContent>
          </Card>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <p className="text-sm text-blue-900 font-medium mb-2">Card Guidelines</p>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Rounded corners: 12px</li>
            <li>Padding: 16px (or 24px for larger cards)</li>
            <li>Shadow: 0 1px 3px rgba(0,0,0,0.08) base, 0 4px 12px on hover</li>
            <li>Border: Optional light gray (#E5E7EB) for structure</li>
            <li>Spacing between cards: 16px</li>
          </ul>
        </div>
      </section>

      {/* FORM INPUTS */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Form Inputs</h2>
          <p className="text-gray-600">Clean, spacious, accessible</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <div>
              <label className="text-sm font-medium text-gray-700">Text Input</label>
              <Input 
                type="text" 
                placeholder="Enter pool address" 
                className="mt-2 rounded-lg border-gray-300"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Number Input</label>
              <Input 
                type="number" 
                placeholder="Enter pool size" 
                className="mt-2 rounded-lg border-gray-300"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Disabled Input</label>
              <Input 
                type="text" 
                value="Read-only value"
                disabled
                className="mt-2 rounded-lg bg-gray-50"
              />
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-900 font-medium mb-2">Input Guidelines</p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Rounded corners: 8px</li>
                <li>Padding: 12px 16px</li>
                <li>Border: 1px solid #D1D5DB</li>
                <li>Focus: Teal border (#1B9B9F) + soft shadow</li>
                <li>Height: 44px minimum for mobile touch</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ICONS */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Icons</h2>
          <p className="text-gray-600">Minimal line style, consistent weight</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
                <p className="text-xs text-gray-600 text-center">Success</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <AlertCircle className="w-8 h-8 text-coral-500" />
                <p className="text-xs text-gray-600 text-center">Alert</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Info className="w-8 h-8 text-blue-500" />
                <p className="text-xs text-gray-600 text-center">Info</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Plus className="w-8 h-8 text-teal-600" />
                <p className="text-xs text-gray-600 text-center">Add</p>
              </div>
            </div>

            <div className="border-t mt-6 pt-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Icon Style Rules</p>
              <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
                <li>Source: Lucide React (minimal, clean line style)</li>
                <li>Stroke weight: 2px (consistent)</li>
                <li>Sizes: 16px (small), 20px (medium), 24px (large), 32px (hero)</li>
                <li>Color: Match context (teal for primary, gray for neutral)</li>
                <li>Spacing around icons: 8px minimum</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SPACING & LAYOUT */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Spacing & Layout</h2>
          <p className="text-gray-600">Airy, breathable, generous white space</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Spacing Scale</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-8 bg-teal-600 rounded" />
                    <span className="text-sm text-gray-600">8px (xs) - Small gaps</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-8 bg-teal-600 rounded" />
                    <span className="text-sm text-gray-600">12px (sm) - Small padding</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-4 h-8 bg-teal-600 rounded" />
                    <span className="text-sm text-gray-600">16px (md) - Standard padding/gap</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-6 h-8 bg-teal-600 rounded" />
                    <span className="text-sm text-gray-600">24px (lg) - Large spacing</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-teal-600 rounded" />
                    <span className="text-sm text-gray-600">32px (xl) - Extra large spacing</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Layout Principles</p>
                <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
                  <li>Max width: 1200px for desktop</li>
                  <li>Padding: 16px (mobile), 24px (tablet), 32px (desktop)</li>
                  <li>Column gap: 16px</li>
                  <li>Section spacing: 32-48px</li>
                  <li>Safe area padding on mobile: 16px</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SHADOWS & ELEVATION */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Shadows & Elevation</h2>
          <p className="text-gray-600">Soft, subtle, purposeful depth</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Subtle</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">0 1px 3px rgba(0,0,0,0.08)</p>
              <p className="text-xs text-gray-500 mt-2">Default state for cards</p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-sm">Medium</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">0 4px 12px rgba(0,0,0,0.08)</p>
              <p className="text-xs text-gray-500 mt-2">Hover/active cards</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm">Large</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">0 10px 25px rgba(0,0,0,0.1)</p>
              <p className="text-xs text-gray-500 mt-2">Modals, floats, overlays</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SAMPLE SCREENS */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Sample Screen Layouts</h2>
          <p className="text-gray-600">Full-screen design mockups showing the system in context</p>
        </div>

        {/* Dashboard Screen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dashboard — Calm Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6 space-y-6 border-2 border-dashed border-gray-300">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-600">Header</p>
                <div className="h-12 bg-white rounded-lg border border-gray-200 flex items-center px-4">
                  <p className="text-gray-400">Breez Logo + User Avatar</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="h-28 bg-white rounded-lg border border-gray-200 p-4 flex flex-col justify-between">
                  <p className="text-xs font-medium text-gray-600">Pool Health</p>
                  <p className="text-2xl font-bold text-gray-900">92%</p>
                </div>
                <div className="h-28 bg-white rounded-lg border border-gray-200 p-4 flex flex-col justify-between">
                  <p className="text-xs font-medium text-gray-600">Next Service</p>
                  <p className="text-sm font-semibold text-gray-900">Thu, 2 days</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Recent Activity</p>
                <div className="space-y-2">
                  <div className="h-12 bg-white rounded-lg border border-gray-200" />
                  <div className="h-12 bg-white rounded-lg border border-gray-200" />
                  <div className="h-12 bg-white rounded-lg border border-gray-200" />
                </div>
              </div>

              <div className="pt-4">
                <div className="h-10 bg-teal-600 rounded-lg" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pool Status Screen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pool Status — Data Clarity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6 space-y-6 border-2 border-dashed border-gray-300">
              <div className="h-40 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                <p className="text-gray-400">Water Chemistry Graph</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="h-20 bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                  <p className="text-xs text-gray-500">pH Level</p>
                  <p className="text-xl font-bold text-gray-900">7.2</p>
                </div>
                <div className="h-20 bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                  <p className="text-xs text-gray-500">Chlorine</p>
                  <p className="text-xl font-bold text-emerald-600">2.8</p>
                </div>
              </div>

              <div className="h-10 bg-teal-600 rounded-lg" />
            </div>
          </CardContent>
        </Card>

        {/* Photos Screen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Photos — Satisfaction & Transformation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6 space-y-6 border-2 border-dashed border-gray-300">
              <div className="h-48 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                <p className="text-gray-400">Large Before/After Image</p>
              </div>

              <div className="flex gap-4">
                <div className="flex-1 h-24 bg-white rounded-lg border border-gray-200" />
                <div className="flex-1 h-24 bg-white rounded-lg border border-gray-200" />
                <div className="flex-1 h-24 bg-white rounded-lg border border-gray-200" />
              </div>

              <div className="h-10 bg-teal-600 rounded-lg" />
            </div>
          </CardContent>
        </Card>

        {/* Payments Screen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payments — Secure & Trustworthy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6 space-y-6 border-2 border-dashed border-gray-300">
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Due Amount</p>
                <p className="text-4xl font-bold text-gray-900">$299.00</p>
              </div>

              <div className="h-20 bg-white rounded-lg border border-gray-200 p-4 flex items-center">
                <p className="text-sm text-gray-600">•••• 4242 (Expires 12/26)</p>
              </div>

              <div className="space-y-2">
                <div className="h-12 bg-white rounded-lg border border-gray-200" />
                <div className="h-12 bg-white rounded-lg border border-gray-200" />
              </div>

              <div className="h-10 bg-teal-600 rounded-lg" />
            </div>
          </CardContent>
        </Card>

        {/* Messaging Screen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Messaging — Friendly & Effortless</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6 space-y-4 border-2 border-dashed border-gray-300 h-80 flex flex-col">
              <div className="flex justify-start">
                <div className="max-w-xs h-10 bg-white rounded-2xl border border-gray-200" />
              </div>
              
              <div className="flex justify-end">
                <div className="max-w-xs h-10 bg-teal-600 rounded-2xl" />
              </div>

              <div className="flex justify-start">
                <div className="max-w-xs h-10 bg-white rounded-2xl border border-gray-200" />
              </div>

              <div className="flex justify-end">
                <div className="max-w-xs h-10 bg-teal-600 rounded-2xl" />
              </div>

              <div className="flex-1" />

              <div className="h-10 bg-white rounded-lg border border-gray-200" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* DESIGN PRINCIPLES */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Core Design Principles</h2>
          <p className="text-gray-600">Guiding values for every design decision</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">🧘 Calm & Control</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Users should feel in control and peaceful. Avoid aggressive colors or jarring animations. Prioritize clarity over flashiness.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">✨ Polished & Premium</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">High-quality details matter. Consistent spacing, smooth transitions, and thoughtful typography signal professionalism and trustworthiness.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">🌊 Water-Inspired Aesthetic</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Soft blues, teals, and flowing shapes. Never cartoonish or tropical clichéd. Modern, coastal, clean.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">🎯 Clarity First</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Information should be scannable and easy to understand. Generous white space. Hierarchy clear and obvious.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">🚀 Effortless Interaction</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Every interaction should feel smooth and natural. Animations should be subtle and purposeful. Mobile-first design.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">💎 Accessible to All</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Sufficient contrast, readable fonts, touch-friendly targets. Inclusive design builds trust.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="border-t pt-8 mt-12">
        <p className="text-sm text-gray-500 text-center">
          Breez Design System v1.0 — Last updated Feb 2026
        </p>
      </div>
    </div>
  );
}