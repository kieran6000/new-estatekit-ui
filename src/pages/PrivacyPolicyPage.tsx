import { Box, Typography } from "@mui/material";
import { tokens } from "../theme";

export default function PrivacyPolicyPage() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg, p: 3 }}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
          Privacy Policy
        </Typography>

        <Section title="Who We Are">
          EstateKit provides lead management software for real estate agents and
          agencies. When you fill out a property enquiry form powered by
          EstateKit, the information you provide is shared directly with the
          agent or agency whose form you completed.
        </Section>

        <Section title="Information We Collect">
          We collect the information you voluntarily provide when you submit a
          form, including your name, email address, phone number, and any
          answers to the form questions. We may also collect device and browser
          information, referring URLs, and approximate location for analytics
          purposes.
        </Section>

        <Section title="How We Use Your Information">
          Your contact details are shared with the listed agent or agency so
          they can respond to your property enquiry via phone, email, or SMS.
          Aggregated, non-identifying analytics data may be used to improve our
          service.
        </Section>

        <Section title="Third-Party Services">
          We use the following third-party services to operate:
          {"\n\n"}
          &bull; <strong>Supabase</strong> &ndash; database and authentication
          {"\n"}
          &bull; <strong>PostHog</strong> &ndash; privacy-focused product
          analytics (PII is masked)
          {"\n"}
          &bull; <strong>Vercel</strong> &ndash; hosting
          {"\n"}
          &bull; <strong>TextMeBot</strong> &ndash; WhatsApp OTP delivery
        </Section>

        <Section title="Data Retention">
          Your data is retained for as long as the agent or agency maintains
          their account. You may request deletion of your personal data at any
          time by contacting the agent directly or by emailing us.
        </Section>

        <Section title="Your Rights">
          You have the right to access, correct, or delete your personal data.
          You may also opt out of future communications at any time by replying
          STOP to any message or contacting the agent.
        </Section>

        <Section title="Cookies">
          We use essential cookies for authentication and session management.
          Analytics cookies (PostHog) are used only for identified users with
          PII masked.
        </Section>

        <Section title="Contact">
          If you have questions about this policy, reach out via the "Message
          Us" feature in the EstateKit dashboard.
        </Section>

        <Typography
          sx={{ fontSize: 13, color: "text.disabled", mt: 4, pb: 4 }}
        >
          Last updated: September 2026
        </Typography>
      </Box>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      <Typography
        sx={{ fontSize: 14, color: "text.secondary", lineHeight: 1.7, whiteSpace: "pre-line" }}
      >
        {children}
      </Typography>
    </Box>
  );
}
