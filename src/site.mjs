export const site = {
  name: "Montlake PTA",
  previewUrl: "https://montlake-pta.github.io/website/",
  newsletterUrl: "https://lp.constantcontactpages.com/sl/tG8wj2x/MontlakeSignUp",
  membershipUrl: "https://montlakepta.givebacks.com/store",
  donateUrl: "https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN",
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

export const pages = [
  {
    slug: "",
    title: "Home",
    description: "Montlake PTA brings families, educators, and neighbors together to help every student learn, belong, and thrive.",
    home: true,
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
    content: `
      <p class="lead">This calendar stays connected to the PTA’s existing Google Calendar, so updates appear here automatically.</p>
      <p><a class="button button-primary" href="https://calendar.google.com/calendar/ical/c_85551f0d8214f96fbf6bb14c67224de93550a0d69a65773fc3b80597196de3cb%40group.calendar.google.com/public/basic.ics">Add to your calendar</a></p>
      <iframe title="Montlake PTA calendar" loading="lazy" src="https://calendar.google.com/calendar/embed?src=c_85551f0d8214f96fbf6bb14c67224de93550a0d69a65773fc3b80597196de3cb%40group.calendar.google.com&ctz=America%2FLos_Angeles"></iframe>`,
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
    heading: "More ways to discover and create.",
    kicker: "After-school programs",
    description: "Registration, scholarships, dismissal, and contact information for PTA after-school enrichment.",
    accent: "coral",
    content: `
      <p class="lead">The PTA offers after-school classes each trimester, with options that often include art, baking, LEGO, theater, languages, and more.</p>
      <p><a class="button button-primary" href="https://www.6crickets.com/">View classes on 6crickets</a></p>

      <h2>Access for every student</h2>
      <p>Scholarships are available. Contact Montlake Elementary’s office confidentially at <a href="mailto:meguerreroto@seattleschools.org?subject=Enrichment%20scholarship">meguerreroto@seattleschools.org</a> for help.</p>

      <h2>Dismissal options</h2>
      <ul class="card-list">
        <li><strong>Parent or caregiver pickup</strong><br>Students are dismissed from the southeast garden gate. Be ready to show identification until instructors recognize you.</li>
        <li><strong>Independent walkers</strong><br>Email written permission in advance. Walkers must leave campus immediately after class.</li>
        <li><strong>Launch students</strong><br>Students are escorted directly to Launch aftercare when enrichment ends.</li>
        <li><strong>Let Grow Play Club</strong><br>Students transition directly to the club after enrichment.</li>
      </ul>

      <h2>Changes and absences</h2>
      <p>Send absence notices to <a href="mailto:enrichcoordinator@montlakepta.org?subject=Enrichment%20absence">enrichcoordinator@montlakepta.org</a>. Send pickup changes in advance to the <a href="mailto:enrichcoordinator@montlakepta.org?subject=Pickup%20changes">same coordinator</a>.</p>
      <p>Program questions: <a href="mailto:enrichment@montlakepta.org">enrichment@montlakepta.org</a><br>Day-of coordinator: <a href="tel:+12064866036">(206) 486-6036</a></p>`,
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
        <li>We support evidence-based solutions that provide quality education, safe environments, inclusion, and the resources every student needs to thrive.</li>
        <li>We expect decision-makers to share specific short- and long-term plans early enough for communities to understand and help implement them.</li>
        <li>We support research-based, neurodiversity-affirming decisions that strengthen special education, advanced learning, and multilingual opportunities.</li>
        <li>We support comprehensive after-school care that is available to all who need it.</li>
        <li>We seek to minimize disruption to student learning and established communities.</li>
        <li>We support thoughtful, gradual change that advances equity and diversity across the broader community.</li>
        <li>We advocate for responsible district finances and stronger state funding for schools.</li>
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
      </ul>`,
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
    content: `
      <p class="lead">Your gift helps fund staffing, student programs, classroom needs, community events, scholarships, and equipment.</p>
      <p><a class="button button-primary" href="https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN">Donate securely online</a></p>

      <h2>Ways to give</h2>
      <h3>Recurring or one-time online gifts</h3>
      <p>Choose a one-time gift or smaller automatic monthly gifts by credit card or bank account. Recurring contributions help the PTA plan reliably throughout the school year.</p>

      <h3>Employer matching</h3>
      <p>Many employers—including Google, Microsoft, Apple, Symetra, and Alaska Airlines—match donations through <a href="https://benevity.com/">Benevity</a> or another giving portal. Some employers also match volunteer hours. Contact your HR team, or email <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a> if the PTA needs to verify your gift.</p>

      <h3>Check</h3>
      <p>Checks avoid processing fees. Send a check in an envelope marked “Montlake PTA Annual Fund” through backpack mail, or mail it to:</p>
      <p><strong>Montlake PTA Annual Fund<br>520 Ravenna Blvd NE<br>Seattle, WA 98105</strong></p>

      <div class="callout">Montlake Community School Association (Montlake PTA) is an IRS-approved 501(c)(3) nonprofit. Federal Tax ID: <strong>91-1117733</strong>.</div>`,
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
    content: `
      <p class="lead">Our spring auction brings the community together around experiences, local businesses, and a shared goal: strong support for Montlake students.</p>
      <p><a class="button button-primary" href="https://montlakepta.schoolauction.net/2026auction/catalog">Browse the 2026 auction catalog</a></p>
      <h2>Where the dollars go</h2>
      <p>The 2026 goal was $125,000 through auction purchases and direct gifts. Most fundraising supports the Montlake Elementary staffing grant, including essential programs such as art and music, academic intervention, and office support.</p>
      <p>PTA funds also provide student scholarships, equity support for schools with fewer fundraising resources, and community events including the Art Walk and fall welcome.</p>
      <div class="callout">Auction links are seasonal. If the catalog is closed, <a href="../donate/">direct donations</a> continue to support the same mission.</div>`,
  },
  {
    slug: "fall-fundraiser-2025",
    title: "Fall Fundraiser",
    heading: "Start the school year strong.",
    kicker: "Annual giving",
    description: "Give online, request an employer match, use payroll deduction, or contribute by check.",
    accent: "yellow",
    content: `
      <p class="lead">The fall fundraiser gives the PTA a strong foundation for staffing support, programs, and community needs throughout the year.</p>
      <p><a class="button button-primary" href="https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN">Give online</a></p>
      <h2>Four easy ways to help</h2>
      <ol>
        <li><strong>Online:</strong> Make a secure one-time or recurring gift.</li>
        <li><strong>Employer matching:</strong> Many employers match both cash gifts and volunteer hours through Benevity or an internal portal.</li>
        <li><strong>Payroll deduction:</strong> Some employers let you donate each pay period and apply matching funds automatically.</li>
        <li><strong>Check:</strong> Make checks payable to Montlake PTA Fall Fundraiser and send them by backpack mail or to 2025 E Calhoun Street, Seattle, WA 98112.</li>
      </ol>
      <p>Questions? Email <a href="mailto:fundraising@montlakepta.org">fundraising@montlakepta.org</a>.</p>
      <div class="callout">All gifts are tax-deductible. Montlake Community School Association is an IRS-approved 501(c)(3), Tax ID <strong>91-1117733</strong>.</div>`,
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
