// Central form registry. WHY a single map: SectionList looks up the correct form
// component by `section.type` at runtime, so co-locating the registry here keeps the
// dispatch table one import away from every consumer and prevents circular imports.
import ContactForm        from './ContactForm.jsx';
import SummaryForm        from './SummaryForm.jsx';
import ExperienceForm     from './ExperienceForm.jsx';
import EducationForm      from './EducationForm.jsx';
import SkillsForm         from './SkillsForm.jsx';
import ProjectsForm       from './ProjectsForm.jsx';
import LanguagesForm      from './LanguagesForm.jsx';
import CertificationsForm from './CertificationsForm.jsx';

export const FORMS = {
  contact:        ContactForm,
  summary:        SummaryForm,
  experience:     ExperienceForm,
  education:      EducationForm,
  skills:         SkillsForm,
  projects:       ProjectsForm,
  languages:      LanguagesForm,
  certifications: CertificationsForm,
};
