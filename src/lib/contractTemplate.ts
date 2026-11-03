// The starter agreement. It's filled in once, when a contract is created, and
// that copy is what the client signs: changing this file never touches a
// contract that already exists.

export interface ContractSection {
  heading: string;
  clauses: string[];
}

export interface ContractDocument {
  title: string;
  provider: string;
  client: string;
  company: string | null;
  summary: { label: string; value: string }[];
  sections: ContractSection[];
}

export interface ContractTerms {
  clientName: string;
  company: string;
  area: string;
  startDate: string; // yyyy-mm-dd
  monthlyFee: number;
  adBudgetPerDay: number | null;
  minimumMonths: number;
  noticeDays: number;
  extraTerms: string;
}

export const CONTRACT_TITLE = "Service Agreement";
const PROVIDER = "EstateKit";

const rand = (n: number) => "R" + n.toLocaleString("en-ZA").replace(/,/g, " ");
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function buildContract(t: ContractTerms): ContractDocument {
  const client = t.clientName.trim();
  const company = t.company.trim() || null;
  const party = company ? `${client} of ${company}` : client;
  const area = t.area.trim();
  const extra = t.extraTerms.trim();

  const summary = [
    { label: "Start date", value: longDate(t.startDate) },
    { label: "Monthly fee", value: `${rand(t.monthlyFee)} a month` },
    ...(t.adBudgetPerDay ? [{ label: "Ad budget", value: `${rand(t.adBudgetPerDay)} a day, paid separately` }] : []),
    { label: "Minimum term", value: months(t.minimumMonths) },
    { label: "Notice to cancel", value: `${days(t.noticeDays)} in writing` },
    ...(area ? [{ label: "Area", value: area }] : []),
  ];

  const sections: ContractSection[] = [
    {
      heading: "The parties",
      clauses: [
        `This agreement is between ${PROVIDER} ("we" or "EstateKit") and ${party} ("you" or "the Client").`,
        `It starts on ${longDate(t.startDate)} and applies from then until it ends under clause 5.`,
      ],
    },
    {
      heading: "What we provide",
      clauses: [
        `We plan, set up and manage Facebook and Instagram advertising to find home sellers and buyers for you${area ? ` in ${area}` : ""}.`,
        "We give you the EstateKit dashboard, where your leads arrive and where you can follow up with them.",
        "We send automatic messages to your leads when you ask us to switch them on, and we report to you on your results.",
      ],
    },
    {
      heading: "What you provide",
      clauses: [
        "You give us the access we reasonably need, including to your Facebook page and advertising account, and keep it in place.",
        "You give us accurate information about yourself, your business and your listings.",
        "You contact your leads promptly. Leads go cold quickly, and our work can't make up for leads that aren't called.",
        "You make sure you're allowed to advertise and sell property, including holding any registration the law requires.",
      ],
    },
    {
      heading: "Fees and payment",
      clauses: [
        `You pay us ${rand(t.monthlyFee)} a month, in advance, from the start date.`,
        t.adBudgetPerDay
          ? `Advertising is paid for separately. The agreed budget is ${rand(t.adBudgetPerDay)} a day. Meta charges it, and it doesn't form part of our fee.`
          : "Advertising is paid for separately. Meta charges it, and it doesn't form part of our fee.",
        "If a payment is late we may pause the service until it's paid. We'll tell you before we do.",
        "We'll give you written notice before any change to our fee. A change doesn't apply during the minimum term.",
      ],
    },
    {
      heading: "Term and cancelling",
      clauses: [
        `The minimum term is ${months(t.minimumMonths)} from the start date. After that, this agreement carries on month to month.`,
        `Either of us can cancel by giving ${days(t.noticeDays)} written notice. WhatsApp and email both count as writing.`,
        "Either of us can cancel immediately if the other seriously breaches this agreement and doesn't fix it within 7 days of being told.",
        "Nothing in this agreement takes away a right you have under the Consumer Protection Act, where that Act applies to you.",
      ],
    },
    {
      heading: "Results",
      clauses: [
        "We work to get you good leads, but we can't promise a number of leads, appointments, mandates or sales. Results depend on the market, your area, the platforms and your follow-up.",
        "Meta can change its rules, prices or decisions about ads at any time. That's outside our control.",
      ],
    },
    {
      heading: "Leads and personal information",
      clauses: [
        "The leads we collect for you are yours to use for your property business.",
        "Each of us will handle personal information lawfully and keep it safe, as the Protection of Personal Information Act requires. We use your leads' information only to provide this service.",
        "We each keep the other's private business information confidential, during this agreement and after it ends.",
      ],
    },
    {
      heading: "Liability",
      clauses: [
        "As far as the law allows, neither of us is liable to the other for indirect loss, such as lost profit or lost commission.",
        "As far as the law allows, our total liability under this agreement is limited to the fees you paid us in the 3 months before the claim arose.",
      ],
    },
    {
      heading: "General",
      clauses: [
        "This is the whole agreement between us about this service. A change only counts if we've both agreed to it in writing.",
        "South African law applies to this agreement.",
        "We each accept electronic signatures. Signing this agreement electronically has the same effect as signing it by hand.",
        "When you sign, we record the date and time, your name and signature, that a code sent to your WhatsApp number was entered, and the device and internet address used. We keep that record as proof of signature, along with a record of when this agreement was opened and read.",
      ],
    },
  ];
  if (extra) sections.push({ heading: "Extra terms agreed", clauses: extra.split(/\n+/).map((l) => l.trim()).filter(Boolean) });

  return { title: CONTRACT_TITLE, provider: PROVIDER, client, company, summary, sections };
}
