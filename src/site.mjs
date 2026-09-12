let publicSiteUrl;
try {
  publicSiteUrl = new URL(process.env.SITE_URL || "https://montlake-pta.github.io/website/");
} catch {
  throw new Error("SITE_URL must be a valid public HTTPS directory URL.");
}
if (publicSiteUrl.protocol !== "https:" || publicSiteUrl.username || publicSiteUrl.password
  || publicSiteUrl.search || publicSiteUrl.hash || !publicSiteUrl.pathname.endsWith("/")) {
  throw new Error("SITE_URL must be an HTTPS directory URL without credentials, query or fragment.");
}

export const site = {
  name: "Montlake PTA",
  previewUrl: publicSiteUrl.href,
  newsletterUrl: "https://lp.constantcontactpages.com/sl/tG8wj2x/MontlakeSignUp",
  membershipUrl: "https://montlakepta.givebacks.com/store",
  donateUrl: "https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN",
  friendsUrl: "https://lp.constantcontactpages.com/su/5wEdUw1/MontlakeFriends",
  schoolReportUrl: "https://reportcard.ospi.k12.wa.us/ReportCard/ViewSchoolOrDistrict/101083",
  schoolIntroduction: "Montlake Elementary is a small neighborhood school known for its garden and art programs and its Extended Resource Special Education program. Dedicated teachers and support staff help students learn and belong.",
  navigation: [
    { label: "New families", slug: "welcome-new-families" },
    { label: "Calendar", slug: "calendar" },
    { label: "Enrichment", slug: "enrichment" },
    { label: "News", slug: "blog" },
    { label: "Newsletter", slug: "newsletter" },
    { label: "PTA Board", slug: "pta-board" },
    { label: "Join", slug: "join" },
  ],
};

const legacyCollectionSlugs = [
  "all-products", "2025-art-walk-spring-concert", "24-25-welcome-pizza-party-raffle",
  "25-26-welcome-party-raffle", "evergreens", "holiday-night-market",
  "islandwood", "spring-auction-fundraiser",
];

// Preserve already-published addresses without exporting hidden Store records.
export function preserveCollectionRoutes(contentPages) {
  const routes = new Set(contentPages.map((page) => page.slug));
  return [...contentPages, ...legacyCollectionSlugs
    .map((slug) => `category/${slug}`)
    .filter((slug) => !routes.has(slug))
    .map((slug) => ({
      slug,
      title: "Seasonal collection",
      heading: "Explore current PTA products.",
      description: "Find public products and seasonal fundraisers in the PTA shop.",
      accent: "yellow",
      content: '<p>There is no public collection listing at this address right now. Visit the <a href="../../shop/">PTA shop</a> for current products and availability.</p>',
    }))];
}

export const transactionPages = [
  {
    slug: "cart",
    title: "Your cart",
    heading: "Your PTA shop cart.",
    description: "Review your items and continue to secure checkout.",
    accent: "blue",
    content: '<div class="transaction-panel" data-wix-cart><p role="status" data-transaction-loading>Loading your cart…</p><noscript><p>JavaScript is needed to manage your cart. For help, email <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a>.</p></noscript></div>',
  },
  {
    slug: "checkout/complete",
    title: "Checkout status",
    heading: "Your checkout status.",
    description: "Find confirmation and next steps for your checkout.",
    accent: "blue",
    content: '<div class="transaction-panel" data-wix-confirmation><p role="status" data-transaction-loading>Checking your checkout status…</p><noscript><p>Check the confirmation email from the payment or registration provider for your completed order. This page alone is not proof of payment.</p></noscript></div>',
  },
];

export function preserveRetiredProductRoutes(contentPages) {
  const routes = new Set(contentPages.map((page) => page.slug));
  return [...contentPages, ...["islandwood-donation", "islandwood-bake-sale"]
    .map((slug) => `product-page/${slug}`)
    .filter((slug) => !routes.has(slug))
    .map((slug) => ({
      slug,
      title: "Islandwood fundraiser item",
      heading: "This fundraiser item is no longer available.",
      description: "Find background on the Islandwood fundraiser and contact the PTA about current opportunities.",
      accent: "blue",
      content: '<p>This item is not currently available in the public store. Read the <a href="../../post/key-events-for-5th-grade-islandwood-parent-night-out-walk-a-thon-bake-sale-details/">2026 Islandwood fundraising information</a> for background, or contact <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a> about current opportunities.</p><p>For other items, <a href="../../shop/">browse the PTA shop</a>. A general PTA gift is not automatically designated for Islandwood.</p>',
    }))];
}

