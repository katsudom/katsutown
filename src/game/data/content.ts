/**
 * ALL portfolio content, transcribed verbatim from the project spec.
 *
 * RULES FOR THIS FILE
 *  1. Nothing here may be invented. Every fact about Dominic comes from the spec.
 *  2. Project links are intentionally `url: null` - Dominic fills them in later.
 *     The UI renders those as "(link coming soon)".
 *  3. Maps reference these by id and supply tile coordinates; this file holds no
 *     positions, so content and level design stay independent.
 *  4. The classic (/classic) page renders from this same module, so the two
 *     versions of the portfolio can never drift apart.
 */
import type {
  ContactLink,
  DialoguePage,
  MapMarker,
  ProjectCard,
  QuestEntry,
  SkillPouch,
} from '../types';

// ---------------------------------------------------------------------------
// Identity / bio
// ---------------------------------------------------------------------------

export const PERSON = {
  name: 'Dominic Pham',
  tagline: 'CS @ OU',
  townName: 'Katsudom Town',
  /** Spec: Dominic's House, the computer. */
  bio:
    'Dominic Pham – Computer Science student at the University of Oklahoma ' +
    '(B.S., expected Dec 2027, GPA 3.76). Full-stack developer who builds, tests, and ships.',
} as const;

export const CONTACTS: ContactLink[] = [
  {
    label: 'Email',
    value: 'dominicpham.2006@gmail.com',
    url: 'mailto:dominicpham.2006@gmail.com',
  },
  {
    label: 'LinkedIn',
    value: 'linkedin.com/in/dominic-k-pham',
    url: 'https://linkedin.com/in/dominic-k-pham',
  },
  { label: 'GitHub', value: 'github.com/katsudom', url: 'https://github.com/katsudom' },
  { label: 'GitLab', value: 'gitlab.com/katsudom', url: 'https://gitlab.com/katsudom' },
];

// ---------------------------------------------------------------------------
// Projects. `bullets` are one-per-interactable-object; `card` is the project card.
// ---------------------------------------------------------------------------

export interface ProjectContent {
  id: 'hackerPortal' | 'freeFoodFinder' | 'ascent' | 'devTracker';
  /** Building / location name as it appears in the world. */
  place: string;
  card: ProjectCard;
  /** One bullet per interactable object inside. Object labels come from the map. */
  bullets: string[];
}

export const PROJECTS: Record<ProjectContent['id'], ProjectContent> = {
  hackerPortal: {
    id: 'hackerPortal',
    place: 'The Archive',
    card: {
      title: 'Hacker Portal',
      tagline: 'Version-controlled file/copy tool for the marketing team.',
      tech: ['Express', 'MongoDB', 'React'],
      links: [
        { label: 'repo', url: null },
        { label: 'screenshots', url: null },
      ],
    },
    bullets: [
      '6 Express REST endpoints with validation, role-based access, rate limiting, and audit logs',
      'Append-only MongoDB version history: edits and restores never overwrite approved copy',
      'Version-controlled file/copy tool for the marketing team',
      'Shipped behind a feature flag with lazy-loaded React routes',
      'Design critique cut the flow from 4 screens to 3',
    ],
  },

  freeFoodFinder: {
    id: 'freeFoodFinder',
    place: 'Free Food Finder truck',
    card: {
      title: 'Free Food Finder',
      tagline: 'Cross-platform Expo app (iOS, Android, Web).',
      tech: ['React Native (Expo)', 'TypeScript', 'Supabase'],
      links: [
        { label: 'repo', url: null },
        { label: 'screenshots', url: null },
      ],
    },
    bullets: [
      'Cross-platform Expo app (iOS, Android, Web)',
      'Interactive map with event clustering and highlight-to-focus UX',
      'Fixed a Supabase auth bug that left new users without a session',
      'Redesigned profile/settings in React Native',
      '7-person GitLab team; PRs gated on ESLint, Prettier, Secretlint',
    ],
  },

  ascent: {
    id: 'ascent',
    place: 'Ascent Trail',
    card: {
      title: 'Ascent',
      tagline: 'Gamified MERN learning platform · Hacklahoma 2026.',
      tech: ['MongoDB', 'Express', 'React', 'Node', 'Docker'],
      links: [
        { label: 'repo', url: null },
        { label: 'demo', url: null },
        { label: 'screenshots', url: null },
      ],
    },
    bullets: [
      'Gamified MERN learning platform built in 24 hours, 4-person team',
      'Leaderboards, streaks, live friend tracking',
      'Authorization-gated custom roadmaps from MongoDB to React UI',
      'Analytics dashboard: learning velocity, 30-day completion trends',
      'Dockerized MVP, JWT auth, English/Spanish',
    ],
  },

  devTracker: {
    id: 'devTracker',
    place: 'Server Shed',
    card: {
      title: 'Developer Tracker Widget',
      tagline: '3 Node.js replicas load-balanced behind Nginx.',
      tech: ['Node', 'Express', 'Nginx', 'PostgreSQL', 'Docker', 'GitLab CI'],
      links: [
        { label: 'repo', url: null },
        { label: 'screenshots', url: null },
      ],
    },
    bullets: [
      '3 Node.js replicas load-balanced behind Nginx',
      'Nginx, API, and PostgreSQL orchestrated with Docker Compose',
      '3-stage GitLab CI/CD pipeline (test, build, deploy)',
      'Express API for a GitHub/GitLab/LeetCode activity widget, exposed via Cloudflare Tunnel',
      'Co-recorded a 6-week, 12-lesson DevOps curriculum',
    ],
  },
};

