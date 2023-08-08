import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  FlagIcon,
  MapIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

import GithubIcon from '../components/Icon/GithubIcon';
import InstagramIcon from '../components/Icon/InstagramIcon';
import LinkedInIcon from '../components/Icon/LinkedInIcon';
import StackOverflowIcon from '../components/Icon/StackOverflowIcon';
import TwitterIcon from '../components/Icon/TwitterIcon';
import heroImage from '../images/header-background.webp';
// import porfolioImage1 from '../images/portfolio/portfolio-1.jpg';
// import porfolioImage2 from '../images/portfolio/portfolio-2.jpg';
// import porfolioImage3 from '../images/portfolio/portfolio-3.jpg';
// import porfolioImage4 from '../images/portfolio/portfolio-4.jpg';
// import porfolioImage5 from '../images/portfolio/portfolio-5.jpg';
// import porfolioImage6 from '../images/portfolio/portfolio-6.jpg';
// import porfolioImage7 from '../images/portfolio/portfolio-7.jpg';
// import porfolioImage8 from '../images/portfolio/portfolio-8.jpg';
// import porfolioImage9 from '../images/portfolio/portfolio-9.jpg';
// import porfolioImage10 from '../images/portfolio/portfolio-10.jpg';
// import porfolioImage11 from '../images/portfolio/portfolio-11.jpg';
import profilepic from '../images/profilepic.jpg';
import testimonialImage from '../images/testimonial.webp';
import {
  About,
  ContactSection,
  ContactType,
  Hero,
  HomepageMeta,
  // PortfolioItem,
  SkillGroup,
  Social,
  ReferenceSection,
  TimelineItem,
} from './dataDef';

/**
 * Page meta data
 */
export const homePageMeta: HomepageMeta = {
  title: 'Daniel Park || Software Engineer',
  description: 'Portfolio Website',
};

/**
 * Section definition
 */
export const SectionId = {
  Hero: 'hero',
  About: 'about',
  Contact: 'contact',
  Portfolio: 'portfolio',
  Resume: 'resume',
  Skills: 'skills',
  Stats: 'stats',
  References: 'references',
} as const;

export type SectionId = (typeof SectionId)[keyof typeof SectionId];

/**
 * Hero section
 */
export const heroData: Hero = {
  imageSrc: heroImage,
  name: `Daniel Park`,
  description: (
    <>
      <p className="prose-sm text-stone-200 sm:prose-base lg:prose-lg">
        I'm a New Jersey based <strong className="text-stone-100">Full Stack Software Engineer</strong>, currently on
        the job search.
      </p>
      <p className="prose-sm text-stone-200 sm:prose-base lg:prose-lg"></p>
    </>
  ),
  actions: [
    {
      href: '/assets/resume.pdf',
      text: 'Resume',
      primary: true,
      Icon: ArrowDownTrayIcon,
    },
    {
      href: `#${SectionId.Contact}`,
      text: 'Contact',
      primary: false,
    },
  ],
};

/**
 * About section
 */
export const aboutData: About = {
  profileImageSrc: profilepic,
  description: `I'm a full stack engineer leaning towards an expertise towards front-end web development. I graduated from App Acadamey, a coding bootcamp, in 2021. Prior to software development, I worked in Finance at Bank of America, Merrill Lynch Pierce Fenner and Smith. `,
  aboutItems: [
    {label: 'Location', text: 'Garwood, NJ', Icon: MapIcon},
    {label: 'Age', text: '28', Icon: CalendarIcon},
    {label: 'Nationality', text: 'Korean', Icon: FlagIcon},
    {label: 'Interests', text: 'Video Games, Lifting, Tennis', Icon: SparklesIcon},
    {label: 'College', text: 'Rutgers Univesrity', Icon: AcademicCapIcon},
    // {label: 'Employment', text: 'Instant Domains, inc.', Icon: BuildingOffice2Icon},
  ],
};

/**
 * Skills section
 */
export const skills: SkillGroup[] = [
  {
    name: 'Frontend development',
    skills: [
      {
        name: 'React',
        level: 9,
      },
      {
        name: 'Typescript',
        level: 7,
      },
      {
        name: 'NextJs',
        level: 6,
      },
    ],
  },
  {
    name: 'Backend development',
    skills: [
      {
        name: 'Node.js',
        level: 5,
      },
      {
        name: 'Python',
        level: 3,
      },
    ],
  },
  {
    name: 'Spoken languages',
    skills: [
      {
        name: 'English',
        level: 10,
      },
      {
        name: 'Korean',
        level: 7,
      },
    ],
  },
];

