import Link from 'next/link';
import {
  ArrowRight,
  Heart,
  Target,
  Users,
  Lightbulb,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Twitter,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const values = [
  {
    icon: Heart,
    title: 'Patient-First',
    description:
      'Everything we build starts with a simple question: will this help chiropractors deliver better patient care? If not, we dont build it.',
  },
  {
    icon: Lightbulb,
    title: 'Innovation',
    description:
      'We leverage cutting-edge AI and technology to solve real problems, not to add bells and whistles. Every feature earns its place.',
  },
  {
    icon: Users,
    title: 'Partnership',
    description:
      'We see ourselves as an extension of your team. Your success is our success, and were here to support you every step of the way.',
  },
  {
    icon: Target,
    title: 'Simplicity',
    description:
      'Chiropractic software has been overcomplicated for too long. We believe in intuitive design that gets out of your way.',
  },
];

const team = [
  {
    name: 'Dr. Sarah Chen',
    role: 'Co-Founder & CEO',
    bio: 'Former chiropractor with 15 years of practice experience. Built ChiroFlow to solve the problems she faced every day.',
    image: null,
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'Michael Rodriguez',
    role: 'Co-Founder & CTO',
    bio: 'Former tech lead at a major healthcare company. Passionate about bringing modern software to healthcare.',
    image: null,
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'Dr. James Park',
    role: 'Head of Product',
    bio: 'Practicing chiropractor and product designer. Ensures every feature works the way chiropractors actually work.',
    image: null,
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'Amanda Foster',
    role: 'Head of Customer Success',
    bio: '10+ years in healthcare software implementation. Leads our team of onboarding specialists and support staff.',
    image: null,
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'David Kim',
    role: 'Head of AI',
    bio: 'PhD in Machine Learning from Stanford. Leading our AI initiatives to make documentation effortless.',
    image: null,
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'Rachel Thompson',
    role: 'Head of Compliance',
    bio: 'Former compliance officer at a major health system. Ensures ChiroFlow meets the highest security and privacy standards.',
    image: null,
    linkedin: '#',
    twitter: '#',
  },
];

const milestones = [
  {
    year: '2020',
    title: 'The Beginning',
    description:
      'Dr. Sarah Chen, frustrated with existing EHR options, teams up with Michael Rodriguez to build something better.',
  },
  {
    year: '2021',
    title: 'First Launch',
    description:
      'ChiroFlow launches with 10 beta practices. Early feedback shapes the product into what it is today.',
  },
  {
    year: '2022',
    title: 'AI Integration',
    description:
      'We introduce AI-powered documentation, becoming the first chiropractic EHR with voice-to-SOAP notes.',
  },
  {
    year: '2023',
    title: 'Rapid Growth',
    description:
      'ChiroFlow reaches 1,000 practices. We raise Series A funding to accelerate development.',
  },
  {
    year: '2024',
    title: 'National Expansion',
    description:
      'Now serving practices in all 50 states with a team of 50+ dedicated employees.',
  },
  {
    year: '2025',
    title: 'The Future',
    description:
      'Continuing to innovate with advanced AI features, expanded integrations, and international expansion.',
  },
];

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-stone-900 to-stone-800 text-white">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Built by chiropractors,{' '}
              <span className="text-blue-400">for chiropractors</span>
            </h1>
            <p className="mt-6 text-xl text-stone-300">
              We started ChiroFlow because we were tired of software that didnt
              understand chiropractic. Our mission is simple: help chiropractors
              focus on patients, not paperwork.
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-stone-900 mb-6">Our Story</h2>
              <div className="space-y-4 text-stone-600">
                <p>
                  ChiroFlow was born out of frustration. Our co-founder, Dr. Sarah Chen,
                  spent 15 years running a successful chiropractic practice. But every
                  day, she found herself staying late to finish documentation, wrestling
                  with clunky software, and wishing there was a better way.
                </p>
                <p>
                  When she met Michael Rodriguez, a software engineer who had just
                  left a major healthcare company, they realized they shared a vision:
                  what if there was an EHR designed specifically for chiropractors,
                  built with modern technology, and powered by AI?
                </p>
                <p>
                  They started building ChiroFlow in 2020, working closely with a small
                  group of chiropractors who shared their frustration. Every feature was
                  designed based on real feedback from real practitioners.
                </p>
                <p>
                  Today, ChiroFlow serves thousands of practices across the country.
                  But we havent forgotten our roots. Were still a team of people who
                  are passionate about making chiropractors lives easier - one feature
                  at a time.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="bg-stone-100 rounded-2xl aspect-video flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-[#053e67] flex items-center justify-center mx-auto mb-4">
                    <span className="text-white font-bold text-3xl">CF</span>
                  </div>
                  <p className="text-stone-500">Company video coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-24 bg-[#053e67] text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Our Mission</h2>
          <p className="text-2xl sm:text-3xl font-light text-blue-100 max-w-4xl mx-auto">
            &quot;To empower chiropractors with intelligent technology that handles
            the back office, so they can focus on what they do best - helping
            patients live healthier lives.&quot;
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 bg-stone-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-stone-900">Our Values</h2>
            <p className="mt-4 text-lg text-stone-600">
              These principles guide everything we do, from product design to
              customer support.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value) => (
              <div key={value.title} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                  <value.icon className="w-7 h-7 text-[#053e67]" />
                </div>
                <h3 className="text-xl font-semibold text-stone-900 mb-2">
                  {value.title}
                </h3>
                <p className="text-stone-600">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-stone-900">Our Journey</h2>
            <p className="mt-4 text-lg text-stone-600">
              From a small idea to serving thousands of practices nationwide.
            </p>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 lg:left-1/2 top-0 bottom-0 w-px bg-stone-200 transform lg:-translate-x-1/2" />

            <div className="space-y-12">
              {milestones.map((milestone, index) => (
                <div
                  key={milestone.year}
                  className={`relative flex items-start gap-8 ${
                    index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
                  }`}
                >
                  {/* Timeline dot */}
                  <div className="absolute left-8 lg:left-1/2 w-4 h-4 rounded-full bg-[#053e67] transform -translate-x-1/2 mt-1.5 z-10" />

                  {/* Content */}
                  <div
                    className={`ml-16 lg:ml-0 lg:w-1/2 ${
                      index % 2 === 0 ? 'lg:pr-16 lg:text-right' : 'lg:pl-16'
                    }`}
                  >
                    <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium mb-2">
                      {milestone.year}
                    </span>
                    <h3 className="text-xl font-semibold text-stone-900 mb-2">
                      {milestone.title}
                    </h3>
                    <p className="text-stone-600">{milestone.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-24 bg-stone-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-stone-900">Meet the Team</h2>
            <p className="mt-4 text-lg text-stone-600">
              Were a diverse team of healthcare professionals, engineers, and
              designers united by a common goal.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {team.map((member) => (
              <div
                key={member.name}
                className="bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="w-20 h-20 rounded-2xl bg-stone-200 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-stone-400">
                    {member.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-stone-900">
                  {member.name}
                </h3>
                <p className="text-[#053e67] text-sm mb-3">{member.role}</p>
                <p className="text-stone-600 text-sm mb-4">{member.bio}</p>
                <div className="flex gap-2">
                  <a
                    href={member.linkedin}
                    className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                  >
                    <Linkedin className="w-4 h-4" />
                  </a>
                  <a
                    href={member.twitter}
                    className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                  >
                    <Twitter className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-stone-600 mb-4">
              Want to join our team? Were always looking for talented people.
            </p>
            <Link href="#careers">
              <Button variant="outline" className="border-stone-300">
                View Open Positions
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 bg-stone-900 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              { number: '5,000+', label: 'Practices Served' },
              { number: '2M+', label: 'Patients Managed' },
              { number: '50+', label: 'Team Members' },
              { number: '99.9%', label: 'Uptime' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl font-bold text-blue-400 mb-2">
                  {stat.number}
                </div>
                <div className="text-stone-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-3xl font-bold text-stone-900 mb-6">Get in Touch</h2>
              <p className="text-lg text-stone-600 mb-8">
                Have questions? Wed love to hear from you. Reach out to our team
                and well get back to you as soon as possible.
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-6 h-6 text-[#053e67]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-900">Email</h3>
                    <p className="text-stone-600">hello@chiroflow.com</p>
                    <p className="text-stone-600">support@chiroflow.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-6 h-6 text-[#053e67]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-900">Phone</h3>
                    <p className="text-stone-600">1-800-CHIROFLOW</p>
                    <p className="text-stone-500 text-sm">Mon-Fri 9am-6pm ET</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-6 h-6 text-[#053e67]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-900">Office</h3>
                    <p className="text-stone-600">123 Healthcare Ave, Suite 400</p>
                    <p className="text-stone-600">San Francisco, CA 94102</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-stone-50 rounded-2xl p-8">
              <h3 className="text-xl font-semibold text-stone-900 mb-6">
                Send us a message
              </h3>
              <form className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:border-[#053e67] focus:ring-2 focus:ring-[#053e67]/20 outline-none transition-colors"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:border-[#053e67] focus:ring-2 focus:ring-[#053e67]/20 outline-none transition-colors"
                      placeholder="Smith"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:border-[#053e67] focus:ring-2 focus:ring-[#053e67]/20 outline-none transition-colors"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Practice Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:border-[#053e67] focus:ring-2 focus:ring-[#053e67]/20 outline-none transition-colors"
                    placeholder="Smith Chiropractic"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Message
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:border-[#053e67] focus:ring-2 focus:ring-[#053e67]/20 outline-none transition-colors resize-none"
                    placeholder="How can we help?"
                  />
                </div>
                <Button className="w-full bg-[#053e67] hover:bg-[#053e67] text-white">
                  Send Message
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-[#053e67]/80 to-[#053e67]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to join the ChiroFlow family?
          </h2>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10">
            Start your free trial today and see why thousands of chiropractors
            trust ChiroFlow.
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
            <Link href="/features">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
              >
                Explore Features
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
