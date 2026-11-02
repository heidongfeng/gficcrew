import genPlans from './generated/plans.json';

const LOCAL_PLANS = [
  {
    id: 'national',
    name: 'National Group',
    price: 288,
    usd: 42,
    unit: 'per person · lifetime',
    featured: false,
    summary: 'The whole crew, nationwide. Best if you travel between cities or are still deciding where to land.',
    includes: [
      'Access to the national GFIC Crew community',
      'Online groups and forums for daily life support',
      'Event announcements for Guangzhou, Shenzhen and the national group',
      'Practical guides: housing, healthcare, banking, mobile payments',
      'Language exchange groups for Mandarin and English practice',
    ],
  },
  {
    id: 'city',
    name: 'City Group',
    price: 688,
    usd: 98,
    unit: 'per person · lifetime',
    featured: true,
    summary: 'One city group, with local meetups and local knowledge. Guangzhou first.',
    includes: [
      'Everything in the National Group',
      'Dedicated city group with local meetups and local knowledge',
      'Local knowledge on renting, healthcare and getting around, shared by people in your city',
      'Member pricing on food crawls, workshops and trips',
      'Priority access to limited-capacity events',
      'Your own event ideas promoted to the city group',
    ],
  },
  {
    id: 'business',
    name: 'Business Group',
    price: 2888,
    usd: 420,
    unit: 'per person · lifetime',
    featured: false,
    summary: 'For founders, freelancers and anyone building something in China.',
    includes: [
      'Everything in the City Group',
      'Business networking mixers and partner introductions',
      'Visibility for your own projects inside the crew',
      'Direct line to the organizing team for collaborations',
    ],
  },
];

export const PLANS =
  genPlans && Array.isArray(genPlans.plans) && genPlans.plans.length > 0 ? genPlans.plans : LOCAL_PLANS;

const LOCAL_REFUND_TERMS =
  'Once paid membership opens: anyone who has not joined an activity in their first week and has not broken the community rules can leave and get the fee back in full. There is no fee to refund today, because every group is free to join.';

export const REFUND_TERMS =
  (genPlans && typeof genPlans.refundTerms === 'string' && genPlans.refundTerms.trim()) ||
  LOCAL_REFUND_TERMS;
