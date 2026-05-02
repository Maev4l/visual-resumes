// Stock demo resume used by the /templates gallery to render each template at
// thumbnail and large sizes. Same fixture for every template so visual differences
// across the catalogue are purely template-driven (direct comparison is the point).
//
// Generic content: fictional name, plain-vanilla section data. No photo — keeps
// templates differentiated by layout, not by which face dominates them.

export const DEMO_RESUME = {
  id: 'DEMO',
  ownerCustomId: 'DEMO',
  title: 'Demo · Senior Engineer',
  templateId: 'monaco', // overridden by the consumer per-card.
  paperSize: 'A4',
  photoKey: null,
  published: null,
  sections: [
    {
      id: 'demo-contact',
      type: 'contact',
      pageBreakBefore: false,
      data: {
        name: 'Jane Doe',
        headline: 'Senior Software Engineer',
        email: 'jane.doe@example.com',
        phone: '+33 6 00 00 00 00',
        location: 'Paris, France',
        links: [
          { label: 'GitHub', url: 'https://github.com/janedoe' },
          { label: 'LinkedIn', url: 'https://linkedin.com/in/janedoe' },
        ],
      },
    },
    {
      id: 'demo-summary',
      type: 'summary',
      pageBreakBefore: false,
      data: {
        text: 'Backend engineer with eight years of experience building distributed systems. Comfortable across the stack — production Postgres, Kafka, Kubernetes — and unusually attached to writing readable code.',
      },
    },
    {
      id: 'demo-skills',
      type: 'skills',
      pageBreakBefore: false,
      data: [
        { group: 'Languages', items: ['Go', 'Python', 'TypeScript', 'Rust'] },
        { group: 'Infrastructure', items: ['Kubernetes', 'Terraform', 'AWS', 'PostgreSQL'] },
        { group: 'Practices', items: ['TDD', 'Trunk-based development', 'Code review'] },
        { group: 'Architecture', items: ['Event-driven systems', 'API design', 'Observability'] },
      ],
    },
    {
      id: 'demo-experience',
      type: 'experience',
      pageBreakBefore: false,
      data: [
        {
          company: 'Lumen Systems',
          role: 'Staff Engineer',
          location: 'Paris',
          startDate: '2022-03',
          endDate: '',
          current: true,
          body: 'Lead the platform team that runs the company\'s data ingestion pipeline.\n- Cut p99 latency from 1.4s to 220ms by sharding the hot path.\n- Owned migration from Mesos to Kubernetes; zero customer-visible downtime.',
        },
        {
          company: 'Northwind Labs',
          role: 'Senior Backend Engineer',
          location: 'Berlin',
          startDate: '2018-06',
          endDate: '2022-02',
          current: false,
          body: 'Built the billing service from scratch in Go.\n- Designed an idempotent webhook delivery layer used by 14 downstream teams.',
        },
        {
          company: 'Pivot & Co.',
          role: 'Software Engineer',
          location: 'Berlin',
          startDate: '2015-09',
          endDate: '2018-05',
          current: false,
          body: 'Generalist on a small product team. Shipped the first version of the analytics dashboard.',
        },
      ],
    },
    {
      id: 'demo-education',
      type: 'education',
      pageBreakBefore: false,
      data: [
        {
          institution: 'École Polytechnique',
          degree: 'M.Sc. Computer Science',
          field: 'Distributed Systems',
          startDate: '2013',
          endDate: '2015',
          notes: '',
        },
        {
          institution: 'Université Paris-Sud',
          degree: 'B.Sc. Computer Science',
          field: '',
          startDate: '2010',
          endDate: '2013',
          notes: '',
        },
      ],
    },
    {
      id: 'demo-languages',
      type: 'languages',
      pageBreakBefore: false,
      data: [
        { language: 'English', proficiency: 'Full professional proficiency' },
        { language: 'French', proficiency: 'Native or bilingual proficiency' },
      ],
    },
  ],
};
