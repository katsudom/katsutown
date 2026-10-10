import {
  ADMISSIONS,
  CONTACTS,
  EDUCATION,
  HACKLAHOMA,
  PERSON,
  PROJECTS,
  PROJECT_ORDER,
  QUEST_LOG,
  SKILL_POUCHES,
} from '../game/data/content';
import { ExternalLink } from './components/ExternalLink';
import { ProjectCard } from './components/ProjectCard';
import { Role } from './components/Role';
import { Section } from './components/Section';
import { SkillGroup } from './components/SkillGroup';
import { Timeline } from './components/Timeline';

const hacklahomaFacts = [
  HACKLAHOMA.whiteboard,
  HACKLAHOMA.teammate,
  HACKLAHOMA.organizer,
  HACKLAHOMA.poster,
];

export function App() {
  return (
    <div className="min-h-screen bg-cream text-ink print:bg-white">
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-crimson-dark">
            Computer Science @ OU
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{PERSON.name}</h1>
          <p className="mt-4 max-w-2xl text-lg">{PERSON.bio}</p>
          <p className="mt-4 print:hidden">
            <a
              href="./index.html"
              className="inline-block rounded bg-crimson-dark px-4 py-2 text-sm font-bold text-cream-light hover:bg-ink"
            >
              Play the pixel-art version
            </a>
          </p>
          <ul aria-label="Contact" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {CONTACTS.map((c) => (
              <li key={c.label}>
                <ExternalLink href={c.url}>{c.label}</ExternalLink>
                <span className="sr-only">: {c.value}</span>
              </li>
            ))}
          </ul>
        </header>

        <Section id="projects" title="Projects">
          <div className="grid gap-5 md:grid-cols-2">
            {PROJECT_ORDER.map((id) => (
              <ProjectCard key={id} project={PROJECTS[id]} />
            ))}
          </div>
        </Section>

        <Section id="experience" title="Experience">
          <Role
            title={HACKLAHOMA.role}
            org={HACKLAHOMA.org}
            meta={`${HACKLAHOMA.dates} · ${HACKLAHOMA.location}`}
          >
            <ul className="list-disc space-y-1.5 pl-5">
              {hacklahomaFacts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Role>
          <Role title={ADMISSIONS.role} org={ADMISSIONS.place} meta={ADMISSIONS.dates}>
            <ul className="list-disc space-y-1.5 pl-5">
              {ADMISSIONS.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Role>
        </Section>

        <Section id="education" title="Education">
          <h3 className="text-xl font-bold">{EDUCATION.school}</h3>
          <p>
            {EDUCATION.degree} · {EDUCATION.dates} · {EDUCATION.expected}
          </p>
          <p>GPA {EDUCATION.gpa}</p>
        </Section>

        <Section id="skills" title="Skills">
          <div className="grid gap-6 sm:grid-cols-2">
            {SKILL_POUCHES.map((p) => (
              <SkillGroup key={p.id} pouch={p} />
            ))}
          </div>
        </Section>

        <Section id="timeline" title="Timeline">
          <Timeline entries={QUEST_LOG} />
        </Section>

        <footer className="mt-14 rounded-lg border-2 border-crimson bg-cream-light p-6 text-center print:hidden">
          <p className="mb-3">This portfolio also exists as a pixel-art game: {PERSON.townName}.</p>
          <a
            href="./index.html"
            className="inline-block rounded bg-crimson-dark px-6 py-3 font-bold text-cream-light hover:bg-ink"
          >
            Explore the pixel-art version
          </a>
        </footer>
      </main>
    </div>
  );
}
