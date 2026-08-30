import type { CourseModule } from "../types";

const PLACEHOLDER_EMBED = "https://www.youtube.com/embed/aqz-KE-bpKQ";

// TODO: connect backend — replace with a real course/lessons CMS lookup.
// Static for now: course content doesn't change per-agent or need mock
// editing, unlike leads/setup steps/questions above.
export async function listCourseModules(): Promise<CourseModule[]> {
  return [
    {
      id: "getting-started",
      title: "Getting Started",
      description: "Set up your pipeline and take your first call.",
      thumbnail: "https://i.imgur.com/9TvDhuJ.png",
      freeTier: true,
      lessons: [
        { id: "welcome", title: "Welcome to EstateKit", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "leads-101", title: "How leads reach you", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "first-call", title: "Your first call", youtubeEmbedUrl: PLACEHOLDER_EMBED },
      ],
    },
    {
      id: "buyer-seller-ads",
      title: "Buyer & Seller Ads",
      description: "How your campaign works, end to end.",
      thumbnail: "https://i.imgur.com/q8a1KNu.png",
      freeTier: true,
      lessons: [
        { id: "how-ads-work", title: "How your ads work", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "reading-metrics", title: "Reading your numbers", youtubeEmbedUrl: PLACEHOLDER_EMBED },
      ],
    },
    {
      id: "ads-that-convert",
      title: "Ads That Convert",
      description: "Copy, creative, and targeting that actually works.",
      thumbnail: "https://i.imgur.com/9TvDhuJ.png",
      freeTier: false,
      lessons: [
        { id: "hooks", title: "Hooks that stop the scroll", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "creative", title: "Creative that converts", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "targeting", title: "Targeting the right sellers", youtubeEmbedUrl: PLACEHOLDER_EMBED },
      ],
    },
    {
      id: "closing-the-sale",
      title: "Closing the Sale",
      description: "Scripts and objection handling for the mandate.",
      thumbnail: "https://i.imgur.com/q8a1KNu.png",
      freeTier: false,
      lessons: [
        { id: "scripts", title: "Call scripts that book", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "objections", title: "Handling objections", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "signing", title: "Getting the mandate signed", youtubeEmbedUrl: PLACEHOLDER_EMBED },
      ],
    },
    {
      id: "scaling-your-pipeline",
      title: "Scaling Your Pipeline",
      description: "Run more leads without dropping the ball.",
      thumbnail: "https://i.imgur.com/9TvDhuJ.png",
      freeTier: false,
      lessons: [
        { id: "systems", title: "Systems that scale", youtubeEmbedUrl: PLACEHOLDER_EMBED },
        { id: "team", title: "Bringing on help", youtubeEmbedUrl: PLACEHOLDER_EMBED },
      ],
    },
  ];
}