export const PROJECT_ORDER: ProjectContent['id'][] = [
  'hackerPortal',
  'freeFoodFinder',
  'ascent',
  'devTracker',
];

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

export const HACKLAHOMA = {
  org: 'Hacklahoma',
  place: 'Hacklahoma Clubhouse',
  role: 'Full-Stack Developer, Tech Team',
  dates: 'Feb 2026 – Present',
  location: 'Norman, OK',
  whiteboard: 'Sprint board: dev → test → prod.',
  teammate: 'Jest + Puppeteer unit and E2E tests before merges',
  organizer: 'Biweekly sprint demos, feedback turned into GitLab issues',
  poster: 'Features battle-tested with live users at student-org events and a mini hackathon',
} as const;

export const EDUCATION = {
  school: 'University of Oklahoma',
  degree: 'B.S. Computer Science',
  dates: '2024–2027',
  expected: 'expected Dec 2027',
  gpa: '3.76',
} as const;

export const ADMISSIONS = {
  place: 'Admissions Office',
  role: 'Student Office Assistant',
  dates: 'Aug 2024 – Sep 2025',
  bullets: [
    'Streamlined a shared Excel workflow for 50+ requests/week',
    'Helped at Admitted Students Day (2,100 attendees) and Sooner Saturday',
  ],
} as const;

export const TOUR_GUIDE_LINE = 'I have led 6 campus tours. Want to see the town?';

// ---------------------------------------------------------------------------
// NPC dialogue. Role titles rather than invented personal names, so nothing
// here reads as a claim about a real person.
// ---------------------------------------------------------------------------

