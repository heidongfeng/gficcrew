import genFaq from './generated/faq.json';

// LOCAL_FAQ is the fallback. The effective answers come from generated/faq.json
// (generated-first), so an edit here is invisible until the generated snapshot goes
// missing -- and stale copy then ships silently. Every answer below must stay word-for-word
// equivalent to its generated counterpart; the audit's text-claims check enforces that.
const LOCAL_FAQ = [
  {
    a: 'GFIC Crew (GFIC歪果社) is a growing real-life social community for expats in China, started by locals who know the country well. We are an events crew first: the meetups we are building fall into ten formats, from parties and networking mixers through to food crawls, language exchange, hikes, sports leagues and cultural experiences. We meet up in person in Guangzhou and Shenzhen, and anyone else in China can join our online groups and national group. We are small and growing, and every group is free to join right now.',
    q: 'What is GFIC Crew (GFIC歪果社)?',
    category: 'About GFIC Crew',
  },
  {
    a: 'Anyone living in China as an expat, and anyone planning to move to China who wants a community before they land. That includes English teachers, engineers, entrepreneurs, students, remote workers, trailing spouses and long-term travelers. We also welcome globally-minded Chinese members who want genuine international friendships. There is no nationality requirement.',
    q: 'Who can join GFIC Crew?',
    category: 'About GFIC Crew',
  },
  {
    a: 'Yes. Guangzhou is our home base and the city where we can actually meet up in person. Alongside Shenzhen it is where we meet people offline, and it is what this site’s living guide is grounded in: visas, housing, banking, healthcare and getting around.',
    q: 'Is GFIC Crew active in Guangzhou?',
    category: 'About GFIC Crew',
  },
  {
    a: 'We meet offline in Guangzhou and Shenzhen, which is where we are based. Everywhere else in China you can still join us: our online groups and our national group are open to expats in any city, and that is where most of the day-to-day conversation, questions and event announcements happen. If your city grows a group of its own, we will build it out from there.',
    q: 'Which cities does GFIC Crew cover?',
    category: 'About GFIC Crew',
  },
  {
    a: 'Most expat groups in China are either a chat group with no real-world meetups, or a commercial ticket seller. GFIC Crew is built around crew-led real-life meetups and practical mutual support: housing, banking and mobile payments answered by people who have already done it. When paid membership opens it will be lifetime rather than a fee per meetup, and there are no commercial advertisements inside the crew.',
    q: 'How is GFIC Crew different from other expat groups in China?',
    category: 'About GFIC Crew',
  },
  {
    a: 'Paid membership has not opened yet, so joining costs nothing today. These are the prices it will use when it does: RMB 288 (USD 42) for the National Group, RMB 688 (USD 98) for a City Group and RMB 2,888 (USD 420) for the Business Group. Each is a single payment rather than a subscription.',
    q: 'How much does GFIC Crew membership cost?',
    category: 'Membership & Fees',
  },
  {
    a: 'The National Group (RMB 288) is the nationwide community: online groups and event announcements, open wherever you are in China. A City Group (RMB 688) adds the local group for your city and its local knowledge. The Business Group (RMB 2,888) adds business networking and visibility for your own projects within the crew. These are our membership tiers for when paid membership opens. Every group is free to join right now.',
    q: 'What is the difference between the National Group, City Group and Business Group?',
    category: 'Membership & Fees',
  },
  {
    a: 'Yes, once paid membership opens. Anyone who has not joined an activity in their first week and has not broken the community rules will be able to leave and get the fee back in full. Until then there is no fee to refund, because every group is free.',
    q: 'Can I get a refund?',
    category: 'Membership & Fees',
  },
  {
    a: 'Every group is free to join right now, and there is nothing to pay to come along, because we have not opened paid membership yet. When it does open it covers a lifetime membership rather than a fee per meetup. For now you add us on WeChat, tell us which format you are after, and we let you know when something is confirmed.',
    q: 'Do I need to become a member to attend an event?',
    category: 'Membership & Fees',
  },
  {
    a: 'There is nothing to pay yet, because paid membership has not opened. Add WeChat ID DN8117, say which group you are after, and we add you, normally within 24 hours. When membership does open we will take payment by WeChat Pay or Alipay, and we will set out the steps here before anything is charged.',
    q: 'How do I pay the membership fee?',
    category: 'Membership & Fees',
  },
  {
    a: 'Ten formats: parties and socials, networking mixers, food crawls and shared meals, language exchange, hikes and weekend getaways, sports leagues and fitness, Chinese cultural experiences, board games and trivia, coffee and brunch, and interest groups. Parties, mixers and food crawls are the ones you can turn up to on your own.',
    q: 'What kind of events does GFIC Crew organize?',
    category: 'Events & Activities',
  },
  {
    a: 'We are just getting started, so there is no fixed schedule yet. Meetups are announced inside the WeChat groups as they are confirmed, and we add people to the event group the day before each one. Guangzhou and Shenzhen are where in-person meetups happen first; other cities join in through the online and national groups until a local group forms.',
    q: 'How often are events held?',
    category: 'Events & Activities',
  },
  {
    a: 'Add us on WeChat (DN8117) and tell us you want to join. Meetups are announced in the groups rather than on a public calendar, and we add you to the event group the day before it happens. Every group is free to join right now.',
    q: 'How do I sign up for an event?',
    category: 'Events & Activities',
  },
  {
    a: 'Yes, and we encourage it. Community members can initiate their own meetups and the GFIC Crew team offers organizational support and collaboration: venue suggestions, promotion to the city group, and help with booking. We are small enough right now that this offer is open rather than theoretical.',
    q: 'Can I organize my own event through GFIC Crew?',
    category: 'Events & Activities',
  },
  {
    a: 'Yes. Several of the formats work without much language. Parties and food crawls need almost none, and language exchange is built for beginners by definition. Announcements go out in English, and there is usually somebody around who can translate when it actually matters.',
    q: 'Are events suitable for people who do not speak Chinese?',
    category: 'Events & Activities',
  },
  {
    a: 'Partners and friends are welcome at social and food events. Some outdoor and sports events have age or fitness limits, which are stated in each event description. Family-friendly events are labeled in the calendar.',
    q: 'Can I bring friends, partners or children?',
    category: 'Events & Activities',
  },
  {
    a: 'Yes. Language exchange is one of our ten formats, and it is the one that gives you a stated reason to be there, which is much easier to say out loud than wanting to meet people. Sessions get announced in the WeChat groups once they are confirmed.',
    q: 'Do you offer Chinese language exchange?',
    category: 'Language & Culture',
  },
  {
    a: 'Yes, especially in Guangzhou and Shenzhen where Cantonese is part of daily life. In Guangzhou we plan to split each session between Mandarin and Cantonese, and to run the dim sum and tea sessions with Cantonese phrases included. Nothing is on a calendar yet, so say so in the group if you want it.',
    q: 'Can I learn Cantonese with GFIC Crew?',
    category: 'Language & Culture',
  },
  {
    a: 'Cultural workshops cover cooking, calligraphy, tea ceremony and tai chi, run by locals rather than performed for visitors. Being shown something by somebody who grew up with it is the difference, and people pick up on it straight away. We do not run a standing workshop calendar, so when one goes ahead it is announced in the groups.',
    q: 'What cultural activities do you organize?',
    category: 'Language & Culture',
  },
  {
    a: 'It depends heavily on district. Zhujiang New Town is the modern, most expensive option; Tianhe and Yuexiu give you more space for less; Haizhu and Panyu are cheaper again. Rather than trust a number on a website, ask inside the group: members post what they actually pay, and that changes faster than any guide.',
    q: 'How much does rent cost in Guangzhou?',
    category: 'Living in China · Housing',
  },
  {
    a: 'You need a Chinese bank account or an accepted international card, then verify your identity inside WeChat (Me → Services → Wallet → Cards) or Alipay with your passport. Most expats open a local bank account first because it makes rent, utilities and transfers much simpler. Our members share which banks currently accept passport-only applications in each city.',
    q: 'How do I set up WeChat Pay and Alipay as a foreigner?',
    category: 'Living in China · Money',
  },
  {
    a: 'Most work permits require it, and it is strongly recommended in any case because private care is expensive. Typically you are covered by employer-provided insurance plus a personal international policy. We share comparisons of local and international plans in the member groups.',
    q: 'Do I need health insurance in China?',
    category: 'Living in China · Healthcare',
  },
  {
    a: 'Go to a China Mobile, China Unicom or China Telecom flagship store with your passport; registration is tied to your passport and takes about 15 minutes. You need a number for almost everything: bank accounts, delivery apps, ride hailing, WeChat Pay verification.',
    q: 'How do I get a Chinese phone number?',
    category: 'Living in China · Daily Life',
  },
  {
    a: 'The essentials are WeChat (messaging and payment), Alipay (payment), Amap or Baidu Maps (navigation), Didi (taxis), Meituan or Ele.me (food delivery), Taobao and JD (shopping), 12306 (trains) and Trip.com (flights and hotels).',
    q: 'Which apps do I need to live in China?',
    category: 'Living in China · Daily Life',
  },
  {
    a: 'Guangzhou combines a lower cost of living than Beijing or Shanghai with Cantonese food that is cheap enough to eat out often, a subtropical climate, a huge international trade community and fast rail links to Hong Kong, China, Shenzhen and Southeast Asia. It is also a comparatively easy Chinese city to settle into, because the local culture is famously practical and non-judgmental.',
    q: 'Why do expats choose Guangzhou?',
    category: 'Guangzhou',
  },
  {
    a: 'Zhujiang New Town is the modern CBD with high-rise apartments and nightlife; Tianhe is convenient and busy; Yuexiu has the old-city feel, parks and the traditional food most people come for; Haizhu is greener and cheaper along the river; Panyu is popular with families near international schools.',
    q: 'Where do expats usually live in Guangzhou?',
    category: 'Guangzhou',
  },
  {
    a: 'Respect the diverse cultures of all countries with no discriminatory remarks based on race, gender, religion or any other grounds; no commercial advertisements; no illegal activities or remarks; and do not harass or add other crew members as friends without their consent. Minor violations get a warning, serious violations mean removal with no refund.',
    q: 'What are the GFIC Crew community rules?',
    category: 'Community Rules',
  },
  {
    a: 'Commercial advertising inside the community groups is prohibited to keep the atmosphere supportive. Business visibility is what the Business Group (RMB 2,888) will cover once it opens, and partner events are planned for later, with any promotion clearly labeled and agreed in advance.',
    q: 'Can I promote my business in the crew?',
    category: 'Community Rules',
  },
  {
    a: 'Add WeChat ID DN8117, or search “GFIC Crew” on WeChat Official Account, WeChat Channels, Xiaohongshu and the other platforms where the crew uses the same name. We normally reply within 24 hours.',
    q: 'How do I contact GFIC Crew?',
    category: 'Getting in Touch',
  },
  {
    a: 'It helps a lot, because event coordination in China runs on WeChat groups. If you are not in China yet, install WeChat and set it up before arrival, and add DN8117 so we can keep you updated until you land.',
    q: 'Do I need a WeChat account to join?',
    category: 'Getting in Touch',
  },
  {
    a: 'During National Day Golden Week (October 1-7) major attractions are extremely crowded and hotel prices spike. For expats already living in China, staying local usually beats traveling: neighborhood restaurants stay open, and small parks and lesser-known districts are quiet. It is a good week to ask the group what everyone is doing; plenty of members are around and not traveling.',
    q: 'What should expats do in China during National Day Golden Week?',
    category: 'Living in China · Daily Life',
  },
  {
    a: 'No — GFIC Crew is an expat social community in China.',
    q: 'Is GFIC Crew the same as the Green Future Innovation Challenge?',
    category: 'About GFIC Crew',
  },
  {
    a: 'Golden Week is one of the busiest travel periods in China: trains, flights and hotels book out weeks ahead, and the first and last days are the worst. If you are already living here, the crowds are a good reason to stay local and join community events instead. If you are planning a first visit, the two weeks after October 8 are far more comfortable, and you will find the local groups easier to reach too.',
    q: 'Is it a good time for foreigners to visit China during Golden Week?',
    category: 'Living in China · Daily Life',
  },
  {
    a: 'Most restaurants, shopping malls, convenience stores and supermarkets stay open through the holiday, and public transport runs as usual. Some government offices, banks and administrative services may close or run reduced hours, and many businesses shift their rest days around the first week. If you rely on a specific service, check its holiday notice a few days ahead. For anything time-sensitive, start it before the break rather than during it.',
    q: 'What is open and closed in China during National Day?',
    category: 'Living in China · Daily Life',
  },
  {
    a: 'Avoid major tourist landmarks on peak days. Choose lesser-known destinations such as smaller museums, local parks, or historic neighborhoods. If you are in Guangzhou, explore areas beyond Tianhe and Yuexiu, try local markets, or join small-group community events. GFIC Crew events are often smaller and more relaxed than typical tourist activities.',
    q: 'How can I avoid crowds in China during October holiday?',
    category: 'Living in China · Daily Life',
  },
  {
    a: 'Golden Week is one of the easiest weeks of the year to meet people, because nobody is working. Local communities, malls and expat groups all put things on. Because it is a public holiday the logistics change though: venues get crowded, trains and tickets sell out early, and some places keep holiday hours. Our own meetups are announced inside the WeChat groups rather than on a calendar, so if you are heading to Guangzhou or Shenzhen, add us before you travel and we will tell you what is on.',
    q: 'Can foreigners join local events in China during Golden Week?',
    category: 'Living in China · Daily Life',
  },
  {
    category: 'Events & Activities',
    q: 'Which meetup should I start with if I am coming on my own?',
    a: 'A party or a networking mixer, if one is going. Arriving alone at something social is normal here, and coming in with a group means you are never the one left standing by the door. Food crawls work well too, because nobody has to be interesting when there is food on the table. Language exchange suits people who would rather have a stated reason to be in the room.',
  },
  {
    category: 'Events & Activities',
    q: 'Do you run bar nights or pub crawls?',
    a: 'Yes. Club nights and pub crawls sit inside our parties and socials format. A drink gives you somewhere to stand and something to do with your hands, so there is no opening line to prepare. What is genuinely China-specific is knowing which places are used to international crowds, what a night actually costs, and how the room reads once it fills up. That is the idea behind our pub crawls: somebody who already knows takes the lead.',
  },
  {
    category: 'Events & Activities',
    q: 'Can I join a food crawl if I cannot read a menu?',
    a: 'That is most of the point. Pictureless menus, dishes you cannot pronounce, and no way to tell whether you ordered well are exactly what puts people off eating out here. On a food crawl somebody orders for the table, so you get more dishes and none of the guesswork. Hands-on food like hotpot and dumplings works best, because everyone is busy doing something rather than making conversation.',
  },
  {
    category: 'Language & Culture',
    q: 'How is your language exchange different from the ones I have tried?',
    a: 'The complaint we hear most is that they quietly turn into a dating event, or an English corner where nobody talks to anyone new. What we aim for instead is a host, a structure and an actual topic, so you get paired with somebody early instead of standing in a corner. It also pulls two crowds into one room: expats who want Chinese and locals who want English. Demand for this in China is enormous and the quality is uneven, which is why ours runs with a host, a structure and an actual topic.',
  },
  {
    category: 'Events & Activities',
    q: 'What actually happens at a meetup?',
    a: 'Each confirmed meetup is built around one of the formats on the events page, such as a shared meal, a social night, a hike or a language exchange. The event announcement gives the date, meeting point, cost and what to expect. If no date is listed, ask in the WeChat group rather than assuming a format is running this week.',
  },
  {
    category: 'About GFIC Crew',
    q: 'Who writes GFIC Crew guides?',
    a: 'Guides are published by GFIC Crew as an organization, based on the community organizer’s experience in China. We do not use a fictional personal author or require the organizer to publish personal social accounts. Outdated information can be reported through WeChat DN8117.',
  },
];

export const FAQ = Array.isArray(genFaq) && genFaq.length > 0 ? genFaq : LOCAL_FAQ;