export const pages = [
  {
    slug: "",
    title: "Home",
    description: "Montlake PTA brings families, educators, and neighbors together to help every student learn, belong, and thrive.",
    home: true,
  },
  {
    slug: "fifth-grade-promotion",
    title: "Fifth Grade Promotion",
    heading: "Fifth grade promotion.",
    description: "Information about the June 16, 2026 celebration and how to contact the PTA.",
    accent: "blue",
    content: `
      <p class="lead">The 2026 fifth grade promotion celebration took place on June 16 at Montlake Elementary.</p>
      <div class="callout"><strong>Past event.</strong> These details describe the 2026 celebration, not the next school year’s promotion plans.</div>
      <h2>The 2026 celebration</h2>
      <ul>
        <li><strong>Date:</strong> June 16, 2026.</li>
        <li><strong>Time:</strong> 5:00–8:00 PM.</li>
        <li><strong>Location:</strong> Montlake Elementary, 2025 E Calhoun St, Seattle, WA 98112.</li>
      </ul>
      <p><a class="button button-primary" href="../event-details/5th-grade-promotion/">Read the 2026 event details</a></p>
      <h2>Questions for the PTA</h2>
      <p>For questions about promotion celebrations or future plans, email <a href="mailto:events@montlakepta.org">events@montlakepta.org</a>. The PTA can help direct your question to the right person.</p>`,
  },
  {
    slug: "welcome-new-families",
    title: "New Families",
    heading: "Welcome to Montlake.",
    kicker: "Your family’s field guide",
    description: "The essential people, dates, programs, and links for a confident start at Montlake Elementary.",
    accent: "blue",
    content: `
      <p class="lead">We’re so glad you’re here. Montlake is a small neighborhood school known for academic excellence, garden and art programs, and an active, welcoming community.</p>
      <div class="callout"><strong>Have a new-family question?</strong> Email <a href="mailto:outreach@montlakepta.org?subject=New%20Family%20Question">outreach@montlakepta.org</a>. Incoming Kindergarten families can also <a href="https://forms.cloud.microsoft/r/Y9vi39Kxbq">register for Kindergarten Transition</a>.</div>

      <h2>The school day</h2>
      <h3>Bell hours</h3>
      <ul>
        <li>7:55 AM–2:25 PM on Monday, Tuesday, Thursday, and Friday</li>
        <li>7:55 AM–1:10 PM on Wednesday for early release</li>
      </ul>
      <p>See the district’s <a href="https://www.seattleschools.org/resources/bell-schedules/">current bell schedules</a> for updates.</p>

      <h3>After-school care</h3>
      <p><a href="https://launchlearning.org/enrollment/">Launch Learning</a> provides onsite care from dismissal until approximately 6:00 PM. The PTA also runs <a href="../enrichment/">after-school enrichment</a> each trimester, with classes generally ending between 3:30 and 4:00 PM, or earlier on Wednesdays.</p>
      <p>Other nearby providers include:</p>
      <ul class="card-list">
        <li><strong><a href="https://kidsclubafterschool.org/">Kids Club at Stevens</a></strong><br>1242 18th Ave E<br>(206) 523-6351</li>
        <li><strong><a href="https://positiveplace.org/clubs/lowell-elementary/">Boys & Girls Club at Lowell</a></strong><br>1058 E Mercer Street<br>(206) 531-5738</li>
        <li><strong><a href="https://www.kidscompany.org/site_locations/tops/">Kids Co at TOPS</a></strong><br>2500 Franklin Ave E<br>(206) 709-8487</li>
        <li><strong><a href="https://anc.apm.activecommunities.com/seattle/daycare/program/856?onlineSiteId=0&from_original_cui=true&online=true">Montlake CC at McGilvra</a></strong><br>1617 38th Ave E<br>(206) 684-4736</li>
      </ul>

      <h2>Stay connected</h2>
      <p>The PTA sends a weekly newsletter each Tuesday with updates from school leadership, specialist teachers, and the PTA. The school cannot share family contact information with us, so please <a href="https://lp.constantcontactpages.com/sl/tG8wj2x/MontlakeSignUp">subscribe directly</a>.</p>

      <h2>Kindergarten resources</h2>
      <h3>First day</h3>
      <p>For 2026–27, Kindergarten begins Tuesday, September 8, 2026. Students in grades 1–5 begin September 2. Check the <a href="https://www.seattleschools.org/news/school-calendar/#g3615a989e31d">district academic calendar</a> for full details.</p>
      <h3>Meet other incoming families</h3>
      <p>Email <a href="mailto:kelsey@montlakepta.org?subject=Incoming%20K%20Family">kelsey@montlakepta.org</a> with caregiver and student names to join the incoming-family list. Summer meetups are casual, require no RSVP, and are shared through that list and the newsletter.</p>
      <h3>Kindergarten Transition</h3>
      <p>This welcoming, low-pressure program helps incoming students meet peers and teachers, explore the building, and get comfortable at school. The 2026–27 sessions are August 25 and 26, from 9:00 AM–12:00 PM. <a href="https://forms.cloud.microsoft/r/Y9vi39Kxbq">Register online</a>.</p>

      <h2>Volunteer at school</h2>
      <p>All volunteers must be cleared by Seattle Public Schools, which can take several weeks. Start with the <a href="https://www.seattleschools.org/departments/volunteer/">SPS volunteer application</a>. For room-parent and classroom opportunities, contact your teacher or <a href="mailto:volunteer@montlakepta.org">volunteer@montlakepta.org</a>.</p>

      <h2>Accounts and key contacts</h2>
      <ul>
        <li><strong>Report an absence:</strong> email <a href="mailto:montlake.attendance@seattleschools.org">montlake.attendance@seattleschools.org</a> and your child’s teacher.</li>
        <li><strong>Grades and records:</strong> use <a href="https://www.seattleschools.org/student-portal/technology-supports-for-families/source/">The Source</a>.</li>
        <li><strong>Meals:</strong> manage funds with <a href="https://www.myschoolbucks.com/ver2/getmain?requestAction=home">MySchoolBucks</a> and review <a href="https://www.seattleschools.org/departments/culinary-services/">Culinary Services</a>.</li>
        <li><strong>Enrollment:</strong> begin at the <a href="https://www.seattleschools.org/enroll/">SPS enrollment site</a>. Families outside the attendance area should review <a href="https://www.seattleschools.org/enroll/find-your-school/school-choice/">School Choice</a>.</li>
      </ul>`,
  },
  {
    slug: "newsletter",
    title: "Newsletter",
    heading: "The weekly Montlake newsletter.",
    kicker: "Stay connected",
    description: "Read the latest Tuesday newsletter, browse past editions, and sign up to receive future updates.",
    accent: "blue",
    disableOutline: true,
    content: `
      <p class="lead">The newsletter archive will appear here.</p>
      <p><a class="button button-primary" href="https://lp.constantcontactpages.com/sl/tG8wj2x/MontlakeSignUp">Sign up for the newsletter</a></p>`,
  },
  {
    slug: "calendar",
    title: "Calendar",
    heading: "Keep the whole school year in view.",
    kicker: "Dates & events",
    description: "The live Montlake calendar for school dates, PTA meetings, and community events.",
    accent: "yellow",
    calendarEmbedUrl: "https://calendar.google.com/calendar/embed?src=c_85551f0d8214f96fbf6bb14c67224de93550a0d69a65773fc3b80597196de3cb%40group.calendar.google.com&ctz=America%2FLos_Angeles",
    content: `
      <p class="lead">This calendar stays connected to the PTA’s existing Google Calendar, so updates appear here automatically.</p>
      <p><a class="button button-primary" href="https://calendar.google.com/calendar/ical/c_85551f0d8214f96fbf6bb14c67224de93550a0d69a65773fc3b80597196de3cb%40group.calendar.google.com/public/basic.ics">Add to your calendar</a></p>`,
  },
  {
    slug: "event-list",
    title: "Events",
    heading: "Gather, celebrate, and pitch in.",
    kicker: "Community events",
    description: "Find upcoming Montlake Elementary and PTA events on the live community calendar.",
    accent: "coral",
    content: `
      <p class="lead">From family meetups and performances to fundraisers and community conversations, our events are a chance to connect beyond the school-day rush.</p>
      <div class="callout"><strong>Looking for the latest dates?</strong> Our rebuilt site uses the existing live Google Calendar so schedules stay in sync.</div>
      <p><a class="button button-primary" href="../calendar/">Open the live calendar</a></p>
      <h2>Help make an event happen</h2>
      <p>Most PTA events are powered by family volunteers. If you have an idea or can offer time, supplies, or professional skills, email <a href="mailto:events@montlakepta.org">events@montlakepta.org</a>.</p>`,
  },
  {
    slug: "shop",
    title: "Shop",
    heading: "Seasonal fundraisers and school creations.",
    kicker: "Montlake PTA shop",
    description: "Browse current and recent PTA products managed by the school community.",
    accent: "yellow",
    content: `
      <p class="lead">The PTA shop changes throughout the year.</p>
      <div class="callout">There are no products listed right now. Check the weekly newsletter for new seasonal fundraisers.</div>`,
  },
  {
    slug: "enrichment",
    title: "Enrichment",
    heading: "After-school enrichment",
    kicker: "After-school programs",
    description: "Register for classes, prepare for the first day, and plan a safe pickup.",
    accent: "coral",
    outlineAfterIntro: true,
    content: `
      <p><a class="button button-primary" href="https://www.6crickets.com/schools/US/WA/Seattle/Montlake-Elementary-School/147">View classes and register on 6crickets</a></p>
      <div class="callout">
        <p><strong>Day-of help, absences, or pickup changes:</strong> Contact the Enrichment Coordinator at <a href="mailto:enrichcoordinator@montlakepta.org">enrichcoordinator@montlakepta.org</a>, or call/text <a href="tel:+12064866036">(206) 486-6036</a> during enrichment hours.</p>
        <p>Please do not contact the school office about enrichment arrangements; the program is managed by the Enrichment Team.</p>
      </div>
      <p><strong>For the current session:</strong> Check class listings and your registration confirmation for dates, no-class days, fees, and dismissal times. If the next session is not listed, contact the <a href="mailto:enrichment@montlakepta.org">Enrichment Team</a>; do not use a previous session’s dates to plan care.</p>
      <p>Learning does not stop when the bell rings. PTA-supported enrichment sparks curiosity, builds friendships across grades, and gives students a safe, inclusive place to learn beyond the classroom.</p>

      <h2>Register</h2>
      <p>All enrichment registrations are managed through <a href="https://www.6crickets.com/schools/US/WA/Seattle/Montlake-Elementary-School/147">6crickets</a>. After registering, you will receive a confirmation email directly from 6crickets.</p>
      <p>Before registering:</p>
      <ul>
        <li>Create or update your student’s profile.</li>
        <li>Confirm their grade level and dismissal plans.</li>
        <li>Update allergies, homeroom teacher, and any other relevant notes.</li>
        <li>Review each class description and schedule.</li>
      </ul>
      <h3>Costs and financial assistance</h3>
      <p>Class prices vary by the number of days, provider, and curriculum. Each transaction also includes management fees that help cover the onsite coordinator, financial aid, and other program costs.</p>
      <p>We want every student to have access to enrichment. Scholarships are available. For confidential help, contact the school counselor at <a href="mailto:meguerreroto@seattleschools.org?subject=Enrichment%20scholarship">meguerreroto@seattleschools.org</a>.</p>

      <h2>Before class</h2>
      <ul>
        <li>Remind your student which class they are attending each day.</li>
        <li>Review where they should go at school dismissal.</li>
        <li>Discuss behavior expectations and the <a href="../assets/documents/enrichment-positive-behavior-support-plan.pdf">Positive Behavior Support Plan (PDF)</a>.</li>
        <li>Pack an extra snack for the short snack break before class.</li>
      </ul>

      <h2>Getting to class</h2>
      <p>Teachers and the Enrichment Coordinator help guide transitions. A morning reminder from you helps your student feel prepared.</p>
      <ol>
        <li>Go to the Commons area and line up behind the sign for the enrichment class.</li>
        <li>Check in with the instructor, who will take attendance.</li>
        <li>Follow the instructor to the classroom.</li>
      </ol>

      <h2>Pickup</h2>
      <p>Pickup times vary by class and day. Consult your student’s schedule and confirm their dismissal plan before the first class.</p>
      <ul>
        <li><strong>Parent or caregiver pickup:</strong> Students are dismissed from the southeast garden gate. See the <a href="../assets/documents/enrichment-pickup-map.pdf">campus aerial map (PDF)</a>. Be prepared to show identification until instructors recognize you.</li>
        <li><strong>Independent walkers:</strong> Email written permission in advance to the coordinator. Students must leave campus immediately after enrichment.</li>
        <li><strong>Launch students:</strong> Students are escorted directly to Launch aftercare when class ends.</li>
        <li><strong>Let Grow Play Club:</strong> Students transition directly to the club after enrichment.</li>
      </ul>
      <h3>Late or early pickup</h3>
      <p>Email <a href="mailto:enrichcoordinator@montlakepta.org?subject=Pickup%20changes">pickup changes to the coordinator</a> in advance, or call/text <a href="tel:+12064866036">(206) 486-6036</a> during enrichment hours. Please do not contact the school office about pickup changes.</p>
      <p>The published pickup policy sends students who have not been picked up within 10 minutes of class dismissal to Let Grow Play Club; the standard drop-in fee may apply. It requires all students to be picked up by 5:30 PM, with late fees that may increase the longer a student remains onsite. Confirm the current cutoff and fees with the coordinator before your student’s first class.</p>

      <h2>Absences and cancellations</h2>
      <h3>If your student will miss class</h3>
      <p><a href="mailto:enrichcoordinator@montlakepta.org?subject=Enrichment%20absence">Email the Enrichment Coordinator</a> even if your student is absent from school that day. Students may not skip enrichment unless permission has been received from a parent or caregiver.</p>
      <h3>If a class is canceled</h3>
      <p>Have a backup pickup plan in case an instructor is absent and class is canceled. The Enrichment Coordinator will work with the front office to notify families promptly so they can adjust pickup plans.</p>

      <h2>Policies</h2>
      <p>Students are expected to follow the same behavior standards as during the school day, respecting themselves, others, and school spaces. Review the <a href="../assets/documents/enrichment-positive-behavior-support-plan.pdf">Positive Behavior Support Plan (PDF)</a> together before the first class.</p>
      <p>Parents and caregivers help the program run smoothly by knowing the class schedule and pickup location, arriving on time or arranging alternate pickup, communicating absences and schedule changes, and helping students arrive ready to participate.</p>

      <h2>Help</h2>
      <p><strong>Program, policy, or general questions:</strong> <a href="mailto:enrichment@montlakepta.org">enrichment@montlakepta.org</a>.</p>
      <p><strong>Absences, pickup changes, and day-of questions:</strong> The published program contact is Cindy, Enrichment Coordinator, at <a href="mailto:enrichcoordinator@montlakepta.org">enrichcoordinator@montlakepta.org</a> or <a href="tel:+12064866036">(206) 486-6036</a>.</p>
      <p><strong>Scholarships:</strong> The published school counselor contact is Mr. Max at <a href="mailto:meguerreroto@seattleschools.org?subject=Enrichment%20scholarship">meguerreroto@seattleschools.org</a>.</p>
      <p>Staff assignments and session arrangements can change. Use these role-based contacts to confirm current information. The school office does not manage the enrichment program.</p>`,
  },
  {
    slug: "advocacy",
    title: "Advocacy",
    heading: "Learn. Speak up. Shape what’s next.",
    kicker: "Every voice matters",
    description: "Learn about policies affecting students and take practical action for strong, equitable public schools.",
    accent: "blue",
    content: `
      <p class="lead">Montlake families have a powerful opportunity to understand the policies affecting students and advocate for leaders and solutions that help every child thrive.</p>
      <p>Questions, ideas, or ready to get involved? Email <a href="mailto:advocacy@montlakepta.org">advocacy@montlakepta.org</a>.</p>

      <h2>Our advocacy principles</h2>
      <ol>
        <li>We advocate for evidence-based solutions that enable schools and systems to provide quality education, safe environments, and other resources to enable all students to learn, feel included and thrive.</li>
        <li>We believe decisionmakers must provide specific details and plans for both short- and long-term changes well in advance of any choice being made so that impacted communities can effectively digest the breadth of information and collaborate in the implementation of said plans. We believe everyone would benefit from longer term planning spanning 5 to 10 years into the future.</li>
        <li>We support fact, research-based and neurodiversity-affirming decisions that enhance, grow and uplift all diverse facets of learning including special education, advanced learning and multilingual opportunities.</li>
        <li>We support robust, comprehensive and meaningful after school care that is available to all who need it.</li>
        <li>We support minimizing disruption to student learning and existing individual communities.</li>
        <li>We support seeking opportunities for gradual change aimed at enhancing equity and diversity across the greater community.</li>
        <li>We advocate for better and smarter financial responsibility at the district level as well as better and smarter financial support for schools at the state level.</li>
      </ol>

      <h2>Learn</h2>
      <ul>
        <li><a href="https://www.rainydayrecess.org/">Rainy Day Recess</a> covers Seattle Public Schools news and policy.</li>
        <li>Washington State PTA offers <a href="https://www.wastatepta.org/focus-areas/advocacy/">advocacy guidance</a> and <a href="https://www.wastatepta.org/focus-areas/advocacy/advocacy-legislative-resources/">legislative resources</a>.</li>
        <li><a href="https://www.seattletimes.com/education-lab/">Seattle Times Education Lab</a> reports on local education.</li>
        <li><a href="https://www.alltogetherforseattleschools.org/home/resources">All Together for Seattle Schools</a> shares district and state-funding resources.</li>
      </ul>

      <h2>Act</h2>
      <p>Quick actions—sending a message, registering support for a bill, or responding to an alert—can have a real effect when families participate together.</p>
      <ul>
        <li>Review current <a href="https://www.wastatepta.org/focus-areas/advocacy/action-alerts/">WSPTA Action Alerts</a>.</li>
        <li>Learn about the <a href="https://www.billiondollarbakesalewa.com/">Billion Dollar Bake Sale</a> campaign.</li>
        <li>Email our advocacy lead for the highest-impact opportunities right now.</li>
      </ul>
      <h2>School planning updates</h2>
      <p>When Montlake PTA becomes aware of new, specific proposals for school closures or consolidations, we will alert families by email and in the newsletter. We will also share opportunities to respond.</p>
      <p>For current proposals and action opportunities, <a href="../newsletter/">sign up for the newsletter</a> or email <a href="mailto:advocacy@montlakepta.org">advocacy@montlakepta.org</a>. Past school-year discussions are not a statement of current district plans.</p>`,
  },
  {
    slug: "join",
    title: "Join the PTA",
    heading: "Add your voice to ours.",
    kicker: "Membership",
    description: "Become a voting member and strengthen the network supporting Montlake students and families.",
    accent: "yellow",
    content: `
      <p class="lead">PTA membership builds a stronger Montlake community and gives you voting privileges on the annual budget and other key decisions.</p>
      <p>Membership is renewed each school year. When you join Montlake PTA, you also become part of Washington State PTA and National PTA—adding your voice to families advocating for children across the state and country.</p>
      <div class="callout"><strong>Annual rates</strong><br>$20 for an individual membership · $35 for a double membership</div>
      <p><a class="button button-primary" href="https://montlakepta.givebacks.com/store">Join through Givebacks</a></p>
      <h2>Membership should never be a barrier</h2>
      <p>You may join free of charge for any reason. Contact us confidentially at <a href="mailto:president@montlakepta.org?subject=PTA%20Membership">president@montlakepta.org</a>.</p>`,
  },
  {
    slug: "donate",
    title: "Donate",
    heading: "Invest in a stronger school day.",
    kicker: "Give to Montlake",
    description: "Make a one-time or recurring gift, request an employer match, or donate by check.",
    accent: "coral",
    layout: "fundraising",
    disableOutline: true,
    campaignStatus: "evergreen",
    schoolYear: "",
    goalAmount: null,
    deadline: "",
    primaryCtaLabel: "Donate securely online",
    primaryCtaUrl: "https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN",
    heroImage: "https://montlake-pta.github.io/website/assets/donate-science-fair.jpg",
    heroAlt: "Student science projects displayed in the Montlake Elementary cafeteria",
    heroCaption: "Community support helps students learn, create, perform, and belong.",
    impactBody: `
      <h2>Your gift moves through the whole school day.</h2>
      <p>PTA funding fills practical gaps and makes more of the Montlake experience possible.</p>
      <ul>
        <li><strong>75–80%</strong><div><h3>Staffing support</h3><p>The largest share of the PTA budget helps fund people and services not fully covered by the district.</p></div></li>
        <li><strong>All year</strong><div><h3>Student experiences</h3><p>Art, music, academic support, enrichment, supplies, library books, equipment, and special projects.</p></div></li>
        <li><strong>Every family</strong><div><h3>Access and belonging</h3><p>Scholarships, welcoming events, family support, and resources that help everyone participate.</p></div></li>
      </ul>
      <p><a href="../budget/">See how the budget works</a></p>`,
    equityBody: `
      <h2>Giving is welcome. Belonging is not conditional.</h2>
      <p>Every Montlake family is a full member of this community, regardless of whether or how much they donate. PTA support also includes scholarships and equity support for schools with fewer fundraising resources.</p>
      <p><a href="mailto:fundraising@montlakepta.org">Questions about giving or matching?</a></p>`,
    trustBody: `
      <p>Montlake Community School Association (Montlake PTA) is an IRS-approved 501(c)(3) nonprofit.</p>
      <p><strong>Federal Tax ID 91-1117733</strong></p>
      <p>Your donation is tax-deductible to the extent allowed by law.</p>`,
    content: `
      <p class="lead">Your gift helps fund staffing, student programs, classroom needs, community events, scholarships, and equipment.</p>
      <h2>Ways to give</h2>
      <p>Every method supports the same school community. Employer matching can make a gift or volunteer time go even further.</p>
      <h3>Recurring or one-time online gifts</h3>
      <p>Choose a one-time gift or smaller automatic monthly gifts by credit card or bank account. Recurring contributions help the PTA plan reliably throughout the school year.</p>

      <h3>Employer matching</h3>
      <p>Many employers—including Google, Microsoft, Apple, Symetra, and Alaska Airlines—match donations through <a href="https://benevity.com/">Benevity</a> or another giving portal. Some employers also match volunteer hours. Contact your HR team, or email <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a> if the PTA needs to verify your gift.</p>

      <h3>Check</h3>
      <p>Checks avoid processing fees. Send a check in an envelope marked “Montlake PTA Annual Fund” through backpack mail, or mail it to:</p>
      <p><strong>Montlake PTA Annual Fund<br>520 Ravenna Blvd NE<br>Seattle, WA 98105</strong></p>`,
  },
  {
    slug: "annual-fund",
    title: "Annual Fund",
    heading: "A strong start. Support that lasts all year.",
    kicker: "Annual giving",
    description: "Our fall giving campaign brings families and neighbors together to support Montlake students.",
    accent: "coral",
    layout: "fundraising",
    campaignStatus: "upcoming",
    schoolYear: "",
    goalAmount: null,
    deadline: "",
    primaryCtaLabel: "",
    primaryCtaUrl: "",
    heroImage: "",
    heroAlt: "",
    heroCaption: "",
    impactBody: "",
    equityBody: "",
    trustBody: "",
    content: `
      <p class="lead">The Annual Fund is Montlake PTA’s fall giving campaign. Families, friends, and neighbors help support the school day through direct gifts and employer matching.</p>
      <p>Dates, a goal, and giving instructions for the next campaign have not been announced here. You can still support Montlake through our <a href="../donate/">year-round giving options</a>.</p>
      <h2>What your support makes possible</h2>
      <p>PTA fundraising supports staffing, student programs, classroom needs, scholarships, and community events. Read <a href="../budget/">how the PTA budget works</a> for funding context and budget contacts.</p>
      <h2>Choose the way that works for your family</h2>
      <p>One-time and recurring gifts, employer matching, and checks are welcome. Find current payment and mailing instructions on our <a href="../donate/">Donate page</a>. Ask your employer whether it matches donations or volunteer hours.</p>
      <p>Every family belongs, whether or not they make a financial gift. Questions about giving or a fund designation? Email <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a>.</p>
      <h2>Past campaigns and spring giving</h2>
      <p>The <a href="../fall-fundraiser-2025/">Fall 2025 campaign archive</a> preserves that campaign’s dates, goals, and funded programs. Those figures are historical, not an announcement for the next campaign.</p>
      <p>The <a href="../spring-auction/">Spring Auction</a> is another way our community supports the school.</p>`,
  },
  {
    slug: "budget",
    title: "Budget",
    heading: "Transparent support for what students need.",
    kicker: "Where funds go",
    description: "See how community fundraising supports staffing, student programs, events, supplies, and school equipment.",
    accent: "blue",
    content: `
      <p class="lead">Each year, Montlake PTA raises funds from our community to support Montlake Elementary.</p>
      <h2>Staffing is the biggest investment</h2>
      <p>The school staffing grant typically represents 75–80% of the PTA budget. It helps fund positions or services not fully covered by Seattle Public Schools, such as a specialist teacher, counselor support, playground supervision, or other operational needs.</p>
      <h2>Beyond staffing</h2>
      <p>PTA funds also support student programs, community events, supplies, scholarships, and school equipment. Budget decisions are voted on by PTA members.</p>
      <p>In February 2026, families shared their priorities for PTA funding. Read the <a href="../post/montlake-pta-family-survey-results/">family survey results</a> to see that feedback.</p>
      <div class="callout"><strong>Want a voice in the annual budget?</strong> <a href="../join/">Join the PTA</a> to become a voting member.</div>
      <p>Questions about finances can be sent to <a href="mailto:treasurer@montlakepta.org">treasurer@montlakepta.org</a>.</p>`,
  },
  {
    slug: "pta-board",
    title: "PTA Board",
    heading: "Meet your volunteer board.",
    kicker: "About the PTA",
    description: "Connect with the 2026–27 Montlake PTA officers and committee leads.",
    accent: "yellow",
    content: `
      <p class="lead">The PTA board coordinates fundraising, programs, events, advocacy, family outreach, and more. Reach out directly—we welcome your ideas and involvement.</p>
      <ul class="card-list">
        <li><strong>Co-Presidents</strong><br>Kari Frame & Cailyn Spurrell<br><a href="mailto:president@montlakepta.org">president@montlakepta.org</a></li>
        <li><strong>Vice President</strong><br>Harold Pratt<br><a href="mailto:president@montlakepta.org">president@montlakepta.org</a></li>
        <li><strong>Secretary</strong><br>Andrea Gimse<br><a href="mailto:secretary@montlakepta.org">secretary@montlakepta.org</a></li>
        <li><strong>Co-Treasurers</strong><br>Liana Bowlin & Avery Caldwell<br><a href="mailto:treasurer@montlakepta.org">treasurer@montlakepta.org</a></li>
        <li><strong>Communications</strong><br>Ashley Kavanaugh & Lana Stojcic<br><a href="mailto:communications@montlakepta.org">communications@montlakepta.org</a></li>
        <li><strong>Advocacy</strong><br>Kelsey Miller<br><a href="mailto:advocacy@montlakepta.org">advocacy@montlakepta.org</a></li>
        <li><strong>Fundraising</strong><br>Kelsey Miller & Ewa Sack<br><a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a></li>
        <li><strong>Volunteers</strong><br>Alicia Romano<br><a href="mailto:volunteer@montlakepta.org">volunteer@montlakepta.org</a></li>
        <li><strong>Outreach</strong><br>Britt Burritt<br><a href="mailto:outreach@montlakepta.org">outreach@montlakepta.org</a></li>
        <li><strong>Events</strong><br>Megan McGiffin<br><a href="mailto:events@montlakepta.org">events@montlakepta.org</a></li>
        <li><strong>Special Education, Diversity & Inclusion</strong><br>Ana Dueñas<br><a href="mailto:sped@montlakepta.org">sped@montlakepta.org</a></li>
        <li><strong>BLT Representatives</strong><br>Tom Burritt & Ben Vaught<br><a href="mailto:blt@montlakepta.org">blt@montlakepta.org</a></li>
        <li><strong>After-School Enrichment</strong><br>Diana Bitenas<br><a href="mailto:enrichment@montlakepta.org">enrichment@montlakepta.org</a></li>
      </ul>
      <h2>Join the work</h2>
      <p>Professional experience is welcome but never required. If you can help with accounting, communications, event planning, fundraising, graphic design, outreach, or simply getting things done, email <a href="mailto:president@montlakepta.org">president@montlakepta.org</a>.</p>`,
  },
  {
    slug: "special-education",
    title: "Special Education",
    heading: "Resources for every kind of learner.",
    kicker: "Support & inclusion",
    description: "Starting points for special education screening, district services, family guidance, and community support.",
    accent: "blue",
    content: `
      <p class="lead">Families who think their child may need special education services can contact <a href="https://www.seattleschools.org/departments/early-learning/child-find/">Child Find</a> for screening and next steps.</p>
      <h2>Seattle Public Schools resources</h2>
      <ul>
        <li><a href="https://www.seattleschools.org/departments/special-education/">Special Education department</a></li>
        <li><a href="https://www.seattleschools.org/departments/early-learning/early-childhood-special-education/">Early Childhood Special Education</a></li>
        <li><a href="https://www.seattleschools.org/departments/special-education/bridges/">BRIDGES transition program</a> for young adults</li>
      </ul>
      <h2>Family-to-family support</h2>
      <p>The <a href="https://seattlespecialeducationptsa.org/">Seattle Special Education PTSA</a> offers advocacy, connection, and a detailed <a href="https://seattlespecialeducationptsa.org/resources/guide-to-special-education/">Guide to Special Education</a>.</p>
      <p>For Montlake-specific questions or to help strengthen inclusion, contact <a href="mailto:sped@montlakepta.org">sped@montlakepta.org</a>.</p>`,
  },
  {
    slug: "spring-auction",
    title: "Spring Auction",
    heading: "Bid bright. Build what’s next.",
    kicker: "Annual fundraiser",
    description: "The spring auction supports essential staffing, student programs, scholarships, and community-building events.",
    accent: "coral",
    layout: "fundraising",
    campaignStatus: "closed",
    schoolYear: "2025–2026",
    goalAmount: 125000,
    deadline: "",
    primaryCtaLabel: "",
    primaryCtaUrl: "",
    heroImage: "",
    heroAlt: "",
    heroCaption: "",
    impactBody: "",
    equityBody: "",
    trustBody: "",
    content: `
      <p class="lead">Our spring auction brings the community together around experiences, local businesses, and a shared goal: strong support for Montlake students.</p>
      <p><a class="button button-primary" href="https://montlakepta.schoolauction.net/2026auction/catalog">Browse the 2026 auction catalog</a></p>
      <h2>Where the dollars go</h2>
      <p>The 2026 goal was $125,000 through auction purchases and direct gifts. Most fundraising supports the Montlake Elementary staffing grant, including essential programs such as art and music, academic intervention, and office support.</p>
      <p>PTA funds also provide student scholarships, equity support for schools with fewer fundraising resources, and community events including the Art Walk and fall welcome.</p>
      <h2>The 2025–2026 spending plan</h2>
      <p>The published chart below describes the 2025–2026 plan, not a confirmed budget for the current school year. Percentages are rounded.</p>
      <figure>
        <img src="https://static.wixstatic.com/media/0834d6_dc381b37e9ab455daed371f54dd0c561~mv2.png" alt="2025–2026 spending chart: the staffing grant accounts for 70 percent. Full figures follow." width="649" height="411" loading="lazy">
        <figcaption>Where Your PTA Dollars Go (2025–2026).</figcaption>
      </figure>
      <ul>
        <li><strong>Staffing Grant:</strong> $197,202 (70%).</li>
        <li><strong>Community Needs:</strong> $29,000 (10%).</li>
        <li><strong>Fundraising Costs:</strong> $22,625 (8%).</li>
        <li><strong>Programs &amp; Outreach:</strong> $12,075 (4%).</li>
        <li><strong>Supplies:</strong> $10,900 (4%).</li>
        <li><strong>PTA Admin:</strong> $8,785 (3%).</li>
        <li><strong>Enrichment:</strong> $1,900 (1%).</li>
      </ul>
      <p>For the current approved budget and allocation definitions, contact <a href="mailto:treasurer@montlakepta.org">treasurer@montlakepta.org</a>. Historical shares should not be applied to a different school year.</p>
      <div class="callout">Auction links are seasonal. If the catalog is closed, <a href="../donate/">direct donations</a> continue to support the same mission.</div>`,
  },
  {
    slug: "fall-fundraiser-2025",
    title: "Fall Fundraiser",
    heading: "The Fall 2025 fundraiser.",
    kicker: "Annual giving",
    description: "The goals and programs behind the 2025 campaign, with ways to support Montlake today.",
    accent: "yellow",
    content: `
      <p class="lead">The Fall 2025 campaign set a $125,000 goal to support Montlake Elementary staffing, programs, and community needs.</p>
      <div class="callout"><strong>Past campaign: October 20–November 21, 2025.</strong> The figures and plans below describe that campaign, not a current-year budget or fundraising deadline. Visit <a href="../donate/">ways to give</a> to support Montlake today.</div>
      <h2>What the 2025 campaign supported</h2>
      <p>The campaign described approximately $1,500 in annual PTA support per student and identified these funded positions and programs:</p>
      <ul>
        <li>0.50 Art (PCP) program.</li>
        <li>0.4 Academic Intervention.</li>
        <li>0.2 Office Assistant Hourly.</li>
        <li>Music.</li>
        <li>Community events such as the Welcome Picnic and Art Walk.</li>
        <li>Teacher appreciation and classroom supplies.</li>
        <li>Scholarships for students in need.</li>
      </ul>
      <h2>The campaign’s Equity Fund option</h2>
      <p>The 2025 campaign offered an Equity Fund option supporting schools and communities with fewer PTA fundraising resources, including Lowell Elementary and the SE Seattle Schools Fundraising Alliance.</p>
      <p>Before designating a new gift, ask <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a> which funds and recipients are current. This historical campaign does not establish a new allocation commitment.</p>
      <p><a class="button button-primary" href="https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN">Give online</a></p>
      <h2>Four easy ways to help</h2>
      <ol>
        <li><strong>Online:</strong> Make a secure one-time or recurring gift.</li>
        <li><strong>Employer matching:</strong> Many employers match both cash gifts and volunteer hours through Benevity or an internal portal.</li>
        <li><strong>Payroll deduction:</strong> Some employers let you donate each pay period and apply matching funds automatically.</li>
        <li><strong>Check:</strong> Use the <a href="../donate/">current check and mailing instructions</a> on our Donate page.</li>
      </ol>
      <p>Questions? Email <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a>.</p>
      <div class="callout">Your donation is tax-deductible to the extent allowed by law. Montlake Community School Association is an IRS-approved 501(c)(3), Tax ID <strong>91-1117733</strong>.</div>`,
  },
  {
    slug: "appreciation",
    title: "Staff Appreciation",
    heading: "A whole week of thank-yous.",
    kicker: "Celebrate our staff",
    description: "Volunteer, contribute, and help recognize the teachers and staff who make Montlake special.",
    accent: "coral",
    content: `
      <p class="lead">Staff Appreciation Week is our chance to make every teacher and staff member feel seen, supported, and celebrated.</p>
      <p>The annual campaign invites families to provide items, volunteer, and write personal accolades.</p>
      <div class="button-row">
        <a class="button button-primary" href="https://montlake.classroomparent.com/events/23142/volunteering">View volunteer signup</a>
        <a class="button button-secondary" href="https://48144b22-8a8f-491b-b2a1-7edf8a0c71b8.usrfiles.com/ugd/48144b_a8b207a88da44774acefc01a083fa5eb.pdf">Read the accolade guide</a>
      </div>
      <div class="callout"><strong>Seasonal note:</strong> Dates and signup links change each year. Check the newsletter for the current appreciation plan.</div>`,
  },
  {
    slug: "evergreens",
    title: "Evergreens Sale",
    heading: "A festive tradition that gives back.",
    kicker: "Seasonal fundraiser",
    description: "Order holiday evergreens and help with the annual pickup event supporting Montlake Elementary.",
    accent: "blue",
    content: `
      <p class="lead">The annual evergreens sale is a community tradition and seasonal fundraiser for Montlake Elementary.</p>
      <p><a class="button button-primary" href="https://www.signupgenius.com/go/10C044DAAAF2AA4FCCF8-60124101-montlake">Volunteer for pickup</a></p>
      <p>Ordering and pickup details are announced in the weekly newsletter each fall. Questions can be sent to <a href="mailto:evergreens@montlakepta.org?subject=Evergreens%20Sale%20Question">evergreens@montlakepta.org</a>.</p>`,
  },
  {
    slug: "blog",
    title: "News",
    heading: "Updates from around Montlake.",
    kicker: "PTA news",
    description: "School news, family resources, program announcements, meeting information, and community stories.",
    accent: "yellow",
    content: `
      <p class="lead">Current and historical school news remains available in the news archive while a new publishing workflow is completed.</p>
      <p><a class="button button-primary" href="https://www.montlakepta.org/blog">Open the news archive</a></p>
      <h2>Never miss an update</h2>
      <p>The weekly newsletter is the fastest way to receive school leadership notes, specialist updates, event reminders, and PTA announcements.</p>
      <p><a href="https://lp.constantcontactpages.com/sl/tG8wj2x/MontlakeSignUp">Subscribe to the Tuesday newsletter</a>.</p>`,
  },
  {
    slug: "donation-thank-you-page",
    title: "Thank You",
    heading: "Your generosity moves Montlake forward.",
    kicker: "Donation received",
    description: "Thank you for supporting students, staff, and families at Montlake Elementary.",
    accent: "yellow",
    content: `
      <p class="lead">Thank you for investing in our school community. Your gift helps provide staffing, programs, materials, scholarships, and events that enrich every student’s experience.</p>
      <p>Many employers will match charitable donations. Check your workplace giving portal to make your impact go even further.</p>
      <p><a class="button button-primary" href="../">Return to the homepage</a></p>`,
  },
  {
    slug: "challenges",
    title: "Programs",
    heading: "Programs built around the whole child.",
    kicker: "What we support",
    description: "Explore the programs, services, and community work supported by Montlake PTA.",
    accent: "blue",
    content: `
      <p class="lead">PTA support reaches across the school day and beyond—from staffing and classroom needs to enrichment, advocacy, access, and community connection.</p>
      <ul class="card-list">
        <li><strong><a href="../enrichment/">After-school enrichment</a></strong><br>Creative, academic, and active classes each trimester.</li>
        <li><strong><a href="../special-education/">Special education resources</a></strong><br>Starting points for services and family support.</li>
        <li><strong><a href="../advocacy/">Advocacy</a></strong><br>Information and action for strong public schools.</li>
        <li><strong><a href="../budget/">Staffing and school support</a></strong><br>Transparent investments guided by community priorities.</li>
      </ul>`,
  },
];
