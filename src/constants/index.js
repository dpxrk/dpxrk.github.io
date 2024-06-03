import {
  mobile,
  backend,
  creator,
  web,
  javascript,
  typescript,
  html,
  css,
  reactjs,
  redux,
  tailwind,
  nodejs,
  mongodb,
  git,
  figma,
  visionable,
  bofa,
  reverse,
  carrent,
  jobit,
  tripguide,
  threejs,
  noah,
  python,
  java,
} from "../assets";

export const navLinks = [
  {
    id: "about",
    title: "About",
  },
  {
    id: "work",
    title: "Work",
  },
  {
    id: "contact",
    title: "Contact",
  },
];

const services = [
  {
    title: "Web Developer",
    icon: web,
  },
  {
    title: "Front End Developer",
    icon: mobile,
  },
  {
    title: "Backend Developer",
    icon: backend,
  },
  {
    title: "Full Stack Developer",
    icon: creator,
  },
];

const technologies = [
  {
    name: "TypeScript",
    icon: typescript,
  },
  {
    name: "JavaScript",
    icon: javascript,
  },
  {
    name: "Python",
    icon: python,
  },
  {
    name: "Java",
    icon: java,
  },
  {
    name: "HTML5",
    icon: html,
  },
  {
    name: "CSS3",
    icon: css,
  },
  {
    name: "ReactJS",
    icon: reactjs,
  },
  {
    name: "Redux Toolkit",
    icon: redux,
  },
  {
    name: "TailwindCSS",
    icon: tailwind,
  },
  {
    name: "NodeJS",
    icon: nodejs,
  },
  {
    name: "MongoDB",
    icon: mongodb,
  },
  {
    name: "ThreeJS",
    icon: threejs,
  },
  {
    name: "git",
    icon: git,
  },
  {
    name: "figma",
    icon: figma,
  },
];

const experiences = [
  {
    title: "Full Stack Developer",
    company_name: "Visionable Global Inc",
    icon: visionable,
    iconBg: "#E6DEDD",
    date: "August 2021 - August 2023",
    points: [
      "Spearheaded the modernization of the codebase, transitioning to Next.js and TypeScript for improved scalability and maintainability.",
      "Developed real-time video conferencing features using WebRTC API, which resulted in enhanced user interaction and communication capabilities.",
      "Lead the creation of MVPs, employing CRUD methodology and leveraging MaterialUI components to streamline user experience.",
      "Implement AWS-Amplify to manage user authentication and user pools securely, resulting in streamlined user management.",
      "Designed and developed a Customer Portal, enabling efficient user account, group, and meeting settings management",
    ],
  },
  {
    title: "Career Change",
    company_name: "",
    icon: reverse,
    iconBg: "#E6DEDD",
    date: "October 2020 - April 2021",
    points: [
      "Left Bank of America in February 2020 to be unexpectedly faced with COVID-19 Lockdown. After a few months, and the country reopening, entered an online coding bootcamp: App Academy.",
    ],
  },
  {
    title: "Life Services Associate",
    company_name: "Bank of America",
    icon: bofa,
    iconBg: "#383E56",
    date: "Jan 2018 - Jan 2020",
    points: [
      "Managed asset transitions from deceased clients to inheriting clients, handling over 40 cases per quarter, which resulted in seamless transfers and enhanced client satisfaction.",
      "Successfully transitioned over $10M in new assets to the firm.",
      "Assisted clients in executing trades and managing securities, providing expert guidance over the phone.",
    ],
  },
  {
    title: "Assistant Loan Underwriter",
    company_name: "Noah Bank",
    icon: noah,
    iconBg: "#FFFEFE",
    date: "May 2017 - December 2017",
    points: [
      "Conducted comprehensive financial analyses to determine customer eligibility based on the bank's risk profile.",
      "Managed and processed over 15 loans totaling $25M, ensuring successful distribution to clients.",
    ],
  },
];

const testimonials = [
  {
    testimonial:
      "Dan stands out for his exceptional energy, remarkable ability to learn quickly, and his dedication to his work. His enthusiasm for taking on new challenges was evident in his eagerness to delve into unfamiliar tasks and technologies.",
    name: "Dustin Swan",
    designation: "FrontEnd & API Lead",
    company: "Visionable Global Inc",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS4lsuc85FysY6SP6_k8m5S23GAAZnGiV35YA&s",
  },
  {
    testimonial:
      "Dan was a critical member of the team and his technical skills, coupled with a genuine interest in staying updated on industry advancements, makes him an excellent software developer.",
    name: "Anthony Martin",
    designation: "CTO",
    company: "Visionable Global Inc",
    image: "https://visionable.com/wp-content/uploads/2021/03/antony.jpg",
  },
];

// const projects = [
//   {
//     name: "Car Rent",
//     description:
//       "Web-based platform that allows users to search, book, and manage car rentals from various providers, providing a convenient and efficient solution for transportation needs.",
//     tags: [
//       {
//         name: "react",
//         color: "blue-text-gradient",
//       },
//       {
//         name: "mongodb",
//         color: "green-text-gradient",
//       },
//       {
//         name: "tailwind",
//         color: "pink-text-gradient",
//       },
//     ],
//     image: carrent,
//     source_code_link: "https://github.com/",
//   },
//   {
//     name: "Job IT",
//     description:
//       "Web application that enables users to search for job openings, view estimated salary ranges for positions, and locate available jobs based on their current location.",
//     tags: [
//       {
//         name: "react",
//         color: "blue-text-gradient",
//       },
//       {
//         name: "restapi",
//         color: "green-text-gradient",
//       },
//       {
//         name: "scss",
//         color: "pink-text-gradient",
//       },
//     ],
//     image: jobit,
//     source_code_link: "https://github.com/",
//   },
//   {
//     name: "Trip Guide",
//     description:
//       "A comprehensive travel booking platform that allows users to book flights, hotels, and rental cars, and offers curated recommendations for popular destinations.",
//     tags: [
//       {
//         name: "nextjs",
//         color: "blue-text-gradient",
//       },
//       {
//         name: "supabase",
//         color: "green-text-gradient",
//       },
//       {
//         name: "css",
//         color: "pink-text-gradient",
//       },
//     ],
//     image: tripguide,
//     source_code_link: "https://github.com/",
//   },
// ];

export { services, technologies, experiences, testimonials };
