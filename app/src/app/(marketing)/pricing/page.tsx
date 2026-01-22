'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Starter',
    description: 'Perfect for solo practitioners just getting started',
    monthlyPrice: 199,
    yearlyPrice: 169,
    features: [
      { name: '1 Provider', included: true },
      { name: 'Up to 100 active patients', included: true },
      { name: 'Basic EHR & documentation', included: true },
      { name: 'Appointment scheduling', included: true },
      { name: 'Patient portal', included: true },
      { name: 'Email support', included: true },
      { name: 'AI documentation', included: false },
      { name: 'Billing & claims', included: false },
      { name: 'Custom integrations', included: false },
      { name: 'Priority support', included: false },
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Professional',
    description: 'For growing practices that need more power',
    monthlyPrice: 399,
    yearlyPrice: 339,
    features: [
      { name: 'Up to 5 providers', included: true },
      { name: 'Unlimited patients', included: true },
      { name: 'Full EHR & documentation', included: true },
      { name: 'Smart scheduling', included: true },
      { name: 'Patient portal with online booking', included: true },
      { name: 'Priority email & chat support', included: true },
      { name: 'AI documentation & SOAP notes', included: true },
      { name: 'Billing & claims management', included: true },
      { name: 'Basic integrations', included: true },
      { name: 'Analytics dashboard', included: true },
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    description: 'For multi-location practices with complex needs',
    monthlyPrice: null,
    yearlyPrice: null,
    features: [
      { name: 'Unlimited providers', included: true },
      { name: 'Unlimited patients', included: true },
      { name: 'Everything in Professional', included: true },
      { name: 'Multi-location support', included: true },
      { name: 'Custom workflows', included: true },
      { name: 'Dedicated success manager', included: true },
      { name: 'Advanced AI features', included: true },
      { name: 'Custom integrations', included: true },
      { name: 'API access', included: true },
      { name: '24/7 phone support', included: true },
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

const comparisonFeatures = [
  {
    category: 'Core Features',
    features: [
      { name: 'Patient records', starter: true, professional: true, enterprise: true },
      { name: 'Appointment scheduling', starter: true, professional: true, enterprise: true },
      { name: 'Patient portal', starter: true, professional: true, enterprise: true },
      { name: 'Document management', starter: 'Basic', professional: true, enterprise: true },
      { name: 'Treatment plans', starter: false, professional: true, enterprise: true },
    ],
  },
  {
    category: 'AI Features',
    features: [
      { name: 'Voice-to-SOAP notes', starter: false, professional: true, enterprise: true },
      { name: 'Smart auto-complete', starter: false, professional: true, enterprise: true },
      { name: 'Coding assistant', starter: false, professional: true, enterprise: true },
      { name: 'Treatment suggestions', starter: false, professional: 'Basic', enterprise: true },
      { name: 'Custom AI training', starter: false, professional: false, enterprise: true },
    ],
  },
  {
    category: 'Billing & Claims',
    features: [
      { name: 'Superbill generation', starter: false, professional: true, enterprise: true },
      { name: 'Claim submission', starter: false, professional: true, enterprise: true },
      { name: 'Eligibility verification', starter: false, professional: true, enterprise: true },
      { name: 'Payment processing', starter: false, professional: true, enterprise: true },
      { name: 'Denial management', starter: false, professional: 'Basic', enterprise: true },
    ],
  },
  {
    category: 'Reporting & Analytics',
    features: [
      { name: 'Basic reports', starter: true, professional: true, enterprise: true },
      { name: 'Financial dashboards', starter: false, professional: true, enterprise: true },
      { name: 'Patient analytics', starter: false, professional: true, enterprise: true },
      { name: 'Custom reports', starter: false, professional: false, enterprise: true },
      { name: 'API access', starter: false, professional: false, enterprise: true },
    ],
  },
  {
    category: 'Support & Services',
    features: [
      { name: 'Email support', starter: true, professional: true, enterprise: true },
      { name: 'Chat support', starter: false, professional: true, enterprise: true },
      { name: 'Phone support', starter: false, professional: false, enterprise: true },
      { name: 'Dedicated success manager', starter: false, professional: false, enterprise: true },
      { name: 'Custom training', starter: false, professional: false, enterprise: true },
    ],
  },
];

const faqs = [
  {
    question: 'Is there a free trial?',
    answer:
      'Yes! All plans come with a free 14-day trial. No credit card required to start. You can explore all features and see if ChiroFlow is right for your practice.',
  },
  {
    question: 'Can I change plans later?',
    answer:
      'Absolutely. You can upgrade or downgrade your plan at any time. If you upgrade, you\'ll be prorated for the remainder of your billing cycle. If you downgrade, the change takes effect at your next billing date.',
  },
  {
    question: 'What happens to my data if I cancel?',
    answer:
      'Your data is always yours. If you cancel, we\'ll keep your data available for 90 days so you can export everything. After that, we securely delete it in compliance with HIPAA requirements.',
  },
  {
    question: 'Is ChiroFlow HIPAA compliant?',
    answer:
      'Yes, ChiroFlow is fully HIPAA compliant. We sign Business Associate Agreements (BAAs) with all customers, use enterprise-grade encryption, and undergo regular security audits. We\'re also SOC 2 Type II certified.',
  },
  {
    question: 'Do you offer discounts for annual billing?',
    answer:
      'Yes! When you pay annually, you save about 15% compared to monthly billing. That\'s essentially getting 2 months free each year.',
  },
  {
    question: 'Can I use ChiroFlow on my phone or tablet?',
    answer:
      'Yes, ChiroFlow works great on all devices. We have native iOS and Android apps for on-the-go access, plus a fully responsive web app that works on any browser.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards (Visa, Mastercard, American Express, Discover) and ACH bank transfers for annual plans. For Enterprise plans, we can also accommodate invoicing.',
  },
  {
    question: 'How long does it take to get set up?',
    answer:
      'Most practices are up and running within a day. Our onboarding team will help you import your existing patient data, set up your templates, and train your staff. For Enterprise customers, we offer white-glove implementation.',
  },
];

function PricingCard({
  plan,
  isYearly,
}: {
  plan: (typeof plans)[0];
  isYearly: boolean;
}) {
  const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;

  return (
    <div
      className={cn(
        'relative rounded-2xl p-8',
        plan.popular
          ? 'bg-[#053e67] text-white ring-4 ring-[#053e67] ring-offset-4 shadow-xl'
          : 'bg-white border border-stone-200'
      )}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-800 rounded-full text-xs font-medium flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Most Popular
        </div>
      )}

      <h3
        className={cn(
          'text-xl font-semibold',
          plan.popular ? 'text-white' : 'text-stone-900'
        )}
      >
        {plan.name}
      </h3>
      <p
        className={cn(
          'mt-2 text-sm',
          plan.popular ? 'text-blue-100' : 'text-stone-500'
        )}
      >
        {plan.description}
      </p>

      <div className="mt-6">
        {price !== null ? (
          <>
            <span
              className={cn(
                'text-4xl font-bold',
                plan.popular ? 'text-white' : 'text-stone-900'
              )}
            >
              ${price}
            </span>
            <span className={plan.popular ? 'text-blue-100' : 'text-stone-500'}>
              /month
            </span>
            {isYearly && (
              <p
                className={cn(
                  'mt-1 text-sm',
                  plan.popular ? 'text-blue-200' : 'text-green-600'
                )}
              >
                Billed annually (save 15%)
              </p>
            )}
          </>
        ) : (
          <span
            className={cn(
              'text-4xl font-bold',
              plan.popular ? 'text-white' : 'text-stone-900'
            )}
          >
            Custom
          </span>
        )}
      </div>

      <ul className="mt-8 space-y-4">
        {plan.features.map((feature) => (
          <li key={feature.name} className="flex items-start gap-3">
            {feature.included ? (
              <Check
                className={cn(
                  'w-5 h-5 flex-shrink-0',
                  plan.popular ? 'text-blue-200' : 'text-green-600'
                )}
              />
            ) : (
              <X
                className={cn(
                  'w-5 h-5 flex-shrink-0',
                  plan.popular ? 'text-blue-300/50' : 'text-stone-300'
                )}
              />
            )}
            <span
              className={cn(
                'text-sm',
                feature.included
                  ? plan.popular
                    ? 'text-white'
                    : 'text-stone-700'
                  : plan.popular
                  ? 'text-blue-300/50'
                  : 'text-stone-400'
              )}
            >
              {feature.name}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.name === 'Enterprise' ? '#contact' : '/login'}
        className="block mt-8"
      >
        <Button
          className={cn(
            'w-full',
            plan.popular
              ? 'bg-white text-[#053e67] hover:bg-blue-50'
              : 'bg-stone-900 text-white hover:bg-stone-800'
          )}
        >
          {plan.cta}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </Link>
    </div>
  );
}

function FAQItem({ faq }: { faq: (typeof faqs)[0] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-stone-200">
      <button
        className="w-full flex items-center justify-between py-6 text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-lg font-medium text-stone-900">{faq.question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-stone-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-stone-500" />
        )}
      </button>
      {isOpen && (
        <div className="pb-6">
          <p className="text-stone-600">{faq.answer}</p>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(true);

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-stone-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="mt-6 text-xl text-stone-600 max-w-2xl mx-auto">
            Choose the plan that fits your practice. Start free, upgrade when you&apos;re
            ready. No hidden fees, no long-term contracts.
          </p>

          {/* Billing Toggle */}
          <div className="mt-10 flex items-center justify-center gap-4">
            <span
              className={cn(
                'text-sm font-medium',
                !isYearly ? 'text-stone-900' : 'text-stone-500'
              )}
            >
              Monthly
            </span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                isYearly ? 'bg-[#053e67]' : 'bg-stone-300'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  isYearly ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
            <span
              className={cn(
                'text-sm font-medium',
                isYearly ? 'text-stone-900' : 'text-stone-500'
              )}
            >
              Yearly
              <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Save 15%
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 -mt-8">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} isYearly={isYearly} />
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-stone-500">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-24 bg-stone-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-stone-900 text-center mb-12">
            Compare plans in detail
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-4 px-4 text-left text-sm font-medium text-stone-500">
                    Features
                  </th>
                  <th className="py-4 px-4 text-center text-sm font-medium text-stone-900">
                    Starter
                    <div className="text-xs text-stone-500 font-normal">$199/mo</div>
                  </th>
                  <th className="py-4 px-4 text-center text-sm font-medium text-[#053e67]">
                    Professional
                    <div className="text-xs text-[#053e67]/80 font-normal">$399/mo</div>
                  </th>
                  <th className="py-4 px-4 text-center text-sm font-medium text-stone-900">
                    Enterprise
                    <div className="text-xs text-stone-500 font-normal">Custom</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((category) => (
                  <>
                    <tr key={category.category} className="bg-stone-100">
                      <td
                        colSpan={4}
                        className="py-3 px-4 text-sm font-semibold text-stone-900"
                      >
                        {category.category}
                      </td>
                    </tr>
                    {category.features.map((feature) => (
                      <tr key={feature.name} className="border-b border-stone-100">
                        <td className="py-4 px-4 text-sm text-stone-600">
                          {feature.name}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {feature.starter === true ? (
                            <Check className="w-5 h-5 text-green-600 mx-auto" />
                          ) : feature.starter === false ? (
                            <X className="w-5 h-5 text-stone-300 mx-auto" />
                          ) : (
                            <span className="text-sm text-stone-600">
                              {feature.starter}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center bg-blue-50/50">
                          {feature.professional === true ? (
                            <Check className="w-5 h-5 text-green-600 mx-auto" />
                          ) : feature.professional === false ? (
                            <X className="w-5 h-5 text-stone-300 mx-auto" />
                          ) : (
                            <span className="text-sm text-stone-600">
                              {feature.professional}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {feature.enterprise === true ? (
                            <Check className="w-5 h-5 text-green-600 mx-auto" />
                          ) : feature.enterprise === false ? (
                            <X className="w-5 h-5 text-stone-300 mx-auto" />
                          ) : (
                            <span className="text-sm text-stone-600">
                              {feature.enterprise}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-stone-900">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg text-stone-600">
              Everything you need to know about ChiroFlow pricing
            </p>
          </div>

          <div>
            {faqs.map((faq) => (
              <FAQItem key={faq.question} faq={faq} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-stone-600 mb-4">Still have questions?</p>
            <Link href="#contact">
              <Button variant="outline" className="border-stone-300">
                <HelpCircle className="w-4 h-4 mr-2" />
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-[#053e67]/80 to-[#053e67]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to get started?
          </h2>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10">
            Join thousands of chiropractors who trust ChiroFlow.
            Start your free 14-day trial today.
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
            <Link href="#contact">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
              >
                Talk to Sales
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-blue-100">
            No credit card required. Cancel anytime.
          </p>
        </div>
      </section>
    </div>
  );
}
