/**
 * blog-content.ts
 *
 * Full article content for each blog post, keyed by slug.
 * Written as HTML strings rendered via dangerouslySetInnerHTML.
 * Each post: specific fee ranges, 3-5 named NanaSays schools with profile links,
 * direct answer to search query in first paragraph.
 */

export const BLOG_CONTENT: Record<string, string> = {

  // ─── EXISTING POSTS ──────────────────────────────────────────────────────────

  'best-boarding-schools-uk-international-families': `
    <p>The best UK boarding schools for international families combine strong EAL support, proven university placement, and an established international student community — schools where your child will not be the only expat in the room. Fees run from £22,000 to £52,000 per year depending on the school and year group, with most mid-tier options landing between £30,000 and £40,000.</p>

    <h2>What international families actually need from a UK boarding school</h2>
    <p>UK boarding schools vary enormously in how well they serve international students. Some have 80% British boarders and treat international students as a novelty. Others have built genuine global communities where 40–60% of students come from overseas. The difference shows up immediately in pastoral care, cultural sensitivity, and the alumni network your child will graduate into.</p>
    <p>The schools below all score highly on three criteria Nana tracks specifically: the proportion of international students, the depth of EAL and visa support, and the quality of university guidance for students aiming at universities outside the UK.</p>

    <h2>1. Harrow School</h2>
    <p>One of England's most recognised boarding schools, Harrow has invested heavily in its international community over the past decade. Around 35% of boarders come from overseas, predominantly Asia. The school offers structured EAL support and has strong links with US, Hong Kong, and mainland Chinese universities alongside Oxbridge.</p>
    <p>Fees: approximately £48,000/year for boarding.<br/>
    <a href="/schools/harrow-school">View Harrow School on NanaSays →</a></p>

    <h2>2. Marlborough College</h2>
    <p>Marlborough has one of the strongest IB programmes of any UK boarding school, making it particularly well-suited to families who want the flexibility of both A-levels and the IB Diploma. The campus is exceptional, and the boarding house system means students build deep relationships across year groups.</p>
    <p>Fees: approximately £45,000/year for boarding.<br/>
    <a href="/schools/marlborough-college">View Marlborough College on NanaSays →</a></p>

    <h2>3. TASIS England</h2>
    <p>TASIS is Nana's top pick for international families specifically because it was founded with an international mission. Three curricula on one campus (American High School Diploma, IB Diploma, AP courses), a student body from 50+ nationalities, and strong university counselling for US, UK, and European universities. Located 20 minutes from Heathrow — practical for families flying in.</p>
    <p>Fees: approximately £42,000/year for boarding.<br/>
    <a href="/schools/tasis-england">View TASIS England on NanaSays →</a></p>

    <h2>4. Cheltenham Ladies' College</h2>
    <p>For families with daughters, Cheltenham Ladies' College combines rigorous academics with a genuinely nurturing environment. The school has invested significantly in its EAL provision and has a strong record of placing international students at UK universities. Around 20% of boarders are international.</p>
    <p>Fees: approximately £43,000/year for boarding.<br/>
    <a href="/schools/cheltenham-ladies-college">View Cheltenham Ladies' College on NanaSays →</a></p>

    <h2>5. Millfield School</h2>
    <p>Millfield is the right choice if your child has strong extracurricular interests — sport in particular. It has one of the highest proportions of international students of any UK boarding school (around 40%) and offers genuinely comprehensive SEN and EAL support. It is less academically selective than Harrow or Marlborough, which can be an advantage for students who are strong in sports or arts but not yet comfortable in English.</p>
    <p>Fees: approximately £41,000/year for boarding.<br/>
    <a href="/schools/millfield-school">View Millfield School on NanaSays →</a></p>

    <h2>What to ask at open days</h2>
    <p>When you visit any UK boarding school, ask these three questions: What percentage of your boarders are international? What university destinations do your international students typically aim for? And what happens if my child needs additional English support in their first term? The answers will tell you everything you need to know about whether the school is genuinely built for your family.</p>
  `,

  'ib-vs-igcse-parents-guide': `
    <p>If your child is in an international school and approaching secondary, you will face this question: IB or IGCSE? The short answer is that IGCSE is an excellent foundation for almost every student, while the IB Diploma is a better choice for students who are academically strong, self-motivated, and aiming at competitive universities — particularly in the UK, Europe, or the US. Neither is objectively superior. The right choice depends on your child.</p>

    <h2>What each qualification actually is</h2>
    <p>The IGCSE (International General Certificate of Secondary Education) is typically taken at age 14–16 across 8–10 subjects. It is the international equivalent of UK GCSEs and is widely recognised by universities worldwide. It gives students broad exposure before they specialise.</p>
    <p>The IB Diploma Programme is a two-year curriculum taken at ages 16–18. Students study six subjects across different groups, write a 4,000-word Extended Essay, complete a Theory of Knowledge course, and fulfil a Creativity, Activity, Service (CAS) requirement. It is demanding and holistic by design.</p>

    <h2>University acceptance: what admissions officers actually say</h2>
    <p>UK universities love the IB. A score of 38/45 is roughly equivalent to three A-levels at A*, and top programmes — medicine, law, engineering at Russell Group universities — actively recruit IB students. The Extended Essay is particularly valued because it demonstrates research capability.</p>
    <p>US universities also respond well to the IB, partly because the curriculum mirrors Advanced Placement in its breadth. Students with IB Diplomas often receive college credit at American universities.</p>
    <p>For Australian, Canadian, and most Asian universities, both IGCSE and IB are accepted with equal enthusiasm. The school's reputation and the individual subject grades matter more than the qualification framework.</p>

    <h2>Workload: the honest picture</h2>
    <p>The IB Diploma is genuinely demanding. Students typically spend 3–5 hours per day on schoolwork outside of class in their final year. The combination of six subjects, Extended Essay, TOK, and CAS means there is no quiet period. Students who thrive are self-directed, enjoy writing, and are comfortable with ambiguity.</p>
    <p>IGCSE followed by A-levels allows students to specialise earlier and go deeper in three or four subjects. The workload in the final two years is intense but more focused. Students who know what they want to study often prefer this path.</p>

    <h2>Schools offering both — and why it matters</h2>
    <p>The best international schools give families genuine choice. TASIS England offers both A-levels and the IB Diploma on one campus, which is rare and valuable — your child can make the decision at 16 with real information rather than committing at age 11. <a href="/schools/tasis-england">View TASIS England →</a></p>
    <p>NIST International School in Bangkok is one of the most respected IB-only schools in Southeast Asia, with consistently strong Diploma results and experienced IB coordinators. <a href="/schools/nist-international-school">View NIST International School →</a></p>
    <p>For families in Singapore, UWCSEA runs one of the largest and most established IB programmes in the world. <a href="/schools/uwcsea-east">View UWCSEA East →</a></p>

    <h2>Which to choose</h2>
    <p>Choose the IB Diploma if: your child is academically strong across multiple subjects, enjoys writing and independent research, and is targeting competitive universities in the UK, US, or Europe.</p>
    <p>Choose IGCSE + A-levels if: your child has clear subject strengths and weaknesses, benefits from more focused study, or the school's A-level programme is significantly stronger than its IB offering.</p>
    <p>In practice, the quality of teaching at the specific school matters more than the qualification framework. A mediocre IB programme at a weak school will not outperform a strong A-level programme at an excellent one.</p>
  `,

  'singapore-international-school-guide-2026': `
    <p>Singapore's international schools are among the best in Asia, and places are fiercely competitive — top schools have waiting lists of 12–18 months. Fees range from SGD 20,000 to SGD 55,000 per year (roughly USD 15,000–41,000), and the right school depends on your child's curriculum, your family's length of stay, and how much flexibility you need if you relocate again.</p>

    <h2>The four schools every expat family should know</h2>

    <h3>United World College of South East Asia (UWCSEA)</h3>
    <p>UWCSEA runs two campuses — Dover and East — and is Singapore's most internationally diverse school. With students from over 80 nationalities, an IB-only curriculum from kindergarten through Diploma, and a strong emphasis on service and global citizenship, it is the school most aligned with a genuinely international upbringing. The Diploma results are consistently excellent, and alumni go on to top universities worldwide.</p>
    <p>Fees: approximately SGD 40,000–52,000/year depending on year group.<br/>
    <a href="/schools/uwcsea-east">View UWCSEA East on NanaSays →</a></p>

    <h3>Singapore American School (SAS)</h3>
    <p>SAS is the choice for families who need the American curriculum — particularly those on rotational assignments who may return to the US. It is the largest American-curriculum school in Asia, with outstanding facilities, a strong AP programme, and excellent university counselling. The community skews heavily American but is genuinely welcoming to other nationalities.</p>
    <p>Fees: approximately SGD 37,000–43,000/year.<br/>
    <a href="/schools/singapore-american-school">View Singapore American School on NanaSays →</a></p>

    <h3>Tanglin Trust School</h3>
    <p>Tanglin is the British-curriculum stalwart in Singapore. It runs from nursery to sixth form, offers both IGCSEs and A-levels, and has a strong British expat community with increasing diversity. The sixth form programme is particularly respected, and Oxbridge placements are consistent. Waiting lists are long — apply as early as possible.</p>
    <p>Fees: approximately SGD 27,000–35,000/year.<br/>
    <a href="/schools/tanglin-trust-school">View Tanglin Trust School on NanaSays →</a></p>

    <h3>Nexus International School Singapore</h3>
    <p>Nexus is the best value option among Singapore's major international schools. Smaller than SAS or UWCSEA, it offers a personalised learning approach and genuinely small class sizes. The IB results are solid and improving, and the community is welcoming for late-arrival students. Recommended if you want a strong school without a 12-month waiting list.</p>
    <p>Fees: approximately SGD 22,000–28,000/year.<br/>
    <a href="/schools/nexus-international-school-singapore">View Nexus International School on NanaSays →</a></p>

    <h2>How to get a place</h2>
    <p>Apply to your top three choices before you arrive in Singapore, not after. Most schools process applications from overseas, and arriving with an offer letter is far better than joining a waiting list from in-country. UWCSEA and SAS have the longest waits — 12–18 months is normal for popular year groups.</p>
    <p>If your child is primary age, you have more flexibility. Secondary places — particularly Years 10–13 — are significantly harder to secure at top schools.</p>

    <h2>What to look for beyond rankings</h2>
    <p>Singapore's international schools are all academically strong. The real differentiators are: how well does the school handle mid-year arrivals? What language support is available for non-English speakers? And how international is the community really — some schools are majority-national in practice despite the international label.</p>
  `,

  // ─── NEW POSTS ───────────────────────────────────────────────────────────────

  'international-schools-bangkok-guide': `
    <p>Bangkok has over 80 international schools offering everything from Montessori to the British A-level, with annual fees ranging from THB 250,000 (USD 7,000) at smaller local international schools to over THB 1,400,000 (USD 40,000) at flagship campuses like Harrow and Shrewsbury. If you are relocating to Bangkok with children, the school decision is the most important logistical choice you will make — this guide covers the schools worth knowing, the questions to ask, and how to get a place.</p>

    <h2>Bangkok's top international schools</h2>

    <h3>Harrow International School Bangkok</h3>
    <p>Harrow Bangkok is the most recognisable British-brand school in Thailand and one of the strongest academic schools in Southeast Asia. The campus in Lad Phrao is purpose-built and exceptional, with facilities that match or exceed the original Harrow in England. The school runs IGCSEs and A-levels with very strong Oxbridge and Russell Group university placement. Around 40% of students are Thai, 60% international — a healthy balance.</p>
    <p>Fees: approximately THB 950,000–1,350,000/year (USD 27,000–39,000).<br/>
    <a href="/schools/harrow-international-school-bangkok">View Harrow Bangkok on NanaSays →</a></p>

    <h3>Shrewsbury International School Bangkok</h3>
    <p>Shrewsbury has two campuses — City and River — and is Bangkok's other flagship British school. The River campus is particularly impressive, with outstanding sports facilities along the Chao Phraya. The school runs IGCSE and A-levels and has consistently strong academic results. Waiting lists are common for popular year groups.</p>
    <p>Fees: approximately THB 750,000–1,100,000/year (USD 21,000–31,000).<br/>
    <a href="/schools/shrewsbury-international-school-bangkok">View Shrewsbury Bangkok on NanaSays →</a></p>

    <h3>NIST International School</h3>
    <p>NIST is Bangkok's leading IB school — IB-only from nursery to Diploma, with one of the most experienced IB faculties in Asia. The Diploma results are consistently above the global average, and the school has a genuinely multicultural community with students from 60+ nationalities. Located in Sukhumvit, it is convenient for most expat neighbourhoods.</p>
    <p>Fees: approximately THB 680,000–880,000/year (USD 19,000–25,000).<br/>
    <a href="/schools/nist-international-school">View NIST on NanaSays →</a></p>

    <h3>Bangkok Patana School</h3>
    <p>Bangkok Patana is one of Asia's oldest British international schools, founded in 1957 by the British Embassy. It runs IGCSEs and A-levels and has a strong community feel — many families stay from primary through sixth form. The On Nut location is slightly further from central Bangkok but the campus is large and well-resourced. Consistently strong A-level results.</p>
    <p>Fees: approximately THB 590,000–790,000/year (USD 17,000–22,000).<br/>
    <a href="/schools/bangkok-patana-school">View Bangkok Patana on NanaSays →</a></p>

    <h3>International School Bangkok (ISB)</h3>
    <p>ISB is Bangkok's American-curriculum school of choice for US families and those planning to return to North America. The campus in Nichada Thani (north Bangkok) is self-contained with excellent facilities. Strong AP programme, solid university counselling for US colleges, and a large American expat community. Less central than other schools — best suited to families living in the northern suburbs.</p>
    <p>Fees: approximately THB 750,000–1,000,000/year (USD 21,000–28,000).<br/>
    <a href="/schools/international-school-bangkok">View ISB on NanaSays →</a></p>

    <h2>How to choose</h2>
    <p>The first question is curriculum: British (IGCSE/A-level), IB, or American? If you expect to return to your home country within 3–5 years, match the curriculum to where your child will re-enter school. If you are settling long-term or are genuinely unsure, the IB is the most portable qualification globally.</p>
    <p>The second question is location. Bangkok traffic is serious — a school that is 12km from your home can take 90 minutes in rush hour. Schools in Sukhumvit are accessible from most expat areas. Schools in Nichada Thani or Lad Phrao are better served if you live in the north.</p>

    <h2>Getting a place</h2>
    <p>Apply 6–12 months in advance for top schools. Harrow, Shrewsbury, and NIST regularly have waiting lists for Year 1–6 and Year 10–12. Most schools will assess your child on arrival (English level, academic readiness) — prepare for this, especially if your child's primary language is not English.</p>
  `,

  'ib-schools-thailand': `
    <p>Thailand has over 60 schools authorised to offer IB programmes — more than almost any other country in Southeast Asia. The IB Diploma is offered at 35+ schools, with annual fees ranging from THB 250,000 (USD 7,000) at smaller schools to THB 880,000 (USD 25,000) at Bangkok's flagship IB campuses. Here is every school worth knowing, with honest assessments of their programmes.</p>

    <h2>Bangkok's strongest IB Diploma programmes</h2>

    <h3>NIST International School</h3>
    <p>NIST is Thailand's IB specialist — IB-only from Early Years through the Diploma, with one of the most experienced IB faculties in Asia. Diploma pass rates consistently exceed the global average. The school has won multiple IB awards for curriculum innovation and runs a strong CAS programme. Students come from 60+ nationalities. The best IB choice in Bangkok for families committed to the programme.</p>
    <p>Fees: THB 680,000–880,000/year (USD 19,000–25,000).<br/>
    <a href="/schools/nist-international-school">View NIST on NanaSays →</a></p>

    <h3>International School Bangkok (ISB)</h3>
    <p>ISB offers both the American High School Diploma and the IB Diploma Programme — one of the few schools in Bangkok giving students genuine choice at 16. The IB programme is well-resourced and growing. Good choice for families who want the option to switch curricula depending on university destination.</p>
    <p>Fees: THB 750,000–1,000,000/year (USD 21,000–28,000).<br/>
    <a href="/schools/international-school-bangkok">View ISB on NanaSays →</a></p>

    <h3>Bangkok Prep International School</h3>
    <p>Bangkok Prep offers the IB Primary Years Programme (PYP) and Middle Years Programme (MYP) through to the Diploma. Strong pastoral care, smaller class sizes than the flagship schools, and a welcoming community for new arrivals. Fees are at the mid-range — a good option for families who want a genuine IB school without the top-tier price tag.</p>
    <p>Fees: THB 450,000–680,000/year (USD 13,000–19,000).<br/>
    <a href="/schools/bangkok-prep-international-school">View Bangkok Prep on NanaSays →</a></p>

    <h2>IB schools outside Bangkok</h2>
    <p>Chiang Mai, Phuket, and Pattaya all have IB-authorised schools. Quality varies significantly — the best schools outside Bangkok are in Chiang Mai, where several schools run full PYP–MYP–DP programmes with experienced international staff. Fees outside Bangkok are typically 30–40% lower.</p>

    <h2>What IB authorisation actually means</h2>
    <p>A school being "IB authorised" means it has passed the IBO's accreditation process for specific programmes (PYP, MYP, or DP). It does not guarantee quality of delivery. Ask any school you visit: What are your Diploma pass rates for the last three years? What is your average Diploma score? And how many of your Diploma teachers have the IB Category 3 training? These questions separate strong IB schools from those using the IB brand without the substance.</p>
  `,

  'moving-bangkok-kids-schools': `
    <p>Moving to Bangkok with children is manageable — the international school system is well-established, English-medium, and genuinely good at welcoming new arrivals. The critical steps are: choose your school before you arrive, apply 6–12 months in advance for the top choices, and pick your neighbourhood based on which school you have a place at (not the other way around). Here is everything you need to know.</p>

    <h2>The school decision comes first</h2>
    <p>In Bangkok, school location should determine where you live — not the other way around. The city's traffic is significant, and a 15km commute can take 90 minutes in rush hour. Once you have a school offer, find accommodation within 5km. Most expat families cluster around their school's neighbourhood as a result.</p>

    <h2>Which schools are genuinely welcoming to new arrivals?</h2>
    <p>Not all international schools handle mid-year arrivals equally. Some schools have structured induction programmes, dedicated EAL support, and buddy systems for new students. Others expect children to sink or swim. The schools below are known for particularly strong pastoral care for new families:</p>

    <h3>Bangkok Patana School</h3>
    <p>Bangkok Patana has an excellent reputation for welcoming families arriving mid-year. The school's community is warm, and the pastoral system is well-organised. The On Nut campus is large enough that children are not overwhelmed, but small enough that staff know students individually.</p>
    <p>Fees: approximately THB 590,000–790,000/year (USD 17,000–22,000).<br/>
    <a href="/schools/bangkok-patana-school">View Bangkok Patana on NanaSays →</a></p>

    <h3>NIST International School</h3>
    <p>NIST has students from 60+ nationalities and is used to integrating new arrivals. The school's counselling team actively supports students transitioning from different curricula and school cultures.</p>
    <p>Fees: approximately THB 680,000–880,000/year (USD 19,000–25,000).<br/>
    <a href="/schools/nist-international-school">View NIST on NanaSays →</a></p>

    <h3>Bangkok International Preparatory and Secondary School (Bangkok Prep)</h3>
    <p>Bangkok Prep is smaller than the flagship schools and prides itself on knowing every student. Strong EAL provision and a genuine open-door policy for parents. Recommended for children who need more individual attention in their transition.</p>
    <a href="/schools/bangkok-prep-international-school">View Bangkok Prep on NanaSays →</a>

    <h2>EAL support — what to look for</h2>
    <p>If your child's primary language is not English, EAL (English as an Additional Language) support is critical. Ask every school: How many EAL teachers do you have? Is EAL support additional cost? And at what English level would you consider a student ready to exit EAL support? Schools with strong EAL programmes will answer these questions precisely. Schools that say "all our teachers differentiate" are often telling you they don't have dedicated EAL provision.</p>

    <h2>Visa and work permits for school-age children</h2>
    <p>Children of expats on Non-B (work) or Non-O (dependent) visas attend international schools on their dependent visa status. Schools handle the paperwork for student permits — ask your admissions contact what documents they need from you and how long the process takes. Most schools process this within 2–3 weeks of enrollment.</p>
  `,

  'international-schools-kuala-lumpur': `
    <p>Kuala Lumpur has a strong and underrated international school system, with fees significantly lower than Singapore — typically USD 8,000–25,000 per year compared to Singapore's USD 15,000–41,000 for equivalent-quality schools. The city has over 100 international schools, but quality varies considerably. Here are the schools consistently rated highest by expat families.</p>

    <h2>KL's best international schools</h2>

    <h3>Garden International School (GIS)</h3>
    <p>Garden International School is KL's most established British-curriculum school, founded in 1949. It runs from nursery through sixth form, offering IGCSEs and A-levels, with consistently strong results. The main campus in Mont'Kiara is in the heart of the expat district. GIS has a large British expat community and excellent pastoral care.</p>
    <p>Fees: approximately MYR 50,000–95,000/year (USD 11,000–21,000).<br/>
    <a href="/schools/garden-international-school">View Garden International School on NanaSays →</a></p>

    <h3>Mont'Kiara International School (MKIS)</h3>
    <p>MKIS runs the American curriculum and is the school of choice for US families in KL. The American-curriculum community in KL is smaller than the British community, which makes MKIS a tight-knit school. Strong AP programme and solid university counselling for US colleges.</p>
    <p>Fees: approximately MYR 60,000–90,000/year (USD 13,000–20,000).<br/>
    <a href="/schools/montkiara-international-school">View Mont'Kiara International School on NanaSays →</a></p>

    <h3>Alice Smith School</h3>
    <p>Alice Smith is KL's second major British-curriculum school. Founded in 1946, it has a strong community feel and excellent pastoral care. Two campuses — primary in Jalan Bellamy and secondary in Cheras — which requires planning for families with children across age groups. Consistently strong IGCSE and A-level results.</p>
    <p>Fees: approximately MYR 45,000–85,000/year (USD 10,000–19,000).<br/>
    <a href="/schools/alice-smith-school">View Alice Smith School on NanaSays →</a></p>

    <h3>Marlborough College Malaysia</h3>
    <p>The Malaysian campus of the original Marlborough College opened in 2012 and offers a full boarding school experience in Southeast Asia — unusual in the region. IGCSEs and A-levels with the full Marlborough co-curricular programme. For families wanting a boarding school in Asia at significantly lower cost than UK boarding (fees are roughly 40% of the UK equivalent), this is the outstanding option.</p>
    <p>Fees: approximately MYR 120,000–180,000/year boarding (USD 27,000–41,000).<br/>
    <a href="/schools/marlborough-college-malaysia">View Marlborough College Malaysia on NanaSays →</a></p>

    <h2>Location and logistics</h2>
    <p>Most of KL's international schools are clustered in the Mont'Kiara / Sri Hartamas / Bangsar corridor. Living in this area puts you within 15 minutes of GIS, Alice Smith's primary, and several other schools. If you are willing to live slightly further, the Damansara area has good access to most schools.</p>
    <p>KL traffic is challenging, though less severe than Bangkok. School runs at 7–8am are the congested window — factor this into housing decisions.</p>
  `,

  'international-schools-jakarta': `
    <p>Jakarta's international schools range from excellent to mediocre, and the difference is not always apparent from school websites. Fees run from USD 8,000 to USD 28,000 per year, with most quality schools in the USD 12,000–22,000 range. The city has significant traffic, which makes school location relative to your home the most important practical factor — more so than in any other Southeast Asian capital.</p>

    <h2>Jakarta's strongest international schools</h2>

    <h3>Jakarta Intercultural School (JIS)</h3>
    <p>JIS is Jakarta's most established international school, founded in 1951 and running the American curriculum. Three campuses serve different age groups, and the school has a large and diverse international community. Strong AP and IB Diploma options at secondary level. The best all-round choice for families not committed to a specific curriculum.</p>
    <p>Fees: approximately USD 18,000–26,000/year.<br/>
    <a href="/schools/jakarta-intercultural-school">View JIS on NanaSays →</a></p>

    <h3>British School Jakarta</h3>
    <p>BSJ is Jakarta's flagship British-curriculum school, running from nursery through sixth form. The campus in Bintaro is large and well-resourced. IGCSE and A-level results are consistently strong, and the school has a welcoming community for newly arrived British and international families. Good EAL provision for non-English speakers.</p>
    <p>Fees: approximately USD 15,000–22,000/year.<br/>
    <a href="/schools/british-school-jakarta">View British School Jakarta on NanaSays →</a></p>

    <h3>Mentari Intercultural School Jakarta</h3>
    <p>Mentari is the best value option among Jakarta's quality international schools. Smaller than JIS or BSJ, the school offers a genuinely personalised education with small class sizes and a strong pastoral programme. IB Primary Years Programme through to IGCSE. Good for families who want quality without the flagship price.</p>
    <p>Fees: approximately USD 8,000–14,000/year.<br/>
    <a href="/schools/mentari-intercultural-school-jakarta">View Mentari on NanaSays →</a></p>

    <h2>The traffic problem — and how to solve it</h2>
    <p>Jakarta's traffic is among the worst in Asia. A 10km school run can take 60–90 minutes in rush hour. The practical implication: live within 5km of your chosen school. The Pondok Indah / Kemang / SCBD area gives access to several major schools. Bintaro is better served by BSJ. Kelapa Gading is closest to Jakarta Intercultural School's Pattimura Campus.</p>

    <h2>Air quality consideration</h2>
    <p>Jakarta has significant air quality issues during certain months. The best international schools have air filtration in classrooms and covered, ventilated sports facilities. Ask any school you visit about their air quality management — good schools will give you a specific answer about their AQI thresholds and indoor mitigation measures.</p>
  `,

  'affordable-international-schools-bangkok': `
    <p>Not every family in Bangkok needs to pay THB 1,000,000 per year for an international school. There are genuinely good international schools in Bangkok at THB 250,000–500,000 per year (USD 7,000–14,000) that offer English-medium education, experienced international staff, and solid academic results. Here are the ones worth considering.</p>

    <h2>What affordable means — and what to expect</h2>
    <p>At the USD 7,000–14,000 price point, you will typically find: smaller campuses, fewer specialist facilities (no Olympic pool, no 400m track), a higher proportion of Thai students (often 50–70%), and less established alumni networks for top-tier universities. What you should still expect: qualified English-speaking teachers, English-medium instruction, and a structured curriculum leading to internationally recognised qualifications.</p>

    <h2>Schools worth considering</h2>

    <h3>St. Andrews International School Green Valley</h3>
    <p>St. Andrews operates several campuses in Bangkok at different price points. The Green Valley campus is the most affordable, running the British curriculum (IGCSE) in a less central but spacious setting. Good for families in the southern Bangkok corridor.</p>
    <p>Fees: approximately THB 280,000–420,000/year (USD 8,000–12,000).<br/>
    <a href="/schools/st-andrews-international-school-green-valley">View St. Andrews Green Valley on NanaSays →</a></p>

    <h3>Concordian International School</h3>
    <p>Concordian runs the American curriculum and has a genuinely warm community. Located in Lat Krabang (near Suvarnabhumi Airport), it is less convenient for most expat neighbourhoods but a strong choice for families living in the east. Fees are at the lower end of Bangkok international schools.</p>
    <p>Fees: approximately THB 300,000–470,000/year (USD 8,500–13,500).<br/>
    <a href="/schools/concordian-international-school">View Concordian on NanaSays →</a></p>

    <h3>Wells International School</h3>
    <p>Wells has grown significantly in recent years and now offers a credible middle-market option in Bangkok. American curriculum, experienced teachers, and a mixed Thai-international student body. On Nut and Thong Lor campuses make it accessible from most expat areas.</p>
    <p>Fees: approximately THB 350,000–520,000/year (USD 10,000–15,000).<br/>
    <a href="/schools/wells-international-school">View Wells International School on NanaSays →</a></p>

    <h2>The honest trade-offs</h2>
    <p>The most important question at lower-priced international schools is teacher retention. High teacher turnover — common at schools competing on price — significantly affects academic quality. Ask directly: What is your average teacher tenure? And what percentage of your teachers are internationally certified? Schools with strong answers are genuinely building something; schools that deflect the question are not.</p>
  `,

  'british-vs-american-curriculum': `
    <p>The British curriculum (leading to IGCSE and A-levels) and the American curriculum (leading to the US High School Diploma with AP courses) are the two most common options at international schools worldwide. The right choice depends on where your child will eventually apply to university — and how likely your family is to relocate again. Here is the honest breakdown.</p>

    <h2>The core difference</h2>
    <p>The British curriculum involves narrowing down progressively: students study 8–10 subjects at IGCSE (ages 14–16), then specialise deeply in 3–4 subjects at A-level (ages 16–18). The American curriculum maintains broader exposure throughout — students take a wider range of subjects and choose Advanced Placement (AP) courses to demonstrate academic stretch in specific areas.</p>
    <p>Neither is objectively superior. British specialisation suits students who know what they want to study. American breadth suits students who are still exploring or who want maximum flexibility at university application.</p>

    <h2>University acceptance by destination</h2>
    <p><strong>UK universities:</strong> A-levels are the natural path. Three A*–A grades in relevant subjects is the target for competitive programmes. UK universities do accept the American curriculum with APs, but the pathway is less straightforward.</p>
    <p><strong>US universities:</strong> The American curriculum with APs is the natural path. UK A-level students are accepted — and often stand out — but need strong SAT/ACT scores and good university counselling.</p>
    <p><strong>Australian, Canadian, European universities:</strong> Both curricula are widely accepted. The IB is often the easiest path for these destinations if you want maximum portability.</p>

    <h2>Schools offering both</h2>
    <p>A few exceptional schools offer both curricula, which lets your child decide at 15–16 rather than committing your family at the point of school selection.</p>
    <p>TASIS England offers A-levels, the American High School Diploma, and the IB Diploma on one campus in Surrey — genuinely rare. <a href="/schools/tasis-england">View TASIS England →</a></p>
    <p>International School Bangkok (ISB) offers both the American curriculum and the IB Diploma at secondary level. <a href="/schools/international-school-bangkok">View ISB →</a></p>

    <h2>What actually matters most</h2>
    <p>The quality of teaching and university counselling at your specific school will have more impact on your child's outcomes than the curriculum framework. A strong A-level programme at a good school beats a mediocre American curriculum at a weak one — and vice versa. When visiting schools, ask to see destination data: where did last year's graduating class actually go? That data is more honest than any brochure.</p>
  `,

  'international-school-fees-asia': `
    <p>International school fees across Asia vary by a factor of five or more — from USD 7,000 per year at quality schools in Indonesia or Thailand to over USD 50,000 in Singapore and Hong Kong. This guide breaks down exactly what you should expect to pay in each major expat city, what is included, and where the hidden costs are.</p>

    <h2>Fee ranges by city (2025–2026)</h2>

    <table style="width:100%; border-collapse: collapse; margin: 24px 0;">
      <thead>
        <tr style="border-bottom: 2px solid #34C3A0;">
          <th style="text-align:left; padding: 10px 0; color: #1B3252;">City</th>
          <th style="text-align:left; padding: 10px 0; color: #1B3252;">Annual Fee Range (USD)</th>
          <th style="text-align:left; padding: 10px 0; color: #1B3252;">Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 0;">Singapore</td>
          <td style="padding: 12px 0;">$15,000–$41,000</td>
          <td style="padding: 12px 0;">Highest fees in Asia; limited supply, long waiting lists</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 0;">Hong Kong</td>
          <td style="padding: 12px 0;">$14,000–$35,000</td>
          <td style="padding: 12px 0;">Comparable to Singapore; some debenture fees apply</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 0;">Bangkok</td>
          <td style="padding: 12px 0;">$7,000–$39,000</td>
          <td style="padding: 12px 0;">Wide range; flagship schools comparable to Singapore</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 0;">Kuala Lumpur</td>
          <td style="padding: 12px 0;">$10,000–$21,000</td>
          <td style="padding: 12px 0;">Best value in the region for quality schools</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 0;">Jakarta</td>
          <td style="padding: 12px 0;">$8,000–$26,000</td>
          <td style="padding: 12px 0;">JIS at the top; good value at mid-range</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 0;">Ho Chi Minh City</td>
          <td style="padding: 12px 0;">$7,000–$22,000</td>
          <td style="padding: 12px 0;">Growing market; quality improving rapidly</td>
        </tr>
        <tr>
          <td style="padding: 12px 0;">Shanghai / Beijing</td>
          <td style="padding: 12px 0;">$18,000–$38,000</td>
          <td style="padding: 12px 0;">High demand; enrollment restrictions for some nationalities</td>
        </tr>
      </tbody>
    </table>

    <h2>What fees usually include</h2>
    <p>Most international school fees include: tuition, standard textbooks, and use of school facilities. They typically do not include: application fees (USD 200–500, non-refundable), registration deposits (often one month's fees, sometimes non-refundable), EAL support (charged separately at USD 2,000–8,000/year), school lunches, uniforms, field trips, or after-school activities.</p>
    <p>Always ask for the total cost of attendance, not just the headline tuition figure. The delta can be 20–30% at some schools.</p>

    <h2>Hidden cost: enrollment deposits and debentures</h2>
    <p>Several schools — particularly in Hong Kong and Singapore — require a debenture or bond on enrollment. This is a refundable deposit of USD 5,000–20,000 that secures your place and is returned when your child leaves the school. It is a significant upfront cost that does not appear in the published fee schedule. Ask about this specifically before assuming you can afford a school.</p>

    <h2>What you are actually paying for</h2>
    <p>At the USD 15,000+ level, you are paying for: small class sizes (typically 18–22 students), experienced internationally trained teachers, university counselling that genuinely places students at competitive institutions, and a robust co-curricular programme. At the USD 8,000–12,000 level, you may get good academics but fewer specialist teachers and less structured university support. The cost is real — but so is the difference in what you receive.</p>
  `,

  'boarding-schools-asia': `
    <p>Asia has a small but excellent collection of full boarding schools for international families — schools where your child lives on campus during term time. Annual boarding fees range from USD 27,000 to USD 55,000, significantly less than equivalent UK schools (which run USD 50,000–80,000). For families who relocate frequently, or who want their child's education to continue uninterrupted regardless of where the parents are posted, boarding is worth serious consideration.</p>

    <h2>Why boarding in Asia makes sense for expat families</h2>
    <p>UK and Swiss boarding schools have the strongest brands, but Asian boarding schools have one major practical advantage: proximity. A child boarding in Bangkok, Malaysia, or Singapore can be home for a long weekend in 2–4 hours from most Asian capitals. A child boarding in the UK is a 10–12 hour flight away. For families on Asian postings, this is a significant quality-of-life difference.</p>

    <h2>The best boarding schools in Asia</h2>

    <h3>Marlborough College Malaysia</h3>
    <p>The Malaysian campus of Marlborough College opened in 2012 and offers the full Marlborough experience — British curriculum (IGCSE and A-levels), the extensive co-curricular programme, the house system — at approximately 40% of UK boarding fees. The campus in Iskandar Puteri (Johor, southern Malaysia) is purpose-built and exceptional. Strong pastoral care; well-established boarding community.</p>
    <p>Fees: approximately USD 27,000–41,000/year (boarding).<br/>
    <a href="/schools/marlborough-college-malaysia">View Marlborough College Malaysia on NanaSays →</a></p>

    <h3>Shrewsbury International School Bangkok</h3>
    <p>Shrewsbury Bangkok's River Campus has a boarding programme for secondary students. The riverside campus is one of the most impressive school settings in Asia. British curriculum, strong A-level results, and a well-structured boarding house programme. Day students predominate, but boarding provision is genuine and well-managed.</p>
    <p>Fees: approximately USD 21,000–31,000/year (day); boarding is additional.<br/>
    <a href="/schools/shrewsbury-international-school-bangkok">View Shrewsbury Bangkok on NanaSays →</a></p>

    <h3>UWCSEA Singapore</h3>
    <p>UWCSEA does not offer traditional full boarding but has an established homestay programme for international students — an alternative worth exploring for families who want some of the independence-building benefits of boarding without a full residential school. The school is genuinely world-class for the IB Diploma.</p>
    <p><a href="/schools/uwcsea-east">View UWCSEA on NanaSays →</a></p>

    <h2>What to ask about boarding provision</h2>
    <p>When assessing any boarding school in Asia, ask: What is your boarder-to-house-parent ratio? What structured activities run in the evenings and weekends? And how do you handle homesickness in the first term — particularly for younger boarders? Schools with genuine boarding culture will answer these questions in detail. Schools running boarding as an afterthought will not.</p>
  `,

  'international-schools-ho-chi-minh': `
    <p>Ho Chi Minh City (Saigon) has developed a solid international school sector over the past decade, with annual fees typically running USD 7,000–22,000 — making it one of the more affordable cities in Asia for quality international education. The market is maturing fast: school quality has improved significantly since 2018, and the top three or four schools are now genuinely competitive with Bangkok and KL equivalents.</p>

    <h2>The schools worth knowing</h2>

    <h3>British Vietnamese International School (BVIS)</h3>
    <p>BVIS is the most recognised British-curriculum school in HCMC, running from nursery through secondary. IGCSE and A-level programmes, English-medium, with a growing reputation for academic results. The school has invested significantly in facilities in recent years. The best all-round British-curriculum choice in the city.</p>
    <p>Fees: approximately USD 10,000–18,000/year.<br/>
    <a href="/schools/british-vietnamese-international-school-ho-chi-minh">View BVIS on NanaSays →</a></p>

    <h3>International School Ho Chi Minh City (ISHCMC)</h3>
    <p>ISHCMC runs the IB curriculum from PYP through to Diploma and is the longest-established international school in the city. Strong pastoral care, experienced IB staff, and a genuinely international student community. The school has a good record of placing Diploma graduates at universities in the UK, Australia, and the US.</p>
    <p>Fees: approximately USD 13,000–22,000/year.<br/>
    <a href="/schools/international-school-ho-chi-minh-city">View ISHCMC on NanaSays →</a></p>

    <h3>Renaissance International School Saigon</h3>
    <p>Renaissance is one of the better-value options in HCMC — a smaller school with a strong community feel, British curriculum, and a reputation for being welcoming to new arrivals. Good EAL support. Recommended for families who want solid academics without the flagship price tag.</p>
    <p>Fees: approximately USD 7,000–13,000/year.<br/>
    <a href="/schools/renaissance-international-school-saigon">View Renaissance on NanaSays →</a></p>

    <h2>Things to know about HCMC specifically</h2>
    <p>The city has improved enormously as an expat destination in recent years. Air quality is better than Jakarta or Bangkok, the food scene is excellent, and the cost of living outside school fees is significantly lower than Singapore. Visa processes for school-age children are straightforward. The practical risk factors are: motorcycle traffic (teach children road awareness before they arrive), heat and humidity during certain months, and the city's rapid pace of change, which means school quality can shift fast in either direction.</p>
  `,

  'how-to-choose-international-school': `
    <p>Choosing an international school abroad comes down to four questions: Which curriculum will serve my child's future? Is this school genuinely good at what it claims? Will my child be happy here? And can we get a place? Answer these four questions honestly for each school you visit and you will make a good decision. Here is how to approach each one.</p>

    <h2>1. Curriculum — match it to where you are going, not where you are</h2>
    <p>The most important factor in curriculum choice is your likely university destination. If your child will apply to UK universities, A-levels or the IB are the natural paths. If US universities, the American curriculum with APs is cleaner. If you are genuinely unsure — because you move frequently — the IB is the most portable qualification in the world and is accepted everywhere.</p>
    <p>Secondary consideration: how many years until your child starts secondary? The younger they are, the less it matters right now — primary curricula are broadly similar across frameworks. The decisions that matter are at age 13–14, when children commit to IGCSE, MYP, or American middle school.</p>

    <h2>2. Quality — how to assess it honestly</h2>
    <p>School websites and prospectuses will tell you nothing honest about quality. Here is what to actually look for:</p>
    <p><strong>University destinations data:</strong> Ask any school for their graduating class destinations for the past three years — specifically the percentage who went to universities ranked in the global top 100. Strong schools share this data readily; weak schools deflect.</p>
    <p><strong>Teacher retention:</strong> Ask what the average teacher tenure is. High turnover (under 2 years average) is a significant quality signal — it usually indicates management problems, low salaries, or an environment where experienced teachers do not want to stay.</p>
    <p><strong>Inspection reports:</strong> British-curriculum schools are often inspected by the BSO, ISI, or similar bodies. Ask if the school has been inspected recently and request the report. Accredited schools (CIS, WASC, COBIS) have gone through external quality reviews.</p>

    <h2>3. Culture — will your child be happy?</h2>
    <p>This is the factor families underweight most. Academic results are important, but a child who is unhappy at school will not reach their academic potential regardless of the school's quality. When you visit, watch how students interact with each other and with teachers. Is it warm? Do children look comfortable? Is there diversity in the friendship groups you observe?</p>
    <p>Ask the admissions team: what do you do when a new student struggles to make friends in their first month? Their answer will tell you about the pastoral culture more than anything else.</p>

    <h2>4. Getting a place — be realistic and apply early</h2>
    <p>The best international schools in every city have waiting lists. Apply to your top three choices as early as possible — many schools will process overseas applications 12 months in advance. Have a backup school identified that you know has places available. Arriving in a new city without a school place is a stressful situation that is entirely avoidable with early planning.</p>
    <p>Use NanaSays to compare your shortlisted schools side by side — fees, curriculum, accreditations, boarding options, and more. <a href="/ask">Ask Nana</a> if you want a personalised recommendation based on your specific situation.</p>
  `,
}
