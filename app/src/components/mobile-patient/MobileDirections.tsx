'use client';

/**
 * Mobile Directions Component (US-268)
 *
 * Shows clinic location with multiple map app options.
 */

import React from 'react';
import {
  MapPin,
  Phone,
  Navigation,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Location {
  id: string;
  name: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zipCode: string;
  };
  phone: string;
}

interface DirectionsUrls {
  googleMaps: string;
  appleMaps: string;
  waze: string;
  geoUri: string;
}

interface MobileDirectionsProps {
  location: Location;
  directions: DirectionsUrls;
  estimatedDistance?: string | null;
  estimatedDuration?: string | null;
  onClose: () => void;
}

export function MobileDirections({
  location,
  directions,
  estimatedDistance,
  estimatedDuration,
  onClose,
}: MobileDirectionsProps) {
  const fullAddress = `${location.address.line1}${location.address.line2 ? ', ' + location.address.line2 : ''}, ${location.address.city}, ${location.address.state} ${location.address.zipCode}`;

  const handleCallClinic = () => {
    window.location.href = `tel:${location.phone}`;
  };

  const handleOpenMap = (url: string) => {
    window.open(url, '_blank');
  };

  // Detect platform for default app suggestion
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Directions</h1>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Location Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#053e67]" />
              {location.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{fullAddress}</p>

            {/* Estimates if available */}
            {(estimatedDistance || estimatedDuration) && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4">
                <div className="flex justify-around text-center">
                  {estimatedDistance && (
                    <div>
                      <div className="text-lg font-semibold text-[#053e67]">
                        {estimatedDistance}
                      </div>
                      <div className="text-xs text-gray-500">Distance</div>
                    </div>
                  )}
                  {estimatedDuration && (
                    <div>
                      <div className="text-lg font-semibold text-[#053e67]">
                        {estimatedDuration}
                      </div>
                      <div className="text-xs text-gray-500">Drive time</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Call Button */}
            <Button
              variant="outline"
              className="w-full mb-2"
              onClick={handleCallClinic}
            >
              <Phone className="w-4 h-4 mr-2" />
              Call {location.phone}
            </Button>
          </CardContent>
        </Card>

        {/* Map App Options */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open in Maps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Google Maps - Universal */}
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => handleOpenMap(directions.googleMaps)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Google Maps</div>
                  <div className="text-xs text-gray-500">
                    {isAndroid ? 'Recommended' : 'Works on all devices'}
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </Button>

            {/* Apple Maps - iOS */}
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => handleOpenMap(directions.appleMaps)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Apple Maps</div>
                  <div className="text-xs text-gray-500">
                    {isIOS ? 'Recommended for iPhone' : 'Best on iOS devices'}
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </Button>

            {/* Waze */}
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => handleOpenMap(directions.waze)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-cyan-600" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Waze</div>
                  <div className="text-xs text-gray-500">Real-time traffic</div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </Button>
          </CardContent>
        </Card>

        {/* Address Copy Section */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900 mb-1">Address</div>
                <div className="text-sm text-gray-600">{fullAddress}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(fullAddress);
                }}
              >
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">Parking Tips</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Free parking available in the building lot</li>
            <li>• Accessible parking spots near the entrance</li>
            <li>• Please arrive 10-15 minutes early for your first visit</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