export const NPC_DIALOGUE: Record<string, { name: string; pages: DialoguePage[] }> = {
  greeter: {
    name: 'Greeter',
    pages: [
      {
        speaker: 'Greeter',
        text: `Welcome to ${PERSON.townName}! This whole town is Dominic Pham’s portfolio.`,
      },
      {
        speaker: 'Greeter',
        text: 'Arrow keys or WASD to walk. On a phone, use the D-pad in the corner.',
      },
      {
        speaker: 'Greeter',
        text: 'Press SPACE or ENTER to talk, read signs, and step through text. On a phone, tap A.',
      },
      {
        speaker: 'Greeter',
        text: 'Press ESC for the menu: profile, skills, quest log, a fast-travel map, and sound settings.',
      },
      {
        speaker: 'Greeter',
        text: 'Four project buildings ring the square. The clubhouse is north, the campus gate is east.',
      },
    ],
  },

  tourGuide: {
    name: 'Tour Guide',
    pages: [
      { speaker: 'Tour Guide', text: TOUR_GUIDE_LINE },
      {
        speaker: 'Tour Guide',
        text: 'This is the Campus Gate. University of Oklahoma, B.S. Computer Science, 2024–2027.',
      },
      {
        speaker: 'Tour Guide',
        text: `The Admissions Office is a long walk north of here. ${ADMISSIONS.role}, ${ADMISSIONS.dates}.`,
      },
      {
        speaker: 'Tour Guide',
        text: 'Say the word and I will walk you to every building in town.',
      },
    ],
  },

  teammate: {
    name: 'Teammate',
    pages: [
      { speaker: 'Teammate', text: 'Tech Team, Hacklahoma. Nothing merges here without tests.' },
      { speaker: 'Teammate', text: `${HACKLAHOMA.teammate}.` },
    ],
  },

  organizer: {
    name: 'Organizer',
    pages: [
      {
        speaker: 'Organizer',
        text: 'I run the demos. Every two weeks the team shows working software.',
      },
      { speaker: 'Organizer', text: `${HACKLAHOMA.organizer}.` },
    ],
  },

  vendor: {
    name: 'Vendor',
    pages: [
      { speaker: 'Vendor', text: 'Welcome to the Free Food Finder truck.' },
      {
        speaker: 'Vendor',
        text: 'Free Food Finder: a cross-platform Expo app (iOS, Android, Web).',
      },
      { speaker: 'Vendor', text: 'Step inside the truck and I will show you how it was built.' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Signs
// ---------------------------------------------------------------------------

export const SIGNS: Record<string, DialoguePage[]> = {
  welcome: [
    {
      speaker: 'Welcome Sign',
      text: `${PERSON.townName.toUpperCase()}\nHome of ${PERSON.name} · ${PERSON.tagline}`,
    },
    {
      speaker: 'Welcome Sign',
      text: 'West: home. North: Hacklahoma Clubhouse. East: Campus Gate. Around the square: four projects.',
    },
  ],
  campusGate: [
    {
      speaker: 'Campus Gate',
      text: `${EDUCATION.school}\n${EDUCATION.degree}, ${EDUCATION.dates}`,
    },
    {
      speaker: 'Campus Gate',
      text: `B.S. ${EDUCATION.expected}. GPA ${EDUCATION.gpa}.`,
    },
  ],
  trailhead: [
    {
      speaker: 'Trailhead Sign',
      text: 'ASCENT TRAIL\nHacklahoma 2026. One flag per milestone – read them on the way up.',
    },
  ],
  mailbox: [
    { speaker: 'Mailbox', text: `${PERSON.name} – get in touch:` },
    ...CONTACTS.map((c) => ({ speaker: 'Mailbox', text: `${c.label}: ${c.value}` })),
  ],
};

// ---------------------------------------------------------------------------
// Menu content
// ---------------------------------------------------------------------------

export const SKILL_POUCHES: SkillPouch[] = [
  {
    id: 'languages',
    name: 'Languages',
    items: ['TypeScript', 'JavaScript', 'Python', 'Java', 'C++', 'HTML/CSS'],
  },
  {
    id: 'backend',
    name: 'Backend & DB',
    items: [
      'Node.js',
      'Express',
      'REST APIs',
      'Zod',
      'JWT',
      'MongoDB (Mongoose)',
      'PostgreSQL',
      'Supabase',
    ],
  },
  {
    id: 'devops',
    name: 'DevOps & Tools',
    items: [
      'Docker',
      'Docker Compose',
      'Nginx',
      'GitLab CI/CD',
      'Cloudflare Tunnel',
      'Git',
      'GitHub',
      'Jest',
      'Puppeteer',
    ],
  },
  {
    id: 'frontend',
    name: 'Frontend',
    items: ['React', 'React Native (Expo)', 'Tailwind CSS', 'Vite', 'ESLint/Prettier'],
  },
];

export const QUEST_LOG: QuestEntry[] = [
  {
    title: 'Started at OU',
    when: 'Aug 2024',
    detail: `${EDUCATION.school} – ${EDUCATION.degree}, ${EDUCATION.dates}.`,
  },
  {
    title: 'Admissions Assistant',
    when: `${ADMISSIONS.dates}`,
    detail: `${ADMISSIONS.role}. ${ADMISSIONS.bullets.map((b) => `${b}.`).join(' ')}`,
  },
  {
    title: 'Joined Hacklahoma Tech Team',
    when: 'Feb 2026',
    detail: `${HACKLAHOMA.role} – ${HACKLAHOMA.location}.`,
  },
  {
    title: 'Shipped Ascent at Hacklahoma 2026',
    when: '2026',
    detail: PROJECTS.ascent.bullets[0],
  },
];

/**
 * Mini-map markers. `tileX`/`tileY` are OVERWORLD tiles the player is dropped
 * on when fast-travelling; `pinX`/`pinY` are 0..1 positions on minimap.png.
 * The maps agent owns these numbers and must keep them walkable.
 */
export const MAP_MARKERS: MapMarker[] = [
  {
    mapId: 'house',
    label: "Dominic's House",
    tileX: 14,
    tileY: 24,
    facing: 'down',
    pinX: 0.2,
    pinY: 0.52,
  },
  {
    mapId: 'overworld',
    label: 'Town Square',
    tileX: 30,
    tileY: 24,
    facing: 'down',
    pinX: 0.5,
    pinY: 0.5,
  },
  {
    mapId: 'archive',
    label: 'The Archive',
    tileX: 24,
    tileY: 17,
    facing: 'up',
    pinX: 0.38,
    pinY: 0.36,
  },
  {
    mapId: 'truck',
    label: 'Free Food Finder',
    tileX: 36,
    tileY: 27,
    facing: 'up',
    pinX: 0.6,
    pinY: 0.58,
  },
  {
    mapId: 'trail',
    label: 'Ascent Trail',
    tileX: 44,
    tileY: 18,
    facing: 'up',
    pinX: 0.74,
    pinY: 0.38,
  },
  {
    mapId: 'shed',
    label: 'Server Shed',
    tileX: 24,
    tileY: 31,
    facing: 'up',
    pinX: 0.38,
    pinY: 0.66,
  },
  {
    mapId: 'clubhouse',
    label: 'Hacklahoma Clubhouse',
    tileX: 30,
    tileY: 9,
    facing: 'up',
    pinX: 0.5,
    pinY: 0.14,
  },
  {
    mapId: 'admissions',
    label: 'Admissions Office',
    tileX: 50,
    tileY: 24,
    facing: 'up',
    pinX: 0.86,
    pinY: 0.5,
  },
];
