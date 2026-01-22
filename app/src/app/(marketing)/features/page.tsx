import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Brain,
  Calendar,
  FileText,
  DollarSign,
  Users,
  BarChart3,
  Mic,
  Wand2,
  Clock,
  RefreshCw,
  Mail,
  MessageSquare,
  CreditCard,
  FileCheck,
  Shield,
  Lock,
  Server,
  ClipboardCheck,
  Activity,
  Stethoscope,
  TrendingUp,
  PieChart,
  Target,
  Smartphone,
  Globe,
  Upload,
  Download,
  Settings,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const featureCategories = [
  {
    id: 'ehr',
    title: 'EHR & Documentation',
    description: 'Purpose-built electronic health records for chiropractic practices',
    icon: FileText,
    color: 'amber',
    features: [
      {
        title: 'Chiropractic-Specific Templates',
        description:
          'Pre-built templates for SOAP notes, intake forms, progress notes, and treatment plans designed specifically for chiropractic workflows.',
        icon: ClipboardCheck,
      },
      {
        title: 'Interactive Body Diagrams',
        description:
          'Click-to-document pain locations, adjustments, and findings on anatomically accurate body diagrams.',
        icon: Activity,
      },
      {
        title: 'ICD-10/CPT Integration',
        description:
          'Built-in code lookup with chiropractic-specific favorites. Automatic code suggestions based on documentation.',
        icon: Stethoscope,
      },
      {
        title: 'Treatment Plan Builder',
        description:
          'Create comprehensive treatment plans with goals, frequency, and expected outcomes. Track progress automatically.',
        icon: Target,
      },
      {
        title: 'Document Management',
        description:
          'Store and organize X-rays, referral letters, insurance documents, and more. All searchable and accessible.',
        icon: Upload,
      },
      {
        title: 'Custom Form Builder',
        description:
          'Create custom intake forms, consent forms, and questionnaires. Collect digital signatures.',
        icon: Settings,
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI Assistant',
    description: 'Intelligent automation that saves hours every day',
    icon: Brain,
    color: 'purple',
    features: [
      {
        title: 'Voice-to-SOAP Notes',
        description:
          'Dictate your findings and let AI generate complete, compliant SOAP notes. Understands chiropractic terminology.',
        icon: Mic,
      },
      {
        title: 'Smart Auto-Complete',
        description:
          'AI predicts what you want to document based on context and history. Type less, document more.',
        icon: Wand2,
      },
      {
        title: 'Treatment Plan Suggestions',
        description:
          'Get evidence-based treatment plan recommendations based on diagnosis, patient history, and outcomes data.',
        icon: Target,
      },
      {
        title: 'Coding Assistant',
        description:
          'AI suggests appropriate ICD-10 and CPT codes based on your documentation, reducing coding errors.',
        icon: FileCheck,
      },
      {
        title: 'Patient Communication AI',
        description:
          'Draft appointment reminders, follow-up messages, and educational content automatically.',
        icon: MessageSquare,
      },
      {
        title: 'Insights & Recommendations',
        description:
          'Get AI-powered insights on practice performance, patient trends, and growth opportunities.',
        icon: TrendingUp,
      },
    ],
  },
  {
    id: 'scheduling',
    title: 'Scheduling & Appointments',
    description: 'Smart scheduling that maximizes your time and patient satisfaction',
    icon: Calendar,
    color: 'blue',
    features: [
      {
        title: 'Online Booking',
        description:
          'Let patients book appointments 24/7 from your website or patient portal. Syncs instantly with your schedule.',
        icon: Globe,
      },
      {
        title: 'Smart Scheduling',
        description:
          'AI optimizes appointment slots based on visit type, provider availability, and patient preferences.',
        icon: Zap,
      },
      {
        title: 'Automated Reminders',
        description:
          'Reduce no-shows with automated email and SMS reminders. Customizable timing and messaging.',
        icon: Clock,
      },
      {
        title: 'Waitlist Management',
        description:
          'Automatically fill cancellations from your waitlist. Patients get notified of openings.',
        icon: RefreshCw,
      },
      {
        title: 'Multi-Provider Scheduling',
        description:
          'Manage schedules for multiple providers across locations. Prevent double-booking.',
        icon: Users,
      },
      {
        title: 'Recurring Appointments',
        description:
          'Set up recurring visits for treatment plans. Patients see their full schedule upfront.',
        icon: Calendar,
      },
    ],
  },
  {
    id: 'billing',
    title: 'Billing & Claims',
    description: 'Streamlined revenue cycle management to get paid faster',
    icon: DollarSign,
    color: 'green',
    features: [
      {
        title: 'Automated Claim Submission',
        description:
          'Submit claims electronically to all major payers. Real-time status tracking and error alerts.',
        icon: Upload,
      },
      {
        title: 'Eligibility Verification',
        description:
          'Verify patient insurance eligibility in real-time before appointments. Reduce claim denials.',
        icon: Shield,
      },
      {
        title: 'Superbill Generation',
        description:
          'Auto-generate superbills from encounter documentation. Review and submit with one click.',
        icon: FileCheck,
      },
      {
        title: 'Payment Processing',
        description:
          'Accept credit cards, HSA/FSA, and online payments. Automatic payment posting.',
        icon: CreditCard,
      },
      {
        title: 'Patient Statements',
        description:
          'Automated patient billing with online payment links. Customizable statement templates.',
        icon: Mail,
      },
      {
        title: 'Denial Management',
        description:
          'Track and manage claim denials. AI identifies patterns and suggests corrections.',
        icon: RefreshCw,
      },
    ],
  },
  {
    id: 'portal',
    title: 'Patient Portal',
    description: 'Empower patients with 24/7 access to their care',
    icon: Users,
    color: 'pink',
    features: [
      {
        title: 'Online Scheduling',
        description:
          'Patients can book, reschedule, or cancel appointments anytime from any device.',
        icon: Calendar,
      },
      {
        title: 'Digital Intake Forms',
        description:
          'Patients complete paperwork before their visit. Data flows directly into their chart.',
        icon: ClipboardCheck,
      },
      {
        title: 'Treatment Plan Tracking',
        description:
          'Patients view their treatment plan, track progress, and see upcoming appointments.',
        icon: Activity,
      },
      {
        title: 'Secure Messaging',
        description:
          'HIPAA-compliant messaging between patients and providers. Keeps communication organized.',
        icon: MessageSquare,
      },
      {
        title: 'Online Bill Pay',
        description:
          'Patients view statements and pay bills online. Automatic payment reminders.',
        icon: CreditCard,
      },
      {
        title: 'Document Access',
        description:
          'Patients access their records, download documents, and request records transfers.',
        icon: Download,
      },
    ],
  },
  {
    id: 'reporting',
    title: 'Reporting & Analytics',
    description: 'Data-driven insights to grow your practice',
    icon: BarChart3,
    color: 'indigo',
    features: [
      {
        title: 'Real-Time Dashboard',
        description:
          'At-a-glance view of daily schedule, revenue, and key metrics. Customizable widgets.',
        icon: Activity,
      },
      {
        title: 'Financial Reports',
        description:
          'Revenue, collections, aging, and profitability reports. Export to Excel or PDF.',
        icon: DollarSign,
      },
      {
        title: 'Patient Analytics',
        description:
          'Track patient retention, visit patterns, referral sources, and satisfaction scores.',
        icon: Users,
      },
      {
        title: 'Provider Productivity',
        description:
          'Compare provider metrics, identify opportunities, and optimize scheduling.',
        icon: TrendingUp,
      },
      {
        title: 'Marketing ROI',
        description:
          'Track which marketing channels drive new patients. Measure campaign effectiveness.',
        icon: Target,
      },
      {
        title: 'Custom Reports',
        description:
          'Build custom reports with drag-and-drop. Schedule automated report delivery.',
        icon: PieChart,
      },
    ],
  },
];

const securityFeatures = [
  {
    icon: Shield,
    title: 'HIPAA Compliant',
    description: 'Full compliance with HIPAA privacy and security requirements.',
  },
  {
    icon: Lock,
    title: 'Data Encryption',
    description: 'AES-256 encryption for data at rest and in transit.',
  },
  {
    icon: Server,
    title: 'SOC 2 Type II',
    description: 'Independently audited security controls.',
  },
  {
    icon: RefreshCw,
    title: 'Automatic Backups',
    description: 'Continuous backups with 99.99% uptime guarantee.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-stone-900 to-stone-800 text-white">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Features built for{' '}
              <span className="text-blue-400">modern chiropractic</span>
            </h1>
            <p className="mt-6 text-xl text-stone-300">
              Everything you need to run your practice efficiently, from intelligent
              documentation to seamless billing. Purpose-built for chiropractors.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-[#053e67] hover:bg-[#053e67] text-white shadow-lg"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-stone-600 text-white hover:bg-stone-800"
                >
                  View Pricing
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Navigation */}
      <section className="sticky top-[73px] z-40 bg-white border-b border-stone-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex overflow-x-auto py-4 gap-2 no-scrollbar">
            {featureCategories.map((category) => (
              <a
                key={category.id}
                href={`#${category.id}`}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium whitespace-nowrap transition-colors"
              >
                <category.icon className="w-4 h-4" />
                {category.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Categories */}
      {featureCategories.map((category, categoryIndex) => (
        <section
          key={category.id}
          id={category.id}
          className={`py-24 ${categoryIndex % 2 === 1 ? 'bg-stone-50' : 'bg-white'}`}
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            {/* Category Header */}
            <div className="flex items-start gap-6 mb-16">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  category.color === 'amber'
                    ? 'bg-blue-100 text-[#053e67]'
                    : category.color === 'purple'
                    ? 'bg-purple-100 text-purple-600'
                    : category.color === 'blue'
                    ? 'bg-blue-100 text-[#053e67]'
                    : category.color === 'green'
                    ? 'bg-green-100 text-green-600'
                    : category.color === 'pink'
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                <category.icon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-stone-900">{category.title}</h2>
                <p className="mt-2 text-lg text-stone-600">{category.description}</p>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {category.features.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-white rounded-xl border border-stone-200 p-6 hover:shadow-lg hover:border-stone-300 transition-all duration-300"
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                      category.color === 'amber'
                        ? 'bg-blue-100 text-[#053e67]'
                        : category.color === 'purple'
                        ? 'bg-purple-100 text-purple-600'
                        : category.color === 'blue'
                        ? 'bg-blue-100 text-[#053e67]'
                        : category.color === 'green'
                        ? 'bg-green-100 text-green-600'
                        : category.color === 'pink'
                        ? 'bg-pink-100 text-pink-600'
                        : 'bg-indigo-100 text-indigo-600'
                    }`}
                  >
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-stone-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-stone-600 text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Security Section */}
      <section className="py-24 bg-stone-900 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold">Enterprise-grade security</h2>
            <p className="mt-4 text-lg text-stone-400">
              Your patient data deserves the highest level of protection. ChiroFlow
              is built with security and compliance at its core.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {securityFeatures.map((feature) => (
              <div key={feature.title} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#053e67]/20 flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-7 h-7 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-stone-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Teaser */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-stone-900 mb-6">
                Integrates with your favorite tools
              </h2>
              <p className="text-lg text-stone-600 mb-8">
                ChiroFlow connects seamlessly with the tools you already use.
                From payment processors to marketing platforms, we&apos;ve got you covered.
              </p>
              <div className="space-y-4">
                {[
                  'Stripe, Square, and major payment processors',
                  'Google Calendar and Outlook sync',
                  'Clearinghouses for claims submission',
                  'Mailchimp and email marketing platforms',
                  'Zapier for custom integrations',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <span className="text-stone-600">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl bg-stone-100 flex items-center justify-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-stone-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App Teaser */}
      <section className="py-24 bg-stone-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="relative mx-auto w-64">
                <div className="bg-stone-900 rounded-[3rem] p-2 shadow-2xl">
                  <div className="bg-white rounded-[2.5rem] p-4 aspect-[9/19]">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#053e67] flex items-center justify-center">
                          <span className="text-white text-xs font-bold">CF</span>
                        </div>
                        <span className="text-sm font-medium">ChiroFlow</span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-20 rounded-lg bg-stone-100" />
                        <div className="h-16 rounded-lg bg-stone-100" />
                        <div className="h-16 rounded-lg bg-stone-100" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium mb-6">
                <Smartphone className="w-4 h-4" />
                Mobile App
              </div>
              <h2 className="text-3xl font-bold text-stone-900 mb-6">
                Manage your practice from anywhere
              </h2>
              <p className="text-lg text-stone-600 mb-8">
                Access your schedule, patient records, and practice metrics from
                your phone or tablet. Available for iOS and Android.
              </p>
              <div className="space-y-4">
                {[
                  'View and manage your daily schedule',
                  'Access patient charts on the go',
                  'Receive real-time notifications',
                  'Approve billing and claims',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <span className="text-stone-600">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-[#053e67]/80 to-[#053e67]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to see ChiroFlow in action?
          </h2>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10">
            Start your free 14-day trial today. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-white text-[#053e67] hover:bg-blue-50 shadow-lg"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
              >
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