/**
 * Portfolio section
 */
// export const portfolioItems: PortfolioItem[] = [
//   {
//     title: 'Project title 1',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage1,
//   },
//   {
//     title: 'Project title 2',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage2,
//   },
//   {
//     title: 'Project title 3',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage3,
//   },
//   {
//     title: 'Project title 4',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage4,
//   },
//   {
//     title: 'Project title 5',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage5,
//   },
//   {
//     title: 'Project title 6',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage6,
//   },
//   {
//     title: 'Project title 7',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage7,
//   },
//   {
//     title: 'Project title 8',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage8,
//   },
//   {
//     title: 'Project title 9',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage9,
//   },
//   {
//     title: 'Project title 10',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage10,
//   },
//   {
//     title: 'Project title 11',
//     description: 'Give a short description of your project here.',
//     url: 'https://reactresume.com',
//     image: porfolioImage11,
//   },
// ];

/**
 * Resume section -- TODO: Standardize resume contact format or offer MDX
 */
export const education: TimelineItem[] = [
  {
    date: 'November 2020 - May 2021',
    location: 'Online',
    title: 'App Academy BootCamp',
    content: (
      <p>
        Online Programming Bootcamp that focused on teaching computer science, and languages such as JavaScript and
        Python
      </p>
    ),
  },
  {
    date: 'September 2013 - January 2018',
    location: 'Rutgers University - Business School',
    title: 'Finance',
    content: <p></p>,
  },
];

export const experience: TimelineItem[] = [
  {
    date: 'August 2021 - August - 2023',
    location: 'Remote',
    title: 'Full-Stack Developer',
    content: (
      <p>
        Developed and maintained a web repository using TypeScript, ReactJs, webRTC, and TensorFlow, resulting in a more
        efficient and user-friendly web application.
        <br />
        Implemented advanced webRTC features to enable real-time communication capabilities, enhancing the overall user
        experience.
        <br /> Optimized code performance and improved application speed by leveraging ReactJs best practices and
        utilizing the latest features.
        <br /> Collaborated with cross-functional teams to identify and address technical issues, ensuring seamless
        integration and deployment of new features.
        <br /> Conducted thorough testing and debugging to ensure high-quality code and minimize system vulnerabilities.
      </p>
    ),
  },
];

/**
 * Testimonial section
 */
export const reference: ReferenceSection = {
  imageSrc: testimonialImage,
  references: [
    {
      name: 'John Doe',
      text: 'Use this as an opportunity to promote what it is like to work with you. High value testimonials include ones from current or past co-workers, managers, or from happy clients.',
      // image: 'https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/169.jpg',
    },
    {
      name: 'Jane Doe',
      text: 'Here you should write some nice things that someone has said about you. Encourage them to be specific and include important details (notes about a project you were on together, impressive quality produced, etc).',
    },
    {
      name: 'Someone else',
      text: 'Add several of these, and keep them as fresh as possible, but be sure to focus on quality testimonials with strong highlights of your skills/work ethic.',
    },
  ],
};

/**
 * Contact section
 */

export const contact: ContactSection = {
  headerText: 'Get in touch.',
  description: "If you have any questions, please don't hesitate to reach out!",
  items: [
    {
      type: ContactType.Email,
      text: 'danielpark0503@gmail.com',
      href: 'mailto:danielpark0503@gmail.com',
    },
    {
      type: ContactType.Location,
      text: 'Garwood, NJ',
      // href: 'https://www.google.ca/maps/place/Victoria,+BC/@48.4262362,-123.376775,14z',
    },
    {
      type: ContactType.Instagram,
      text: '@dpxrk',
      href: 'https://www.instagram.com/dpxrk/',
    },
    {
      type: ContactType.Github,
      text: 'dpxrk',
      href: 'https://github.com/dpxrk',
    },
  ],
};

/**
 * Social items
 */
export const socialLinks: Social[] = [
  {label: 'Github', Icon: GithubIcon, href: 'https://github.com/dpxrk'},
  {label: 'LinkedIn', Icon: LinkedInIcon, href: 'https://www.linkedin.com/in/danielpark0503/'},
  {label: 'Instagram', Icon: InstagramIcon, href: 'https://www.instagram.com/dpxrk/'},
];
