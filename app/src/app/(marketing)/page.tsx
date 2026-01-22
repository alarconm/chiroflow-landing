import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Brain,
  Shield,
  Zap,
  Calendar,
  FileText,
  DollarSign,
  Users,
  BarChart3,
  MessageSquare,
  Star,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#053e67]/5 via-white to-stone-50" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#053e67]/10 to-transparent" />

        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#053e67]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-stone-200/30 rounded-full blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 lg:py-40">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#053e67]/10 text-[#053e67] text-sm font-medium mb-6">
                <Zap className="w-4 h-4" />
                Central Oregon Chiropractic Portal
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-stone-900 tracking-tight leading-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#053e67] to-[#053e67]/80">
                  Gets You Back
                </span>{' '}
                to Living
              </h1>

              <p className="mt-6 text-lg sm:text-xl text-stone-600 leading-relaxed">
                Welcome to Central Oregon Chiropractic&apos;s practice management portal.
                AI-powered scheduling, documentation, and billing automation designed
                specifically for our Redmond, OR practice.
              </p>

              {/* CTA Buttons */}
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Link href="/login">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-[#053e67] hover:bg-[#053e67]/90 text-white shadow-lg shadow-[#053e67]/25 text-base px-8 py-6"
                  >
                    Staff Login
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/portal">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto border-[#053e67]/30 text-[#053e67] hover:bg-[#053e67]/5 text-base px-8 py-6"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    Patient Portal
                  </Button>
                </Link>
              </div>

              {/* Trust badges */}
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-stone-600">HIPAA Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-stone-600">Secure & Private</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#053e67]" />
                  <span className="text-sm text-stone-600">Mon-Thu 9-6, Fri 9-12</span>
                </div>
              </div>
            </div>

            {/* Right content - Dashboard preview */}
            <div className="relative lg:ml-8">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-stone-900/10 border border-stone-200 bg-white">
                <div className="bg-stone-100 px-4 py-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-[#053e67]" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="p-4 bg-gradient-to-br from-stone-50 to-white">
                  <div className="space-y-4">
                    {/* Mock dashboard header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#053e67] flex items-center justify-center">
                          <span className="text-white font-bold text-xs">COC</span>
                        </div>
                        <span className="font-semibold text-stone-900">Dashboard</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-8 h-8 rounded-lg bg-stone-100" />
                        <div className="w-8 h-8 rounded-lg bg-stone-100" />
                      </div>
                    </div>

                    {/* Mock stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl p-3 border border-stone-200">
                        <div className="text-2xl font-bold text-stone-900">18</div>
                        <div className="text-xs text-stone-500">Today&apos;s Patients</div>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-stone-200">
                        <div className="text-2xl font-bold text-green-600">$8.2k</div>
                        <div className="text-xs text-stone-500">Revenue</div>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-stone-200">
                        <div className="text-2xl font-bold text-[#053e67]">96%</div>
                        <div className="text-xs text-stone-500">Show Rate</div>
                      </div>
                    </div>

                    {/* Mock schedule */}
                    <div className="bg-white rounded-xl p-3 border border-stone-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-stone-900">Today&apos;s Schedule</span>
                        <span className="text-xs text-[#053e67]">View All</span>
                      </div>
                      <div className="space-y-2">
                        {[
                          { time: '9:00 AM', name: 'Tom Becker', type: 'Auto Accident' },
                          { time: '9:30 AM', name: 'Lisa Hansen', type: 'New Patient' },
                          { time: '10:00 AM', name: 'Mike Torres', type: 'Decompression' },
                        ].map((apt, i) => (
                          <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-stone-50">
                            <span className="text-xs text-stone-500 w-16">{apt.time}</span>
                            <span className="text-sm text-stone-900">{apt.name}</span>
                            <span className="ml-auto text-xs px-2 py-1 rounded-full bg-[#053e67]/10 text-[#053e67]">
                              {apt.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating AI card */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-xl shadow-stone-900/10 border border-stone-200 p-4 max-w-xs">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-900">AI Assistant</p>
                    <p className="text-xs text-stone-500 mt-1">
                      &quot;I&apos;ve drafted SOAP notes for your last 3 patients. Ready for review.&quot;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="border-y border-stone-200 bg-stone-50 py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="text-center text-sm text-stone-500 mb-8">
            Comprehensive chiropractic care in Redmond, Oregon
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4">
            {['Auto Accidents', 'Spinal Decompression', 'Pregnancy Care', 'Sports Injuries', 'Pediatric', 'Workers Comp'].map(
              (name) => (
                <div
                  key={name}
                  className="text-base font-medium text-[#053e67] px-4 py-2 bg-white rounded-full border border-[#053e67]/20"
                >
                  {name}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Features Overview */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900">
              Everything Dr. Rookstool needs to run the practice
            </h2>
            <p className="mt-4 text-lg text-stone-600">
              Purpose-built for chiropractic workflows at Central Oregon Chiropractic,
              with AI automation that saves hours every day.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Brain,
                title: 'AI Documentation',
                description:
                  'Automatically generate SOAP notes from voice recordings. Our AI understands chiropractic terminology and creates compliant documentation in seconds.',
                color: 'purple',
              },
              {
                icon: Calendar,
                title: 'Smart Scheduling',
                description:
                  'AI-powered scheduling that learns patient preferences, optimizes provider time, and automatically fills cancellations.',
                color: 'blue',
              },
              {
                icon: DollarSign,
                title: 'Billing & Claims',
                description:
                  'Automated claim submission with real-time eligibility verification. Reduce denials and get paid faster.',
                color: 'green',
              },
              {
                icon: FileText,
                title: 'EHR & Documentation',
                description:
                  'Chiropractic-specific templates for intake forms, progress notes, and treatment plans. Fully customizable to your workflow.',
                color: 'amber',
              },
              {
                icon: Users,
                title: 'Patient Portal',
                description:
                  'Let patients book appointments, complete intake forms, view treatment plans, and pay bills online 24/7.',
                color: 'pink',
              },
              {
                icon: BarChart3,
                title: 'Analytics & Reporting',
                description:
                  'Real-time insights into practice performance, patient trends, and financial health with actionable recommendations.',
                color: 'indigo',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group relative bg-white rounded-2xl border border-stone-200 p-8 hover:shadow-lg hover:border-stone-300 transition-all duration-300"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${
                    feature.color === 'purple'
                      ? 'bg-purple-100 text-purple-600'
                      : feature.color === 'blue'
                      ? 'bg-[#053e67]/10 text-[#053e67]'
                      : feature.color === 'green'
                      ? 'bg-green-100 text-green-600'
                      : feature.color === 'amber'
                      ? 'bg-[#c90000]/10 text-[#c90000]'
                      : feature.color === 'pink'
                      ? 'bg-pink-100 text-pink-600'
                      : 'bg-indigo-100 text-indigo-600'
                  }`}
                >
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-stone-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-stone-600">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link href="/features">
              <Button
                variant="outline"
                size="lg"
                className="border-stone-300 text-stone-700"
              >
                View All Features
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* AI Highlight Section */}
      <section className="py-24 sm:py-32 bg-gradient-to-br from-[#053e67] to-[#053e67]/90 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white text-sm font-medium mb-6">
                <Brain className="w-4 h-4" />
                Powered by Advanced AI
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                Your AI-powered back office assistant
              </h2>
              <p className="text-lg text-white/80 mb-8">
                Our AI handles the tedious tasks so Dr. Rookstool and Dr. Jeffrey can focus on what
                matters most - getting patients back to living. From documentation to scheduling to
                billing, AI works 24/7 to keep Central Oregon Chiropractic running smoothly.
              </p>

              <div className="space-y-4">
                {[
                  'Generate SOAP notes from voice recordings in seconds',
                  'Auto-fill treatment plans for auto accident & decompression patients',
                  'Predict and prevent scheduling conflicts',
                  'Streamline workers comp and insurance billing',
                  'Answer patient questions via portal 24/7',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-white/80 flex-shrink-0 mt-0.5" />
                    <span className="text-white/80">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-white/10 rounded-2xl border border-white/20 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-[#053e67]" />
                  </div>
                  <div>
                    <p className="font-medium text-white">COC AI Assistant</p>
                    <p className="text-xs text-white/60">Intelligent practice support</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-white/80" />
                    </div>
                    <div className="bg-white/20 rounded-2xl rounded-tl-none px-4 py-3 max-w-sm">
                      <p className="text-sm text-white/90">
                        Just finished with Tom Becker. Auto accident follow-up,
                        decompression therapy. Good progress on L4-L5.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <div className="bg-white rounded-2xl rounded-tr-none px-4 py-3 max-w-sm">
                      <p className="text-sm text-[#053e67]">
                        Got it, Dr. Rookstool! I&apos;ve drafted the SOAP note for Tom:
                      </p>
                      <div className="mt-3 bg-[#053e67]/10 rounded-lg p-3 text-xs text-[#053e67]">
                        <p><strong>S:</strong> Patient reports 40% improvement since MVA...</p>
                        <p className="mt-1"><strong>O:</strong> Spinal decompression performed, L4-L5...</p>
                        <p className="mt-1 text-[#053e67]/70">Click to review full note</p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                      <Brain className="w-4 h-4 text-[#053e67]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About the Practice */}
      <section className="py-24 sm:py-32 bg-stone-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900">
              About Central Oregon Chiropractic
            </h2>
            <p className="mt-4 text-lg text-stone-600">
              Serving Central Oregon since 1995 from our Redmond location.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: 'Dr. Kent Rookstool',
                title: 'Founder & Lead Chiropractor',
                description: 'Specializing in auto accident recovery and spinal decompression therapy',
                features: ['Auto Accident Care', 'Spinal Decompression', 'Sports Injuries', 'Pediatric Care'],
                popular: true,
              },
              {
                name: 'Dr. Jeffrey',
                title: 'Associate Chiropractor',
                description: 'Expert in pregnancy care, sports chiropractic, and family wellness',
                features: ['Pregnancy Care', 'Sports Chiropractic', 'Family Wellness', 'Workers Comp'],
              },
              {
                name: 'Location & Hours',
                title: 'Redmond, Oregon',
                description: '1020 SW Indian Ave, Ste 100, Redmond, OR 97756',
                features: ['Mon-Thu: 9AM - 6PM', 'Fri: 9AM - 12PM', 'Phone: (541) 923-6024', 'Walk-ins Welcome'],
              },
            ].map((item) => (
              <div
                key={item.name}
                className={`relative rounded-2xl p-8 ${
                  item.popular
                    ? 'bg-[#053e67] text-white ring-4 ring-[#053e67] ring-offset-4'
                    : 'bg-white border border-stone-200'
                }`}
              >
                {item.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#c90000] rounded-full text-xs font-medium text-white">
                    Primary Provider
                  </div>
                )}
                <h3
                  className={`text-xl font-semibold ${
                    item.popular ? 'text-white' : 'text-stone-900'
                  }`}
                >
                  {item.name}
                </h3>
                <div className="mt-2">
                  <span
                    className={`text-sm font-medium ${
                      item.popular ? 'text-white/80' : 'text-[#053e67]'
                    }`}
                  >
                    {item.title}
                  </span>
                </div>
                <p
                  className={`mt-4 text-sm ${
                    item.popular ? 'text-white/80' : 'text-stone-500'
                  }`}
                >
                  {item.description}
                </p>
                <ul className="mt-6 space-y-3">
                  {item.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-5 h-5 ${
                          item.popular ? 'text-white/80' : 'text-[#053e67]'
                        }`}
                      />
                      <span className={item.popular ? 'text-white' : 'text-stone-600'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <a href="https://www.centraloregonchiropractic.com/" target="_blank" rel="noopener noreferrer" className="text-[#053e67] hover:text-[#053e67]/80 font-medium">
              Visit our website for more information
              <ArrowRight className="inline w-4 h-4 ml-1" />
            </a>
          </div>
        </div>
      </section>

      {/* Patient Testimonials */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900">
              What our patients are saying
            </h2>
            <p className="mt-4 text-lg text-stone-600">
              Real stories from the Central Oregon Chiropractic community
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote:
                  "After my car accident, Dr. Rookstool got me back on my feet. The spinal decompression therapy made such a difference. I'm finally pain-free!",
                name: 'Tom B.',
                title: 'Auto Accident Recovery',
                image: '/testimonials/tom.jpg',
              },
              {
                quote:
                  'The prenatal care at Central Oregon Chiropractic helped me through both my pregnancies. Dr. Jeffrey is so gentle and knowledgeable.',
                name: 'Sarah H.',
                title: 'Pregnancy Care',
                image: '/testimonials/sarah.jpg',
              },
              {
                quote:
                  'As a local athlete, having a chiropractor who understands sports injuries is invaluable. The whole team is fantastic!',
                name: 'Mike T.',
                title: 'Sports Chiropractic',
                image: '/testimonials/mike.jpg',
              },
            ].map((testimonial) => (
              <div
                key={testimonial.name}
                className="bg-white rounded-2xl border border-stone-200 p-8"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-5 h-5 fill-[#053e67] text-[#053e67]"
                    />
                  ))}
                </div>
                <p className="text-stone-600 mb-6">&quot;{testimonial.quote}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#053e67]/10 flex items-center justify-center">
                    <span className="text-lg font-semibold text-[#053e67]">
                      {testimonial.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-stone-900">{testimonial.name}</p>
                    <p className="text-sm text-[#053e67]">{testimonial.title}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 sm:py-32 bg-gradient-to-br from-[#053e67] to-[#053e67]/90">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to get back to living?
          </h2>
          <p className="text-xl text-white/80 max-w-2xl mx-auto mb-10">
            Schedule your appointment at Central Oregon Chiropractic today.
            We&apos;re here to help you feel your best.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="tel:5419236024">
              <Button
                size="lg"
                className="bg-white text-[#053e67] hover:bg-white/90 shadow-lg text-base px-8 py-6"
              >
                Call (541) 923-6024
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </a>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 text-base px-8 py-6"
              >
                Staff Portal
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/70">
            1020 SW Indian Ave, Ste 100 · Redmond, OR 97756
          </p>
        </div>
      </section>
    </div>
  );
}
