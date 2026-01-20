'use client';

/**
 * Kiosk Mode
 * Epic 04: Digital Intake System
 * US-042: Kiosk mode for in-office form completion
 */

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import {
  UserSearch,
  Calendar,
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  Lock,
  Maximize,
  ArrowRight,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Session timeout in milliseconds (5 minutes of inactivity)
const SESSION_TIMEOUT = 5 * 60 * 1000;
// Warning before timeout (30 seconds)
const TIMEOUT_WARNING = 30 * 1000;
// Default kiosk PIN
const DEFAULT_PIN = '1234';

interface PatientResult {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

interface PendingForm {
  id: string;
  template: {
    id: string;
    name: string;
    description?: string | null;
  };
  status: string;
  accessToken: string;
  createdAt: Date;
}

type KioskStep = 'search' | 'results' | 'forms' | 'filling' | 'complete';

function KioskContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get organization ID from URL param or default
  const organizationId = searchParams.get('org') || '';

  const [step, setStep] = useState<KioskStep>('search');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Search state
  const [searchFirstName, setSearchFirstName] = useState('');
  const [searchLastName, setSearchLastName] = useState('');
  const [searchDob, setSearchDob] = useState('');
  const [searchError, setSearchError] = useState('');

  // Patient state
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
  const [patientResults, setPatientResults] = useState<PatientResult[]>([]);

  // Form state
  const [pendingForms, setPendingForms] = useState<PendingForm[]>([]);
  const [currentFormToken, setCurrentFormToken] = useState<string | null>(null);

  // Session/security state
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [exitPin, setExitPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeoutRemaining, setTimeoutRemaining] = useState(TIMEOUT_WARNING / 1000);

  // Refs for timeout tracking
  const lastActivityRef = useRef(Date.now());
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  // tRPC mutations/queries
  const searchPatients = trpc.kiosk.searchPatients.useMutation({
    onSuccess: (data) => {
      setPatientResults(data);
      setStep('results');
    },
    onError: (error) => {
      setSearchError(error.message);
    },
  });

  const getPendingForms = trpc.kiosk.getPendingForms.useQuery(
    { patientId: selectedPatient?.id || '', organizationId },
    { enabled: !!selectedPatient?.id && !!organizationId }
  );

  // Reset activity timer
  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowTimeoutWarning(false);

    // Clear existing timers
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Set warning timer
    warningTimerRef.current = setTimeout(() => {
      setShowTimeoutWarning(true);
      setTimeoutRemaining(TIMEOUT_WARNING / 1000);

      // Countdown
      const countdown = setInterval(() => {
        setTimeoutRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Set final timeout
      timeoutTimerRef.current = setTimeout(() => {
        clearInterval(countdown);
        handleSessionTimeout();
      }, TIMEOUT_WARNING);
    }, SESSION_TIMEOUT - TIMEOUT_WARNING);
  }, []);

  // Handle session timeout
  const handleSessionTimeout = useCallback(() => {
    setShowTimeoutWarning(false);
    resetKiosk();
  }, []);

  // Reset kiosk to initial state
  const resetKiosk = () => {
    setStep('search');
    setSearchFirstName('');
    setSearchLastName('');
    setSearchDob('');
    setSearchError('');
    setSelectedPatient(null);
    setPatientResults([]);
    setPendingForms([]);
    setCurrentFormToken(null);
    setShowExitDialog(false);
    setExitPin('');
    setPinError('');
  };

  // Track user activity
  useEffect(() => {
    const handleActivity = () => {
      resetActivityTimer();
    };

    // Listen for user activity
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);

    // Initial timer setup
    resetActivityTimer();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);

      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [resetActivityTimer]);

  // Update pending forms when query completes
  useEffect(() => {
    if (getPendingForms.data) {
      setPendingForms(getPendingForms.data as PendingForm[]);
    }
  }, [getPendingForms.data]);

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle patient search
  const handleSearch = () => {
    setSearchError('');

    if (!organizationId) {
      setSearchError('Kiosk not configured. Please contact staff.');
      return;
    }

    if (!searchLastName.trim()) {
      setSearchError('Please enter a last name');
      return;
    }

    searchPatients.mutate({
      organizationId,
      firstName: searchFirstName.trim() || undefined,
      lastName: searchLastName.trim(),
      dateOfBirth: searchDob || undefined,
    });
  };

  // Handle patient selection
  const handleSelectPatient = (patient: PatientResult) => {
    setSelectedPatient(patient);
    setStep('forms');
  };

  // Handle form start
  const handleStartForm = (form: PendingForm) => {
    setCurrentFormToken(form.accessToken);
    setStep('filling');
  };

  // Handle form complete (called via message from iframe)
  const handleFormComplete = useCallback(() => {
    setStep('complete');
    // Auto-reset after 5 seconds
    setTimeout(() => {
      resetKiosk();
    }, 5000);
  }, []);

  // Listen for form completion messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FORM_SUBMITTED') {
        handleFormComplete();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleFormComplete]);

  // Handle exit with PIN
  const handleExitSubmit = () => {
    if (exitPin === DEFAULT_PIN) {
      setShowExitDialog(false);
      router.push('/login');
    } else {
      setPinError('Incorrect PIN');
      setExitPin('');
    }
  };

  // Show config error if no org ID
  if (!organizationId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 text-white flex items-center justify-center p-4">
        <Card className="bg-white/10 backdrop-blur-sm border-white/20 max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-amber-400 mb-4" />
            <CardTitle className="text-2xl text-white">Kiosk Not Configured</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-white/70">
              This kiosk needs to be configured with an organization ID.
            </p>
            <p className="text-white/50 text-sm">
              Please contact your administrator to set up the kiosk URL with the <code className="bg-white/10 px-2 py-1 rounded">?org=YOUR_ORG_ID</code> parameter.
            </p>
            <Button
              onClick={() => router.push('/login')}
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 text-white">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Patient Check-In</h1>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="text-white hover:bg-white/10"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              <Maximize className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowExitDialog(true)}
              className="text-white hover:bg-white/10"
              title="Exit kiosk"
            >
              <Lock className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Search Step */}
        {step === 'search' && (
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="text-center pb-8">
              <div className="mx-auto w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4">
                <UserSearch className="h-10 w-10 text-white" />
              </div>
              <CardTitle className="text-3xl text-white">Welcome!</CardTitle>
              <CardDescription className="text-xl text-white/70">
                Please enter your information to find your records
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="firstName" className="text-lg text-white">First Name</Label>
                  <Input
                    id="firstName"
                    value={searchFirstName}
                    onChange={(e) => setSearchFirstName(e.target.value)}
                    placeholder="Enter first name"
                    className="h-14 text-lg bg-white/10 border-white/30 text-white placeholder:text-white/50"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="lastName" className="text-lg text-white">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={searchLastName}
                    onChange={(e) => setSearchLastName(e.target.value)}
                    placeholder="Enter last name"
                    className="h-14 text-lg bg-white/10 border-white/30 text-white placeholder:text-white/50"
                    required
                  />
                </div>
              </div>
              <div className="space-y-3">
                <Label htmlFor="dob" className="text-lg text-white">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={searchDob}
                  onChange={(e) => setSearchDob(e.target.value)}
                  className="h-14 text-lg bg-white/10 border-white/30 text-white [color-scheme:dark]"
                />
              </div>

              {searchError && (
                <Alert variant="destructive" className="bg-red-500/20 border-red-500/50">
                  <AlertCircle className="h-5 w-5" />
                  <AlertDescription className="text-white">{searchError}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSearch}
                disabled={searchPatients.isPending}
                className="w-full h-16 text-xl bg-white text-blue-900 hover:bg-white/90"
              >
                {searchPatients.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                ) : (
                  <UserSearch className="h-6 w-6 mr-2" />
                )}
                Find My Records
              </Button>

              <div className="text-center pt-4">
                <p className="text-white/60 text-sm">
                  Don&apos;t have a record? Please speak with the front desk.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Step */}
        {step === 'results' && (
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader>
              <CardTitle className="text-2xl text-white">Select Your Name</CardTitle>
              <CardDescription className="text-white/70">
                Found {patientResults.length} matching record(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {patientResults.length === 0 ? (
                <div className="text-center py-8">
                  <XCircle className="h-12 w-12 mx-auto text-white/50 mb-4" />
                  <p className="text-white/70 text-lg">No matching records found.</p>
                  <p className="text-white/50 mt-2">Please check your information or speak with the front desk.</p>
                  <Button
                    onClick={() => setStep('search')}
                    variant="outline"
                    className="mt-6 border-white/30 text-white hover:bg-white/10"
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                <>
                  {patientResults.map((patient) => (
                    <button
                      key={patient.id}
                      onClick={() => handleSelectPatient(patient)}
                      className="w-full p-6 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 transition-colors text-left flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xl font-semibold text-white">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="text-white/60 mt-1">
                          <Calendar className="h-4 w-4 inline mr-1" />
                          Born: {new Date(patient.dateOfBirth).toLocaleDateString()}
                        </p>
                      </div>
                      <ArrowRight className="h-6 w-6 text-white/50" />
                    </button>
                  ))}
                  <Button
                    onClick={() => setStep('search')}
                    variant="ghost"
                    className="w-full mt-4 text-white/70 hover:text-white hover:bg-white/10"
                  >
                    ← Back to Search
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Forms Step */}
        {step === 'forms' && selectedPatient && (
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader>
              <CardTitle className="text-2xl text-white">
                Welcome, {selectedPatient.firstName}!
              </CardTitle>
              <CardDescription className="text-white/70">
                Please complete the following forms
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {getPendingForms.isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-white" />
                  <p className="text-white/70 mt-4">Loading your forms...</p>
                </div>
              ) : pendingForms.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-4" />
                  <p className="text-white text-lg">All forms completed!</p>
                  <p className="text-white/70 mt-2">Please have a seat. We&apos;ll call you shortly.</p>
                  <Button
                    onClick={resetKiosk}
                    className="mt-6 bg-white text-blue-900 hover:bg-white/90"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  {pendingForms.map((form) => (
                    <button
                      key={form.id}
                      onClick={() => handleStartForm(form)}
                      className="w-full p-6 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 transition-colors text-left flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                          <FileText className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-semibold text-white">
                            {form.template.name}
                          </p>
                          {form.template.description && (
                            <p className="text-white/60 mt-1">{form.template.description}</p>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-6 w-6 text-white/50" />
                    </button>
                  ))}
                  <Button
                    onClick={() => setStep('results')}
                    variant="ghost"
                    className="w-full mt-4 text-white/70 hover:text-white hover:bg-white/10"
                  >
                    ← Not Me
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Form Filling Step - Embedded form */}
        {step === 'filling' && currentFormToken && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
            <iframe
              src={`/forms/${currentFormToken}?kiosk=true`}
              className="w-full h-full border-0"
              title="Patient Form"
            />
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="text-center py-16">
              <div className="mx-auto w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="h-14 w-14 text-green-400" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Thank You!</h2>
              <p className="text-xl text-white/70">
                Your form has been submitted successfully.
              </p>
              <p className="text-white/50 mt-4">
                Please have a seat. We&apos;ll call you shortly.
              </p>
              <p className="text-white/40 mt-8 text-sm">
                This screen will reset automatically...
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Timeout Warning Dialog */}
      <Dialog open={showTimeoutWarning} onOpenChange={setShowTimeoutWarning}>
        <DialogContent className="bg-orange-900 border-orange-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Clock className="h-6 w-6" />
              Session Timeout
            </DialogTitle>
            <DialogDescription className="text-white/70 text-lg">
              Your session will end in {timeoutRemaining} seconds due to inactivity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => resetActivityTimer()}
              className="w-full h-14 text-lg bg-white text-orange-900 hover:bg-white/90"
            >
              Continue Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exit PIN Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Enter PIN to Exit
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Staff PIN required to exit kiosk mode
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              type="password"
              value={exitPin}
              onChange={(e) => {
                setExitPin(e.target.value);
                setPinError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleExitSubmit()}
              placeholder="Enter PIN"
              className="h-14 text-2xl text-center tracking-widest bg-slate-700 border-slate-600"
              maxLength={4}
              autoFocus
            />
            {pinError && (
              <p className="text-red-400 text-center">{pinError}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowExitDialog(false);
                setExitPin('');
                setPinError('');
              }}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExitSubmit}
              disabled={exitPin.length !== 4}
              className="bg-white text-slate-900 hover:bg-white/90"
            >
              Exit Kiosk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-white/50 text-sm">
          <p>Touch anywhere to begin</p>
          <p>Your information is secure and confidential</p>
        </div>
      </footer>
    </div>
  );
}

// Loading fallback
function KioskLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 text-white flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-white" />
        <p className="mt-4 text-white/70 text-xl">Loading Kiosk...</p>
      </div>
    </div>
  );
}

export default function KioskPage() {
  return (
    <Suspense fallback={<KioskLoading />}>
      <KioskContent />
    </Suspense>
  );
}
